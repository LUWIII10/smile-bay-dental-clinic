<?php

use App\Http\Controllers\Api\Admin\ClinicSettingsController;
use App\Http\Controllers\Api\Admin\ReportsController;
use App\Http\Controllers\Api\Admin\UserManagementController;
use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\Auth\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DentistAvailabilityController;
use App\Http\Controllers\Api\DentistController;
use App\Http\Controllers\Api\DentistScheduleController;
use App\Http\Controllers\Api\HmoProviderController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PatientAppointmentController;
use App\Http\Controllers\Api\PediatricVerificationController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\Records\PatientDentalRecordController;
use App\Http\Controllers\Api\Records\PatientRecordController;
use App\Http\Controllers\Api\ScheduleController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\StaffAppointmentController;
use App\Http\Controllers\Api\StaffVerificationController;
use Illuminate\Support\Facades\Route;

// Public — the registration wizard's HMO dropdown needs this before the
// patient has an account, so it sits outside the auth:sanctum group.
Route::get('/hmo-providers', [HmoProviderController::class, 'index']);

// Public — live email-uniqueness check for the registration wizard.
// Throttled per-IP: the wizard fires this a handful of times per sign-up
// (onBlur of the email field), so 20/min is ample for real use while
// blunting scripted account-enumeration against the endpoint.
Route::get('/check-email', [AuthController::class, 'checkEmail'])->middleware('throttle:20,1');

Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);

    Route::middleware('throttle:10,1')->group(function () {
        Route::post('/verify-otp', [AuthController::class, 'verifyOtp']);
        Route::post('/resend-otp', [AuthController::class, 'resendOtp']);
        Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
        Route::post('/verify-reset-otp', [AuthController::class, 'verifyResetOtp']);
        Route::post('/reset-password', [AuthController::class, 'resetPassword']);
    });

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
    });
});

// Appointment scheduling module — reference data (services/dentists/slots)
// is readable by any authenticated role, since staff-side screens will need
// the same lookups later. Only booking itself is patient-only.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/services', [ServiceController::class, 'index']);
    Route::get('/dentists', [DentistController::class, 'index']);
    Route::get('/schedules/available-slots', [ScheduleController::class, 'availableSlots']);
    Route::get('/schedules/day-availability', [ScheduleController::class, 'dayAvailability']);
    Route::get('/schedules/resolve-dentist', [ScheduleController::class, 'resolveDentist']);

    // My Profile — every role's own account, scoped to the authenticated
    // user inside the controller, so this deliberately has no role: gate.
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::patch('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/change-password', [ProfileController::class, 'changePassword']);
    Route::post('/profile/avatar', [ProfileController::class, 'uploadAvatar']);
    Route::delete('/profile/avatar', [ProfileController::class, 'removeAvatar']);

    // Topbar bell — every role, scoped to the authenticated user inside
    // the controller, so this deliberately has no role: gate either.
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::patch('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);

    Route::middleware('role:patient')->group(function () {
        Route::post('/appointments', [AppointmentController::class, 'store']);
        Route::get('/patient/appointments', [PatientAppointmentController::class, 'index']);
        Route::get('/patient/follow-up-recommendations', [PatientAppointmentController::class, 'followUpRecommendations']);
        Route::patch('/patient/appointments/{appointment}/cancel', [PatientAppointmentController::class, 'cancel']);
        Route::patch('/patient/appointments/{appointment}/accept-proposed-date', [PatientAppointmentController::class, 'acceptProposedDate']);
        Route::patch('/patient/appointments/{appointment}/request-different-date', [PatientAppointmentController::class, 'requestDifferentDate']);
        Route::get('/patient/dental-record', [PatientDentalRecordController::class, 'show']);
        Route::get('/patient/dashboard-summary', [PatientAppointmentController::class, 'summary']);
    });

    Route::middleware('role:dentist')->group(function () {
        Route::get('/dentist/schedule', [DentistScheduleController::class, 'index']);
        Route::get('/dentist/dashboard-summary', [DentistScheduleController::class, 'summary']);
        Route::get('/dentist/completed-patients', [DentistScheduleController::class, 'completedPatients']);
        Route::patch('/appointments/{appointment}/complete', [AppointmentController::class, 'complete']);
        Route::patch('/appointments/{appointment}/backfill-record', [AppointmentController::class, 'backfillRecord']);
        Route::patch('/appointments/{appointment}/reschedule', [AppointmentController::class, 'reschedule']);
        Route::patch('/appointments/{appointment}/cancel', [AppointmentController::class, 'cancel']);

        // "My Availability" — scoped to the authenticated dentist inside the
        // controller (never a route/body-supplied dentist id), so a dentist
        // can only ever see/change their own hours.
        Route::get('/dentist/availability', [DentistAvailabilityController::class, 'index']);
        Route::put('/dentist/availability/weekly-hours', [DentistAvailabilityController::class, 'updateWeeklyHours']);
        Route::post('/dentist/availability/day-off', [DentistAvailabilityController::class, 'storeDayOff']);
        Route::delete('/dentist/availability/day-off/{id}', [DentistAvailabilityController::class, 'destroyDayOff']);

        // Shared by every dentist account — scoping to dentist_id = auth
        // user inside the controller means a non-pediatric dentist just
        // sees an empty queue, so this doesn't need its own role.
        Route::get('/pediatric/queue', [PediatricVerificationController::class, 'index']);
        Route::patch('/pediatric/appointments/{appointment}/verify', [PediatricVerificationController::class, 'verify']);
        Route::patch('/pediatric/appointments/{appointment}/propose-new-date', [PediatricVerificationController::class, 'proposeNewDate']);

        // Dental-record writes are dentist-only (matches those tables' own
        // migration doc comments) — reads sit in the shared
        // dentist/dental_assistant/admin group below instead.
        Route::post('/patient-records/{patient}/clinical-notes', [PatientRecordController::class, 'storeClinicalNote']);
        Route::put('/patient-records/{patient}/tooth-conditions/{toothNumber}', [PatientRecordController::class, 'updateToothCondition']);
        Route::post('/patient-records/{patient}/treatment-plans', [PatientRecordController::class, 'storeTreatmentPlan']);
        Route::patch('/treatment-plans/{treatmentPlan}/status', [PatientRecordController::class, 'updateTreatmentPlanStatus']);
        Route::patch('/treatment-plan-items/{treatmentPlanItem}', [PatientRecordController::class, 'updateTreatmentPlanItem']);
        Route::post('/patient-records/{patient}/treatment-history', [PatientRecordController::class, 'storeTreatmentHistory']);
        Route::patch('/patient-records/{patient}/primary-dentist', [PatientRecordController::class, 'updatePrimaryDentist']);
    });

    Route::middleware('role:dentist,dental_assistant,admin')->group(function () {
        Route::get('/patient-records', [PatientRecordController::class, 'index']);
        // Must resolve before /patient-records/{patient} below, or Laravel
        // tries (and fails) to route-model-bind "by-date" as a patient id —
        // same reasoning as /staff/appointments/stats above {appointment}.
        Route::get('/patient-records/by-date', [PatientRecordController::class, 'appointmentsByDate']);
        // Same ordering reason as by-date above, one level deeper — this
        // must resolve before /patient-records/{patient}/pdf, or Laravel
        // tries to route-model-bind "by-date" as {patient} there instead.
        Route::get('/patient-records/by-date/pdf', [PatientRecordController::class, 'appointmentsByDatePdf']);
        Route::get('/patient-records/{patient}', [PatientRecordController::class, 'show']);
        Route::get('/patient-records/{patient}/pdf', [PatientRecordController::class, 'showPdf']);
    });

    Route::middleware('role:dental_assistant,admin')->group(function () {
        Route::get('/staff/verification-queue', [StaffVerificationController::class, 'index']);
        Route::patch('/staff/appointments/{appointment}/verify', [StaffVerificationController::class, 'verify']);
        Route::post('/staff/appointments/{appointment}/notify-status', [StaffVerificationController::class, 'sendStatusUpdate']);
        Route::patch('/staff/appointments/{appointment}/hmo-info', [StaffVerificationController::class, 'updateHmoInfo']);
        Route::get('/staff/appointments/{appointment}/available-slots', [StaffVerificationController::class, 'availableSlotsForEdit']);

        Route::get('/staff/appointments', [StaffAppointmentController::class, 'index']);
        // /stats must resolve before the {appointment} route below, or Laravel
        // tries (and fails) to route-model-bind "stats" as an appointment id.
        Route::get('/staff/appointments/stats', [StaffAppointmentController::class, 'stats']);
        Route::get('/staff/patients/search', [StaffAppointmentController::class, 'searchPatients']);
        Route::post('/staff/patients', [StaffAppointmentController::class, 'registerWalkInPatient']);
        Route::post('/staff/appointments/walk-in', [StaffAppointmentController::class, 'assignWalkIn']);
        Route::get('/staff/appointments/{appointment}', [StaffAppointmentController::class, 'show']);
        Route::patch('/staff/appointments/{appointment}/cancel', [StaffAppointmentController::class, 'cancel']);
        Route::patch('/staff/appointments/{appointment}/no-show', [StaffAppointmentController::class, 'noShow']);
        Route::post('/staff/appointments/{appointment}/enable-follow-up', [StaffAppointmentController::class, 'enableFollowUp']);

        Route::get('/staff/dashboard-summary', [DashboardController::class, 'staffSummary']);
        Route::get('/staff/recent-activity', [DashboardController::class, 'recentActivity']);
    });

    Route::middleware('role:admin')->group(function () {
        Route::get('/admin/users', [UserManagementController::class, 'index']);
        Route::post('/admin/users', [UserManagementController::class, 'store']);
        Route::patch('/admin/users/{user}', [UserManagementController::class, 'update']);
        Route::patch('/admin/users/{user}/status', [UserManagementController::class, 'updateStatus']);
        Route::patch('/admin/users/{user}/unrestrict-booking', [UserManagementController::class, 'unrestrictBooking']);

        Route::get('/admin/settings', [ClinicSettingsController::class, 'show']);
        Route::put('/admin/settings/clinic-info', [ClinicSettingsController::class, 'updateClinicInfo']);
        Route::put('/admin/settings/schedule', [ClinicSettingsController::class, 'updateSchedule']);
        Route::post('/admin/settings/services', [ClinicSettingsController::class, 'storeService']);
        Route::patch('/admin/settings/services/{service}', [ClinicSettingsController::class, 'updateService']);
        Route::patch('/admin/settings/services/{service}/toggle-active', [ClinicSettingsController::class, 'toggleServiceActive']);
        Route::post('/admin/settings/hmo-providers', [ClinicSettingsController::class, 'storeHmoProvider']);
        Route::patch('/admin/settings/hmo-providers/{hmoProvider}', [ClinicSettingsController::class, 'updateHmoProvider']);
        Route::patch('/admin/settings/hmo-providers/{hmoProvider}/toggle-active', [ClinicSettingsController::class, 'toggleHmoProviderActive']);

        Route::get('/admin/reports/overview', [ReportsController::class, 'overview']);
        Route::get('/admin/reports/overview/pdf', [ReportsController::class, 'downloadPdf']);
    });
});