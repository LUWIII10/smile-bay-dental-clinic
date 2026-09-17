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
 * Sent when a dentist moves one of their own appointments to a new date/time
 * (AppointmentController::reschedule()) — the appointment's status doesn't
 * change, so neither AppointmentConfirmedMail nor AppointmentRejectedMail
 * fits; the patient needs to see both the old and new slot, not just one.
 */
class AppointmentRescheduledMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Appointment $appointment,
        public string $oldDate,
        public string $oldTime,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your Smile Bay appointment has been rescheduled',
        );
    }

    public function content(): Content
    {
        $this->appointment->loadMissing(['patient', 'dentist', 'service']);

        return new Content(
            view: 'emails.appointment-rescheduled',
            with: [
                'name' => $this->appointment->patient->first_name,
                'serviceName' => $this->appointment->service->name,
                'dentistName' => $this->appointment->dentist?->name,
                'oldDate' => Carbon::parse($this->oldDate)->format('F j, Y'),
                'oldTime' => Carbon::parse($this->oldTime)->format('g:i A'),
                'newDate' => $this->appointment->appointment_date->format('F j, Y'),
                'newTime' => Carbon::parse($this->appointment->appointment_time)->format('g:i A'),
                'logoPath' => resource_path('images/logo.png'),
            ],
        );
    }
}
