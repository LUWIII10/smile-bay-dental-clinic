<?php

namespace App\Mail;

use App\Models\Appointment;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent whenever an appointment becomes 'confirmed' — either instantly for a
 * cash booking (AppointmentController::store()) or after staff approve a
 * pending_verification HMO booking (StaffVerificationController::verify()).
 * One mailable for both, not two, per the requirement that the HMO-approved
 * email use "the same tone/content as the cash confirmation email" — the one
 * difference (a line noting HMO coverage was verified) is derived from
 * patient_type_snapshot rather than a constructor flag, since a cash
 * appointment's snapshot is never 'hmo'.
 */
class AppointmentConfirmedMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(public Appointment $appointment) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your Smile Bay appointment is confirmed',
        );
    }

    public function content(): Content
    {
        $this->appointment->loadMissing(['patient', 'dentist', 'service']);

        return new Content(
            view: 'emails.appointment-confirmed',
            with: [
                'name' => $this->appointment->patient->first_name,
                'serviceName' => $this->appointment->service->name,
                'dentistName' => $this->appointment->dentist?->name,
                'date' => $this->appointment->appointment_date->format('F j, Y'),
                'time' => Carbon::parse($this->appointment->appointment_time)->format('g:i A'),
                'viaHmoVerification' => $this->appointment->patient_type_snapshot === 'hmo',
                'logoPath' => resource_path('images/logo.png'),
            ],
        );
    }
}
