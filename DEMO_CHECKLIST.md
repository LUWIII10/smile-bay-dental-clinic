# Smile Bay — Defense Demo Checklist

Last updated: 2026-09-12. Keep this open on a second screen during the defense.

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

**Then, before every demo or rehearsal**, in a terminal in `backend\`:

```
php82 artisan demo:refresh
```

This re-dates the seven fixed demo appointments relative to today and undoes anything a rehearsal changed (an "Complete" click, an HMO/pediatric approve or reject) — see §7 for exactly what it does and which rows it touches. Safe to run as many times as you like; it never creates a new row, so re-running it 5 times in a row still leaves exactly the same 7 demo appointments, just re-dated.

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

Staff/dentist accounts and the fallback patient all share one password: **`ChangeMe123!`**

| Role | Email | Password |
|---|---|---|
| Admin | `admin@test.com` | `ChangeMe123!` |
| Dental assistant | `assistant@test.com` | `ChangeMe123!` |
| Dentist — Dr. Ramirez | `dentist@test.com` | `ChangeMe123!` |
| Dentist — Dr. Castro | `castro@smilebaydental.com` | `ChangeMe123!` |
| Dentist — Pediatric (Dr. Santos) | `pediatric@smilebaydental.com` | `ChangeMe123!` |
| Patient — **fallback** (pre-verified) | `bea.alcantara@gmail.com` | `ChangeMe123!` |
| Patient — live OTP demo | `christianlouiemundoy011@gmail.com` | _(your own — not written here)_ |

All logins in the table (except the last row) were verified working against the real login endpoint (HTTP 200, correct role) on 2026-09-09.

**The fallback patient `bea.alcantara@gmail.com`** is already `email_verified_at` + `active`, so it skips OTP entirely. It has one **completed** visit (Aug 19, Dr. Castro — Cleaning) and one **upcoming confirmed** appointment (Sep 11, Dr. Castro — Consultation), so the patient dashboard and every My Appointments tab have content. Use it if the live registration in step 2 fails.

- `luwi11@gmail.com` ("LUWI") is a **deactivated** dentist account — left inactive on purpose. Don't use it; if you try to log in it returns *"Your account has been deactivated."*
- For a live registration demo, use a real Gmail address with a `+alias` (e.g. `yourname+demo1@gmail.com`) so the OTP actually lands in an inbox you can open.

---

## 4. Recommended demo flow (in order)

1. **Landing page** → `http://localhost:5173` → **Sign Up**.
2. **Register** a new patient with a real `+alias` email. You land on the verify screen → open the inbox → enter the 6-digit code → verified → log in.
   > **If the OTP email doesn't arrive** (weak venue wifi / school network blocking SMTP): don't wait it out. Go to the login page and sign in with the fallback account **`bea.alcantara@gmail.com` / `ChangeMe123!`**, then continue from step 3. Mention that registration + OTP was shown to work earlier / in the video if you have one.
3. **Patient portal**
   - Dashboard (upcoming appointment, recent activity).
   - **Book Appointment**: service → dentist → date → time slot → Confirm. A **cash** patient is auto-confirmed — watch MAILMAN show `AppointmentConfirmedMail ... DONE`, then show the email in the inbox.
   - **My Appointments** — upcoming / past / cancelled tabs; cancel an upcoming one.
4. **Log out → log in as Dental Assistant**
   - **All Appointments** — filters, search, status, pagination.
   - **HMO Verification Queue** — approve or decline a pending HMO booking → the patient is notified by email + bell.
5. **Log out → log in as Dr. Castro (dentist)** (`castro@smilebaydental.com`)
   - **My Schedule** — under **Today** there is a confirmed **10:00 AM — louie mundoy — Comprehensive Consultation** (appointment #140). Expand it → **Complete**.
   - The row stays visible as *Completed*; expand it again → **Add Visit Record** → the patient's record opens with a clinical-note box pre-filled as *"Linked to the completed visit on \<today's date\> at 10:00 AM"* → type a note → **Save Note**. (Ran `demo:refresh` after a rehearsal? #140 is back to confirmed — do the Complete click again, it's not a one-shot.)
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
- **Dentist profile rows.** Dr. Ramirez's (`dentist@test.com`) specialization, bio, years of experience and photo are being filled in now via **My Profile → Professional Information** (and **Change Photo**). Once that's done, the only remaining gap is Dr. Santos's row, which is missing **bio** and **years of experience** (already has specialization + a stock photo) — fix the same way while logged in as her. See section 6.
- **Appointment emails depend on the MAILMAN window being open.** If it is closed, appointment confirmation / reschedule / rejection emails queue in the database and never send, with no error shown to staff or patients (see section 2).
- **Rejection / cancellation reason is optional everywhere.** Neither the frontend nor the backend requires a reason when rejecting an HMO booking, rejecting a pediatric booking, or cancelling an appointment. If sent blank, the patient's email shows a generic line — *"Please contact the clinic for more details about your HMO coverage."* — even for a pediatric rejection or a plain cancellation, where that HMO wording doesn't fit. Always type a reason on stage.
- **Admin-created staff accounts get a random 12-character temporary password**, shown once to the admin and handed off out-of-band. There is no forced password change on first login, so a temporary password can remain permanent if nobody changes it. The account is created pre-verified and pre-active by design — the admin's act of provisioning is the identity check, which is the standard pattern for admin-provisioned accounts.
- **The portal shows the page name twice on most screens** — once in the topbar (from the nav config) and once as the page's own heading. Cosmetic redundancy, not a defect. Consolidating it would either lose the more descriptive headings on the Pediatric and HMO queues, or leave Book Appointment and the dashboards with no title at all, so it's left as-is.
- **Column sorting is only available in the desktop table view.** Below 1400px the table switches to stacked cards and the header row — which hosts the sort control — is hidden, so there is no click-to-sort affordance in card mode. This applies to every table in the portal, not just Appointments. Filtering and search remain fully available in both views.
- **Current account inventory.** Three dentist accounts (Ramirez, Castro, and Santos as the consulting pediatric dentist), eleven patient accounts, one dental assistant, one admin. Fourteen development test accounts were removed before the defense.

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

## 7. Demo data — managed by `php artisan demo:refresh`

Seven appointments, identified **by hard-coded id only** (no name/pattern matching — nothing else can ever be touched by this command). Every run re-dates all seven relative to that day's "today" and force-resets status (and any verification/cancellation fields) back to the values below — so a rehearsal "Complete" click, or an approve/reject on a queue item, is undone the next time you run it. It never creates a new row: running it once or fifty times leaves exactly these seven ids.

| Appt id | Patient | Dentist | Service | When (relative to today) | Status every run | Use it to show |
|---|---|---|---|---|---|---|
| **140** | louie mundoy | Dr. Castro | Comprehensive Consultation | **today, 10:00** | confirmed | **Complete → Add Visit Record** (step 5) |
| **138** | louie mundoy | Dr. Ramirez | Cleaning (Oral Prophylaxis) | today + 2, 10:00 | confirmed | Ramirez's schedule isn't empty |
| **139** | Christian Louie Mundoy | Dr. Santos | Pediatric Consultation | today + 3, 10:00 | confirmed (pediatric-approved) | Santos's schedule isn't empty |
| **143** | louie mundoy | Dr. Santos | Pediatric Consultation | today + 2, 09:00 | pending, un-reviewed | **Pediatric Queue** approve/decline (step 6) |
| **137** | Gwaine Rosche Matuba | Dr. Ramirez | Simple Tooth Extraction | today + 4, 11:00 | pending (HMO) | **HMO Verification Queue** approve/decline (step 4) |
| **141** | Bea Alcantara (fallback acct) | Dr. Castro | Cleaning (Oral Prophylaxis) | today − 7, 11:00 | completed | fallback patient's past-visit tab |
| **142** | Bea Alcantara (fallback acct) | Dr. Castro | Comprehensive Consultation | today + 3, 11:00 | confirmed | fallback patient's dashboard + upcoming tab |

**Not managed, left alone on purpose** — two pre-existing appointments that happen to also serve as extra queue content, but are not touched, redated, or reset by `demo:refresh`: **#117** (HMO pending, Dr. Castro) and **#135** (pediatric pending, Dr. Santos). If either gets approved/rejected during a rehearsal it stays that way — re-approve/reject it by hand, or ignore it and rely on #137/#143 instead, which `demo:refresh` always resets for you.

The command's own source (`backend/app/Console/Commands/RefreshDemoAppointments.php`) is the authoritative list — the `DEMO_APPOINTMENTS` constant at the top names exactly these seven ids and nothing else.

Existing history also present: 2 completed visits (Aug), 4 cancelled, 1 rejected, ~11 confirmed across August–September, plus populated dental records (tooth charts, treatment plans, treatment history) and unread notifications on several accounts.
