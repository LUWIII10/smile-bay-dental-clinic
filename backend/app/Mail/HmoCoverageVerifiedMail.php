<?php

namespace App\Mail;

use App\Models\Appointment;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent by StaffVerificationController::proposeNewDate() — coverage just got
 * verified, but the patient's original requested date already passed, so a
 * new one needs their confirmation. Deliberately its own mailable rather
 * than reusing AppointmentRescheduledMail: that one's copy says "no action
 * is needed from you", which would be actively wrong here — the whole point
 * is the patient needs to sign in and respond (accept or pick a different
 * date), same as AppointmentConfirmedMail is its own thing rather than a
 * reused AppointmentRescheduledMail once the patient later confirms.
 */
class HmoCoverageVerifiedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Appointment $appointment) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your HMO coverage is verified — please confirm your visit date',
        );
    }

    public function content(): Content
    {
        $this->appointment->loadMissing(['patient', 'dentist', 'service']);

        return new Content(
            view: 'emails.hmo-coverage-verified',
            with: [
                'name' => $this->appointment->patient->first_name,
                'serviceName' => $this->appointment->service->name,
                'dentistName' => $this->appointment->dentist?->name,
                'date' => $this->appointment->appointment_date->format('F j, Y'),
                'time' => Carbon::parse($this->appointment->appointment_time)->format('g:i A'),
                'reason' => $this->appointment->dentist_reschedule_reason,
                'coverageNotes' => $this->appointment->patient->hmo_coverage_notes,
            ],
        );
    }
}
