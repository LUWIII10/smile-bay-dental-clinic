<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public User $user,
        public string $otp,
        public int $expiresInMinutes,
        public string $purpose = 'email_verification',
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->purpose === 'password_reset'
                ? 'Your Smile Bay password reset code'
                : 'Your Smile Bay verification code',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.otp',
            with: [
                'name' => $this->user->name,
                'otp' => $this->otp,
                'expiresInMinutes' => $this->expiresInMinutes,
                'intro' => $this->purpose === 'password_reset'
                    ? 'Use the verification code below to reset your Smile Bay account password.'
                    : 'Use the verification code below to confirm your email address and finish creating your Smile Bay account.',
            ],
        );
    }
}
