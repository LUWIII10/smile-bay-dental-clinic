<?php

namespace App\Mail;

use App\Models\Appointment;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent the moment an HMO patient's booking is saved as pending_verification
 * — informs them staff will review their details, with no SLA/timeframe
 * promised (per the clinic's approval-state policy). Queued: unlike OTP
 * mail, nothing in the request/response cycle is waiting on this send.
 */
class HmoBookingSubmittedMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(public Appointment $appointment) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your Smile Bay booking request has been received',
        );
    }

    public function content(): Content
    {
        $this->appointment->loadMissing(['patient', 'dentist', 'service']);

        return new Content(
            view: 'emails.hmo-booking-submitted',
            with: [
                'name' => $this->appointment->patient->first_name,
                'serviceName' => $this->appointment->service->name,
                'dentistName' => $this->appointment->dentist?->name,
                'date' => $this->appointment->appointment_date->format('F j, Y'),
                'time' => \Carbon\Carbon::parse($this->appointment->appointment_time)->format('g:i A'),
                'logoPath' => resource_path('images/logo.png'),
            ],
        );
    }
}
