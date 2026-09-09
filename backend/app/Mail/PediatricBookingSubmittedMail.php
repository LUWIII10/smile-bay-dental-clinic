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
 * Sent the moment a pediatric-service booking is saved as
 * pending_verification (AppointmentController::store()) — regardless of
 * cash or HMO, since pediatric bookings always need the pediatric dentist's
 * review first. Not a reuse of HmoBookingSubmittedMail: that mailable's
 * copy explicitly says "since it's billed through your HMO," which would be
 * false for a cash-paying pediatric patient.
 */
class PediatricBookingSubmittedMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(public Appointment $appointment) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your Smile Bay pediatric appointment request has been received',
        );
    }

    public function content(): Content
    {
        $this->appointment->loadMissing(['patient', 'service']);

        return new Content(
            view: 'emails.pediatric-booking-submitted',
            with: [
                'name' => $this->appointment->patient->first_name,
                'serviceName' => $this->appointment->service->name,
                'date' => $this->appointment->appointment_date->format('F j, Y'),
                'time' => Carbon::parse($this->appointment->appointment_time)->format('g:i A'),
                'logoPath' => resource_path('images/logo.png'),
            ],
        );
    }
}
