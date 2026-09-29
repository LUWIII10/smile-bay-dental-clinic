<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Mail\OtpMail;
use App\Models\ActivityLog;
use App\Models\EmailOtp;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class AuthController extends Controller
{
    private const OTP_TTL_MINUTES = 10;
    private const OTP_RESEND_COOLDOWN_SECONDS = 60;
    private const OTP_MAX_ATTEMPTS = 5;

    // Set by issueOtp() on every call: true if the OTP email actually went
    // out, false if the mail send threw (SMTP down, etc). Callers read this
    // to tell the user the truth instead of "check your email" for a code
    // that will never arrive. Per-request controller instance, issueOtp()
    // runs at most once per request, so this is safe to hold as state.
    private bool $otpEmailDelivered = true;

    /**
     * Register a new patient account (creates users + patients rows) and
     * send a one-time email verification code. The account cannot log in
     * until it is verified via verifyOtp().
     * Self-registration is only allowed for the "patient" role —
     * dentist/dental_assistant/admin accounts are created manually by an admin.
     */
    public function register(RegisterRequest $request)
    {
        $validated = $request->validated();

        $user = DB::transaction(function () use ($validated) {
            $fullName = trim(preg_replace('/\s+/', ' ',
                $validated['first_name'].' '.($validated['middle_name'] ?? '').' '.$validated['last_name']
            ));

            $user = User::create([
                'name' => $fullName,
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'mobile_number' => $validated['mobile_number'],
                'role' => 'patient',
                'status' => 'active',
            ]);

            $patient = Patient::create([
                'user_id' => $user->id,
                'first_name' => $validated['first_name'],
                'middle_name' => $validated['middle_name'] ?? null,
                'last_name' => $validated['last_name'],
                'date_of_birth' => $validated['date_of_birth'],
                'sex' => $validated['sex'],
                'civil_status' => $validated['civil_status'] ?? null,
                'nationality' => $validated['nationality'] ?? null,
                'religion' => $validated['religion'] ?? null,
                'occupation' => $validated['occupation'] ?? null,
                'address_line' => $validated['complete_address'],
                'emergency_contact_name' => $validated['emergency_contact_name'],
                'emergency_contact_relationship' => $validated['emergency_contact_relationship'],
                'emergency_contact_number' => $validated['emergency_contact_number'],
                'guardian_name' => $validated['guardian_name'] ?? null,
                'guardian_relationship' => $validated['guardian_relationship'] ?? null,
                'guardian_contact_number' => $validated['guardian_contact_number'] ?? null,
                'blood_type' => $validated['blood_type'] ?? null,
                'allergies' => $validated['allergies'] ?? null,
                'current_medications' => $validated['current_medications'] ?? null,
                'medical_conditions' => $validated['medical_conditions'] ?? null,
                'medical_conditions_other' => $validated['medical_conditions_notes'] ?? null,
                'previous_surgeries' => $validated['previous_surgeries'] ?? null,
                'last_physical_exam' => $validated['last_physical_exam'] ?? null,
                'physician_name_specialty' => $validated['physician_name_specialty'] ?? null,
                'last_dental_visit' => $validated['last_dental_visit'] ?? null,
                'last_dental_treatment' => $validated['last_dental_treatment'] ?? null,
                'brushing_frequency' => $validated['brushing_frequency'] ?? null,
                'dental_procedures_history' => $validated['dental_procedures_history'] ?? null,
                'current_dental_symptoms' => $validated['current_dental_symptoms'] ?? null,
                'visit_reason' => $validated['visit_reason'] ?? null,
                'patient_type' => $validated['patient_type'],
                'hmo_provider_id' => $validated['patient_type'] === 'hmo' ? $validated['hmo_provider_id'] : null,
                'hmo_number' => $validated['patient_type'] === 'hmo' ? $validated['hmo_number'] : null,
                'hmo_company_name' => $validated['patient_type'] === 'hmo' ? $validated['hmo_company_name'] : null,
                'consent_certified' => true,
            ]);

            // Same transaction as the patient row itself — the id needed to
            // format the number only exists once the row is actually
            // inserted, so this has to be a second statement, not part of
            // the create() above.
            $patient->update(['patient_number' => Patient::formatPatientNumber($patient->id, $patient->created_at)]);

            return $user;
        });

        ActivityLog::record($user->id, 'account_created', "{$user->name} registered a new patient account.");

        $this->issueOtp($user);

        return response()->json([
            // The account row is committed either way; only the email delivery
            // differs. Tell the user which actually happened so a failed send
            // doesn't leave them waiting on the verify screen for nothing.
            'message' => $this->otpEmailDelivered
                ? 'Registration successful. Please check your email for a verification code.'
                : 'Your account was created, but we could not send the verification email right now. On the next screen, tap "Resend code" in a moment to try again.',
            'email' => $user->email,
            'email_sent' => $this->otpEmailDelivered,
            'retry_after' => self::OTP_RESEND_COOLDOWN_SECONDS,
        ], 201);
    }

    /**
     * Live email-uniqueness check used by the registration wizard's email
     * field (onBlur). Public endpoint — the patient has no account yet.
     * This is a UX convenience only; RegisterRequest's unique:users,email
     * rule remains the authoritative check on submit.
     */
    public function checkEmail(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $taken = User::where('email', $validated['email'])->exists();

        return response()->json(['available' => ! $taken]);
    }

    /**
     * Verify a submitted OTP code and activate the account.
     */
    public function verifyOtp(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'otp' => ['required', 'string', 'size:6'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user) {
            return response()->json(['message' => 'We could not find a pending registration for that email.'], 404);
        }

        if ($user->email_verified_at) {
            return response()->json(['message' => 'This email is already verified. Please log in.'], 409);
        }

        $otp = EmailOtp::where('user_id', $user->id)->where('purpose', 'email_verification')->first();

        if (! $otp) {
            return response()->json(['message' => 'No verification code found. Please request a new one.'], 422);
        }

        if ($otp->consumed_at) {
            return response()->json(['message' => 'This code has already been used. Please request a new one.'], 422);
        }

        if (now()->greaterThan($otp->expires_at)) {
            return response()->json(['message' => 'This code has expired. Please request a new one.'], 422);
        }

        if ($otp->attempts >= self::OTP_MAX_ATTEMPTS) {
            return response()->json(['message' => 'Too many incorrect attempts. Please request a new code.'], 429);
        }

        if (! Hash::check($validated['otp'], $otp->otp_hash)) {
            $otp->increment('attempts');
            $remaining = max(self::OTP_MAX_ATTEMPTS - $otp->attempts, 0);

            return response()->json([
                'message' => "Invalid verification code. {$remaining} attempt(s) remaining.",
            ], 422);
        }

        $otp->update(['consumed_at' => now()]);
        $user->forceFill(['email_verified_at' => now()])->save();

        return response()->json(['message' => 'Email verified successfully.']);
    }

    /**
     * Generate and send a new OTP for an unverified account.
     */
    public function resendOtp(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user) {
            return response()->json(['message' => 'We could not find a pending registration for that email.'], 404);
        }

        if ($user->email_verified_at) {
            return response()->json(['message' => 'This email is already verified. Please log in.'], 409);
        }

        $existing = EmailOtp::where('user_id', $user->id)->where('purpose', 'email_verification')->first();

        if ($existing && $existing->last_sent_at) {
            // Carbon 3's diffInSeconds() is signed by default — must pass absolute:true,
            // otherwise a past last_sent_at produces a negative diff and this check misfires.
            $secondsSinceSent = now()->diffInSeconds($existing->last_sent_at, absolute: true);

            if ($secondsSinceSent < self::OTP_RESEND_COOLDOWN_SECONDS) {
                return response()->json([
                    'message' => 'Please wait before requesting another code.',
                    'retry_after' => self::OTP_RESEND_COOLDOWN_SECONDS - $secondsSinceSent,
                ], 429);
            }
        }

        $this->issueOtp($user, 'email_verification');

        if (! $this->otpEmailDelivered) {
            return response()->json([
                'message' => 'We could not send the verification email right now. Please wait a moment and try again.',
                'email_sent' => false,
                'retry_after' => self::OTP_RESEND_COOLDOWN_SECONDS,
            ], 502);
        }

        return response()->json([
            'message' => 'A new verification code has been sent to your email.',
            'email_sent' => true,
            'retry_after' => self::OTP_RESEND_COOLDOWN_SECONDS,
        ]);
    }

    /**
     * Send a password-reset OTP if the email matches an existing account.
     * Always responds with the same generic message regardless of whether
     * the email exists — enumeration prevention. The actual send only
     * happens internally when a matching user is found.
     */
    public function forgotPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
        ]);

        // retry_after is included even when no account matches — the response
        // shape must be identical either way, or its mere presence/absence
        // becomes an enumeration signal of its own regardless of the message
        // text being generic.
        $genericResponse = [
            'message' => 'If an account with that email exists, a verification code has been sent.',
            'retry_after' => self::OTP_RESEND_COOLDOWN_SECONDS,
        ];

        $user = User::where('email', $validated['email'])->first();

        if (! $user) {
            return response()->json($genericResponse);
        }

        $existing = EmailOtp::where('user_id', $user->id)->where('purpose', 'password_reset')->first();

        if ($existing && $existing->last_sent_at) {
            $secondsSinceSent = now()->diffInSeconds($existing->last_sent_at, absolute: true);

            if ($secondsSinceSent < self::OTP_RESEND_COOLDOWN_SECONDS) {
                // Still generic on existence, but the cooldown itself is safe
                // to surface — the frontend needs it to drive the resend timer.
                return response()->json([
                    ...$genericResponse,
                    'retry_after' => self::OTP_RESEND_COOLDOWN_SECONDS - $secondsSinceSent,
                ]);
            }
        }

        $this->issueOtp($user, 'password_reset');

        return response()->json($genericResponse);
    }

    /**
     * Check a password-reset code without consuming it — lets the frontend
     * give immediate "wrong code" feedback before the user even reaches the
     * new-password screen. resetPassword() below re-validates and actually
     * consumes it; a stolen/replayed code still can't reset a password
     * without going through that same check, so nothing is weakened by
     * this step being non-consuming.
     */
    public function verifyResetOtp(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'otp' => ['required', 'string', 'size:6'],
        ]);

        $error = $this->checkResetOtp($validated['email'], $validated['otp']);

        if ($error) {
            return $error;
        }

        return response()->json(['message' => 'Code verified.']);
    }

    /**
     * Re-validate the reset code and, if valid, set the new password and
     * consume the code so it can't be replayed. All existing sessions for
     * the account are invalidated so a stale logged-in session elsewhere
     * doesn't outlive the password change.
     */
    public function resetPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'otp' => ['required', 'string', 'size:6'],
            'password' => [
                'required',
                'string',
                'min:8',
                'confirmed',
                'regex:/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/',
            ],
        ], [
            'password.confirmed' => 'Password confirmation does not match.',
            'password.regex' => 'Password must include an uppercase letter, a number, and a special character.',
        ]);

        $error = $this->checkResetOtp($validated['email'], $validated['otp']);

        if ($error) {
            return $error;
        }

        $user = User::where('email', $validated['email'])->first();

        DB::transaction(function () use ($user, $validated) {
            $user->forceFill(['password' => Hash::make($validated['password'])])->save();

            EmailOtp::where('user_id', $user->id)
                ->where('purpose', 'password_reset')
                ->update(['consumed_at' => now()]);

            DB::table('sessions')->where('user_id', $user->id)->delete();
        });

        return response()->json(['message' => 'Password reset successfully. Please sign in with your new password.']);
    }

    /**
     * Shared validation for verifyResetOtp() and resetPassword() — both
     * need the identical set of checks, just with different follow-up
     * actions. Returns null when the code is valid, or a ready-to-return
     * error JsonResponse otherwise. Deliberately generic wording throughout
     * (never distinguishes "no such user" from "wrong code") to match
     * forgotPassword()'s enumeration prevention.
     */
    private function checkResetOtp(string $email, string $otp)
    {
        $genericError = response()->json(['message' => 'Invalid or expired verification code.'], 422);

        $user = User::where('email', $email)->first();

        if (! $user) {
            return $genericError;
        }

        $record = EmailOtp::where('user_id', $user->id)->where('purpose', 'password_reset')->first();

        if (! $record || $record->consumed_at || now()->greaterThan($record->expires_at)) {
            return $genericError;
        }

        if ($record->attempts >= self::OTP_MAX_ATTEMPTS) {
            return response()->json(['message' => 'Too many incorrect attempts. Please request a new code.'], 429);
        }

        if (! Hash::check($otp, $record->otp_hash)) {
            $record->increment('attempts');

            return $genericError;
        }

        return null;
    }

    /**
     * Create (or replace) the OTP for a user, email it, and return the plain code.
     * A failed email send is caught and logged (never a 500) — the OTP row is
     * already persisted, so the code is valid; $this->otpEmailDelivered is set
     * to false so the caller can tell the user to use "Resend code".
     */
    private function issueOtp(User $user, string $purpose = 'email_verification'): string
    {
        $plainOtp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        EmailOtp::updateOrCreate(
            ['user_id' => $user->id],
            [
                'purpose' => $purpose,
                'otp_hash' => Hash::make($plainOtp),
                'expires_at' => now()->addMinutes(self::OTP_TTL_MINUTES),
                'attempts' => 0,
                'last_sent_at' => now(),
                'consumed_at' => null,
            ]
        );

        try {
            Mail::to($user->email)->send(new OtpMail($user, $plainOtp, self::OTP_TTL_MINUTES, $purpose));
            $this->otpEmailDelivered = true;
        } catch (\Throwable $e) {
            $this->otpEmailDelivered = false;
            Log::warning('OTP email failed to send', [
                'user_id' => $user->id,
                'purpose' => $purpose,
                'error' => $e->getMessage(),
            ]);
        }

        return $plainOtp;
    }

    /**
     * Log in an existing user via session-based (Sanctum) authentication.
     * Blocks accounts that haven't verified their email yet or are inactive.
     */
    public function login(LoginRequest $request)
    {
        $credentials = $request->validated();

        if (! Auth::attempt($credentials)) {
            return response()->json([
                'message' => 'Invalid email or password.',
            ], 401);
        }

        $user = Auth::user();

        if (! $user->email_verified_at) {
            Auth::logout();

            return response()->json([
                'message' => 'Please verify your email before logging in.',
                'unverified' => true,
                'email' => $user->email,
            ], 403);
        }

        if ($user->status !== 'active') {
            Auth::logout();

            return response()->json([
                'message' => 'Your account has been deactivated. Please contact the clinic.',
            ], 403);
        }

        $request->session()->regenerate();

        return response()->json([
            'message' => 'Login successful.',
            'user' => $this->serializeUser($user->load('patient.hmoProvider', 'dentistProfile')),
        ]);
    }

    /**
     * Log out the currently authenticated user.
     */
    public function logout(Request $request)
    {
        // Auth::logout() (unqualified) resolves against Sanctum's RequestGuard
        // inside auth:sanctum-protected routes, which has no logout() method —
        // throws BadMethodCallException. This app authenticates via the normal
        // session-backed 'web' guard (SPA cookie auth, not API tokens), so the
        // guard must be named explicitly to reach SessionGuard::logout().
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'message' => 'Logout successful.',
        ]);
    }

    /**
     * Get the currently authenticated user's data.
     * Used by the React frontend to check login state and role on page load.
     * Eager-loads the linked patient row (when the user is a patient) since
     * the booking wizard's read-only "Payment Method" step needs
     * patient_type without a second round-trip — also eager-loads the
     * patient's hmoProvider so that step can show the real provider name
     * ("Medicard", "Flexicare") instead of just the raw hmo_provider_id,
     * without a second request. Purely additive: existing consumers of
     * /auth/me are unaffected, this only adds a nested key.
     */
    public function me(Request $request)
    {
        return response()->json([
            // dentistProfile added alongside patient.hmoProvider so the
            // sidebar/topbar avatar can resolve a dentist's photo_path —
            // previously only My Profile's own /profile endpoint loaded it.
            'user' => $this->serializeUser($request->user()->load('patient.hmoProvider', 'dentistProfile')),
        ]);
    }

    /**
     * is_pediatric_dentist merged in as a plain extra key (not a model
     * $append) — it's only ever needed on this auth payload, for the
     * sidebar to decide whether to show "Pediatric Queue" at all, so
     * computing it on every User serialization app-wide would be wasted
     * queries everywhere else a User gets turned into JSON.
     */
    private function serializeUser(User $user): array
    {
        return [...$user->toArray(), 'is_pediatric_dentist' => $user->isPediatricDentist()];
    }
}
