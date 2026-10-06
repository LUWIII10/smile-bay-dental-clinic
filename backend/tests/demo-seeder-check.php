<?php

// Integration verification against the configured database, entirely rolled back.
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\{Appointment, AppointmentStatusLog, ClinicSchedule, Patient, TreatmentHistory, User};
use App\Services\AppointmentSlotService;
use Carbon\Carbon;
use Database\Seeders\DemoPatientSeeder;
use Illuminate\Support\Facades\{DB, Mail};

function verify(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

$before = Patient::count();
$anchor = Carbon::create(2026, 10, 4, 0, 0, 0, 'Asia/Manila');
DB::beginTransaction();
try {
    Mail::fake();
    $seed = new DemoPatientSeeder;
    $seed->anchor = $anchor;
    $seed->run();
    $emails = array_map(fn ($n) => sprintf('demo.patient%03d@example.com', $n), range(1, 50));
    $users = User::whereIn('email', $emails)->get();
    $patients = Patient::whereIn('user_id', $users->modelKeys())->get();
    verify($patients->count() === 50, 'Expected exactly 50 demo patients.');
    verify(Patient::count() >= $before, 'Existing patients were removed.');
    verify($users->pluck('name')->unique()->count() === 50, 'Names must be unique.');
    $appointments = Appointment::whereIn('patient_id', $patients->modelKeys())->with(['patient', 'service', 'dentist.services'])->get();
    verify($appointments->count() === 100, 'Expected 100 demo appointments.');
    verify($appointments->where('status', 'completed')->count() === 40, 'Expected 40 completed visits.');
    verify($appointments->where('status', 'pending_verification')->isNotEmpty(), 'Missing pending appointments.');
    verify($appointments->where('status', 'confirmed')->isNotEmpty(), 'Missing confirmed appointments.');
    verify($patients->where('patient_type', 'hmo')->count() === 20, 'Expected 20 HMO patients.');
    foreach ($patients as $patient) {
        verify(! preg_match('/^09\d{9}$/', $patient->user->mobile_number), 'Demo phone must not be deliverable.');
        $age = (int) $patient->date_of_birth->diffInYears($anchor);
        verify($age >= 5 && $age <= 76, 'Birth date outside expected ages.');
        if ($age < 18) {
            verify((bool) $patient->guardian_name && (bool) $patient->guardian_contact_number, 'Minor missing guardian.');
        }
    }
    $slots = app(AppointmentSlotService::class);
    foreach ($appointments as $appointment) {
        $date = $appointment->appointment_date->toDateString();
        $start = Carbon::parse($date.' '.$appointment->appointment_time);
        $end = $start->copy()->addMinutes($appointment->service->duration_minutes);
        $clinic = ClinicSchedule::where('day_of_week', $start->dayOfWeek)->first();
        verify($clinic && $clinic->is_open, 'Appointment on a clinic closed day.');
        verify($start->gte(Carbon::parse($date.' '.$clinic->open_time)) && $end->lte(Carbon::parse($date.' '.$clinic->close_time)), 'Appointment outside clinic hours.');
        verify($slots->isSlotAvailable($appointment->dentist_id, $date, $appointment->appointment_time, $appointment->service->duration_minutes, $appointment->id), 'Dentist unavailable or double-booked.');
        verify($appointment->dentist->services->contains('id', $appointment->service_id), 'Dentist lacks service credentials.');
        verify($appointment->service->isPediatric() === ((int) $appointment->patient->date_of_birth->diffInYears($anchor) < 18), 'Pediatric age/service mismatch.');
        if (in_array($appointment->status, ['completed', 'no_show', 'cancelled'], true)) {
            verify($start->lt($anchor), 'Historical status in future.');
        } else {
            verify($start->gt($anchor), 'Upcoming status in past.');
        }
        if ($appointment->service->isPediatric() && $appointment->status === 'confirmed') {
            verify((bool) $appointment->pediatric_confirmed_at, 'Pediatric confirmation missing.');
        }
        if ($appointment->patient_type_snapshot === 'hmo' && $appointment->status === 'confirmed') {
            verify((bool) $appointment->verified_by && (bool) $appointment->verified_at, 'HMO verification missing.');
        }
        $last = $appointment->statusLogs()->orderByDesc('created_at')->orderByDesc('id')->first();
        verify($last?->new_status === $appointment->status, 'Audit status inconsistent.');
    }
    // Also check cancelled/no-show slots against each other: the live scheduler frees these.
    foreach ($appointments->groupBy(fn ($a) => $a->dentist_id.'|'.$a->appointment_date->toDateString()) as $group) {
        $end = null;
        foreach ($group->sortBy('appointment_time') as $appointment) {
            $start = Carbon::parse($appointment->appointment_date->toDateString().' '.$appointment->appointment_time);
            verify(! $end || $start->gte($end), 'Demo appointments overlap, including inactive statuses.');
            $end = $start->copy()->addMinutes($appointment->service->duration_minutes);
        }
    }
    $history = TreatmentHistory::whereIn('appointment_id', $appointments->modelKeys())->with('appointment')->get();
    verify($history->count() === 40, 'Expected 40 treatment histories.');
    foreach ($history as $row) {
        verify($row->appointment->status === 'completed', 'Treatment attached to incomplete appointment.');
        verify($row->performed_at->eq($row->appointment->appointment_date), 'Treatment date inconsistent.');
    }
    verify(AppointmentStatusLog::whereIn('appointment_id', $appointments->modelKeys())->where('note', 'like', 'Rescheduled by dentist%')->exists(), 'Missing rescheduling activity.');
    $counts = [Patient::count(), Appointment::count(), TreatmentHistory::count()];
    $seed->run();
    verify($counts === [Patient::count(), Appointment::count(), TreatmentHistory::count()], 'Rerun created duplicates.');
    Mail::assertNothingSent();
    Mail::assertNothingQueued();
    echo 'PASS: 50 patients; 100 valid appointments; 40 treatment histories; age, guardian, HMO, pediatric, hours, overlap, audit, idempotency and no-mail checks.'.PHP_EOL;
} finally {
    DB::rollBack();
}
verify(Patient::count() === $before, 'Verification did not roll back.');
echo 'PASS: database verification rolled back.'.PHP_EOL;
