<?php

namespace App\Providers;

use App\Models\ClinicInfo;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\View;
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

        // Every outgoing email and PDF letterhead/footer used to hardcode
        // the clinic's name/contact info independently — editing Settings
        // had zero effect on anything a patient actually saw. One composer
        // instead of touching every Mail class and PDF controller: each of
        // these views already reads $clinicInfo with its own `??` fallback
        // to today's exact hardcoded text, so a null/missing row (a brand
        // new install before Settings is ever opened) still renders
        // correctly.
        View::composer(
            ['emails.*', 'pdf.partials.letterhead', 'pdf.partials.footer'],
            fn ($view) => $view->with('clinicInfo', ClinicInfo::first())
        );
    }
}
