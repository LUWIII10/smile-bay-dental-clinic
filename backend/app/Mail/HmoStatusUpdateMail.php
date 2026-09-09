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
 * Sent on demand (StaffVerificationController::sendStatusUpdate()), never
 * automatically — a patient's HMO booking can sit in pending_verification
 * for a while with nothing else emailing them in the meantime
 * (HmoBookingSubmittedMail already fired once, at submission), so staff
 * can proactively reassure them it's still being worked on instead of the
 * patient having to call in and ask.
 */
class HmoStatusUpdateMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public Appointment $appointment,
        public string $statusLabel,
        public ?string $note = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Update on your Smile Bay HMO verification',
        );
    }

    public function content(): Content
    {
        $this->appointment->loadMissing(['patient', 'dentist', 'service']);

        return new Content(
            view: 'emails.hmo-status-update',
            with: [
                'name' => $this->appointment->patient->first_name,
                'serviceName' => $this->appointment->service->name,
                'dentistName' => $this->appointment->dentist?->name,
                'date' => $this->appointment->appointment_date->format('F j, Y'),
                'time' => Carbon::parse($this->appointment->appointment_time)->format('g:i A'),
                'statusLabel' => $this->statusLabel,
                'note' => $this->note,
                'logoPath' => resource_path('images/logo.png'),
            ],
        );
    }
}
