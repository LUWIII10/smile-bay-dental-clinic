<?php

namespace App\Providers;

use Illuminate\Support\Facades\Mail;
use Illuminate\Support\ServiceProvider;
use Symfony\Component\HttpClient\HttpClient;
use Symfony\Component\Mailer\Bridge\Brevo\Transport\BrevoApiTransport;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Not one of Laravel's built-in mailer transports (smtp, ses,
        // postmark, ...), so MailManager needs this custom creator to
        // resolve MAIL_MAILER=brevo — see config/mail.php's 'brevo' entry.
        Mail::extend('brevo', function (array $config) {
            return new BrevoApiTransport($config['key'] ?? null, HttpClient::create());
        });
    }
}
