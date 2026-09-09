# Smile Bay — Defense Demo Checklist

Last updated: 2026-09-09. Keep this open on a second screen during the defense.

---

## 1. Startup

Run **`start-system.bat`** from the project root (`C:\xampp\htdocs\SMILE BAY SYSTEM`).
Also make sure **XAMPP → MySQL** is running first (Apache is not needed — the app uses `artisan serve`).

Three console windows open. Do **not** close any of them while demoing:

| Window | Command | What it is |
|---|---|---|
| **BACKEND** | `php82 artisan serve` | Laravel API on `http://localhost:8000` |
| **MAILMAN** | `php82 artisan queue:work` | Sends queued emails (appointment confirmations, reschedules, rejections). **Watch this window.** |
| **FRONTEND** | `npm run dev` | React app (Vite) on **`http://localhost:5173`** — this is the URL you open in the browser |

If you change `backend/.env` or an email template mid-session, **close and reopen the MAILMAN window** — the worker reads config once at startup.

---

## 2. Reading the MAILMAN window

Each appointment email shows up as one line:

- **`App\Mail\AppointmentConfirmedMail ............ DONE`** (green) — email sent to Gmail successfully.
- **`App\Mail\AppointmentConfirmedMail ............ FAIL`** (red) — the send failed (Gmail unreachable / blocked / auth).
  - The **booking still succeeded** and the patient still got the in-app bell notification — only the email did not go out.
  - See the failed job: open a 4th terminal in `backend\` → `php82 artisan queue:failed`
  - Resend it once Gmail is reachable again → `php82 artisan queue:retry all`
- **No line appears at all** after a booking → the MAILMAN window is not running, or crashed. Emails are piling up unsent in the `jobs` table. Restart `start-system.bat`.

**OTP / email-verification and password-reset emails are different** — they are sent *immediately* by the BACKEND window, not through MAILMAN. If SMTP is down during registration, the API still returns success and the verify screen shows a *"we couldn't send the code — use Resend"* notice instead of pretending a code was sent.

---

## 3. Test accounts

All five roles share one password: **`ChangeMe123!`**

| Role | Email | Password |
|---|---|---|
| Admin | `admin@test.com` | `ChangeMe123!` |
| Dental assistant | `assistant@test.com` | `ChangeMe123!` |
| Dentist — Dr. Ramirez | `dentist@test.com` | `ChangeMe123!` |
| Dentist — Dr. Castro | `castro@smilebaydental.com` | `ChangeMe123!` |
| Dentist — Pediatric (Dr. Santos) | `pediatric@smilebaydental.com` | `ChangeMe123!` |
| Patient | `christianlouiemundoy011@gmail.com` | _(your own)_ |

All five logins above were verified working (HTTP 200, correct role) on 2026-09-09.

- `luwi11@gmail.com` ("LUWI") is a **deactivated** dentist account — left inactive on purpose. Don't use it; if you try to log in it returns *"Your account has been deactivated."*
- For a live registration demo, use a real Gmail address with a `+alias` (e.g. `yourname+demo1@gmail.com`) so the OTP actually lands in an inbox you can open.

---

## 4. Recommended demo flow (in order)

1. **Landing page** → `http://localhost:5173` → **Sign Up**.
2. **Register** a new patient with a real `+alias` email. You land on the verify screen → open the inbox → enter the 6-digit code → verified → log in.
3. **Patient portal**
   - Dashboard (upcoming appointment, recent activity).
   - **Book Appointment**: service → dentist → date → time slot → Confirm. A **cash** patient is auto-confirmed — watch MAILMAN show `AppointmentConfirmedMail ... DONE`, then show the email in the inbox.
   - **My Appointments** — upcoming / past / cancelled tabs; cancel an upcoming one.
4. **Log out → log in as Dental Assistant**
   - **All Appointments** — filters, search, status, pagination.
   - **HMO Verification Queue** — approve or decline a pending HMO booking → the patient is notified by email + bell.
5. **Log out → log in as Dr. Castro (dentist)** (`castro@smilebaydental.com`)
   - **My Schedule** — under **Today** there is a confirmed **10:00 AM — louie mundoy — Comprehensive Consultation** (appointment #140). Expand it → **Complete**.
   - The row stays visible as *Completed*; expand it again → **Add Visit Record** → the patient's record opens with a clinical-note box pre-filled as *"Linked to the completed visit on 2026-09-09 at 10:00 AM"* → type a note → **Save Note**.
   - **My Availability** — weekly hours + a day off.
6. **Log out → log in as Pediatric Dentist**
   - **Pediatric Queue** — approve a pediatric booking (this is the gate before staff HMO verification for pediatric HMO bookings).
7. **Log out → log in as Admin**
   - **Dashboard** — stat cards + charts.
   - **User Management** — create a staff user; deactivate one and show they lose access immediately on their next action.
   - **Settings** — clinic info, services, HMO providers.
   - **Reports** — appointment volume, status mix, payment split.
8. **Password reset** — from the login page → **Forgot Password** → email → 6-digit code → set new password → sign in.

---

## 5. Known limitations (answer honestly if asked)

- **Single 807 KB JavaScript bundle, no code splitting.** The whole SPA ships as one ~808 KB file (~237 KB gzipped) on first load. Fine over localhost; a production build would want route-based code-splitting.
- **The verify-email screen always starts a fresh 60-second "Resend code" countdown on arrival**, no matter when the last code was actually sent. A user who genuinely waited 10 minutes still waits another 60 seconds before "Resend Code" becomes clickable.
- **The verify-email screen's copy doesn't adapt to a returning or expired user.** It always reads *"We've sent a 6-digit verification code to …"*, even hours later or after the code has expired (10-minute lifetime).
- **The register wizard offers no "you already have an unverified account, go verify it" path.** Re-registering the same email just returns *"This email is already registered"* and points the user to the login page (from there, an unverified login shows a *"Go to verification page"* link).
- **One OTP row per user.** If an unverified user uses **Forgot Password**, it overwrites their pending email-verification code (the same row is reused, its purpose switched to `password_reset`). They then have to use **Resend Code** on the verify screen to get a new verification code.
- **API routes without a `role:` guard don't re-check account status mid-session.** A user deactivated while logged in loses access to every role-gated page on their next request, but could still read their own profile and notifications until the session naturally expires.
- **Unverified accounts are never cleaned up.** Registering and not verifying leaves a permanent `users` row that keeps holding that email address; there is no expiry or purge job.
- **Dentist profile rows are incomplete.** Dr. Ramirez (`dentist@test.com`) has **no `dentist_profiles` row at all** — his specialization, bio, years of experience and photo render blank on the booking doctor-picker, schedule and records. Dr. Santos's row is missing **bio** and **years of experience** (has specialization + a stock photo). The inactive LUWI account has no row either but never appears anywhere. Fix from **My Profile → Professional Information** (and **Change Photo**) while logged in as each dentist — see section 6.
- **Appointment emails depend on the MAILMAN window being open.** If it is closed, appointment confirmation / reschedule / rejection emails queue in the database and never send, with no error shown to staff or patients (see section 2).
- **Rejection / cancellation reason is optional everywhere.** Neither the frontend nor the backend requires a reason when rejecting an HMO booking, rejecting a pediatric booking, or cancelling an appointment. If sent blank, the patient's email shows a generic line — *"Please contact the clinic for more details about your HMO coverage."* — even for a pediatric rejection or a plain cancellation, where that HMO wording doesn't fit. Always type a reason on stage.

---

## 6. Filling in the dentist profiles (do this before the demo)

Log in as **each dentist** → sidebar **My Profile** (`/dentist/profile`). Everything below is self-service; saving any text field creates the `dentist_profiles` row if it's missing.

**Fields, and where they are on the page:**

| Field | Location on My Profile | Type | Shows up on |
|---|---|---|---|
| Photo | Top of page → **Change Photo** button | JPG / PNG / WEBP, ≤ 4 MB | Booking doctor-picker card, schedule avatar, records header |
| Specialization | **Professional Information** section → *Specialization* | text (e.g. "General Dentistry, Orthodontics") | Booking doctor-picker card |
| Years of Experience | **Professional Information** → *Years of Experience* | number (0–80) | Booking doctor-picker card |
| Bio | **Professional Information** → *Bio* | paragraph — "shown on the clinic's dentist listing" | Booking doctor-picker card |

`license_number` exists in the table but is **not editable in the UI and not displayed anywhere** — ignore it.

**What each dentist needs:**

- **Dr. Ramirez** (`dentist@test.com`) — everything: Photo, Specialization, Years of Experience, Bio.
- **Dr. Santos** (`pediatric@smilebaydental.com`) — has Specialization ("Pediatric Dentistry Specialist") and a stock photo already. Add: **Bio**, **Years of Experience**. Optionally replace the stock photo with a real one.
- **Dr. Castro** (`castro@smilebaydental.com`) — Specialization, Bio, Years of Experience already filled. Optionally add a Photo (currently shows initials).

---

## 7. Demo data seeded for this run (2026-09-09)

| Appt | Patient | Dentist | Service | When | Status | Use it to show |
|---|---|---|---|---|---|---|
| #140 | louie mundoy | Dr. Castro | Comprehensive Consultation | **today 10:00** | confirmed | **Complete → Add Visit Record** (step 5) |
| #138 | louie mundoy | Dr. Ramirez | Cleaning (Oral Prophylaxis) | Fri 09-11 10:00 | confirmed | Ramirez's schedule isn't empty |
| #139 | Christian Louie Mundoy | Dr. Santos | Pediatric Consultation | Sat 09-12 10:00 | confirmed | Santos's schedule isn't empty |
| #137 | Gwaine Rosche Matuba | Dr. Ramirez | Simple Tooth Extraction | Sat 09-12 11:00 | pending (HMO) | **HMO Verification Queue** approve/decline (step 4) |
| #117 | (pre-existing) | Dr. Castro | Comprehensive Consultation | Fri 09-11 09:30 | pending (HMO) | second item in the HMO queue |
| #135 | (pre-existing) | Dr. Santos | Pediatric Consultation | Thu 09-10 09:00 | pending | **Pediatric Queue** approve/decline (step 6) |

Existing history also present: 2 completed visits (Aug), 4 cancelled, 1 rejected, ~11 confirmed across August–September, plus populated dental records (tooth charts, treatment plans, treatment history) and unread notifications on several accounts.
