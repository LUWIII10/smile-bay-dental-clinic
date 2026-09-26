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
 * Sent when staff reject a pending_verification HMO appointment
 * (StaffVerificationController::verify()). $reason is optional — the
 * rejection-reason field it comes from isn't required — so the view falls
 * back to a generic "contact the clinic" line when none was given, rather
 * than showing a blank reason.
 */
class AppointmentRejectedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Appointment $appointment, public ?string $reason = null) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Update on your Smile Bay appointment request',
        );
    }

    public function content(): Content
    {
        $this->appointment->loadMissing(['patient', 'dentist', 'service']);

        return new Content(
            view: 'emails.appointment-rejected',
            with: [
                'name' => $this->appointment->patient->first_name,
                'serviceName' => $this->appointment->service->name,
                'dentistName' => $this->appointment->dentist?->name,
                'date' => $this->appointment->appointment_date->format('F j, Y'),
                'time' => Carbon::parse($this->appointment->appointment_time)->format('g:i A'),
                'reason' => $this->reason,
            ],
        );
    }
}
