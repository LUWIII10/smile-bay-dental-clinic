<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
</head>
<body style="margin:0; padding:0; background:#f1f5f9; font-family: 'Segoe UI', Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9; padding:32px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:16px; overflow:hidden;">
                    <tr>
                        <td style="background:#15803d; height:6px; font-size:0; line-height:0;">&nbsp;</td>
                    </tr>
                    <tr>
                        <td align="center" style="padding:28px 32px 12px;">
                            <img src="{{ asset('images/logo.png') }}" alt="Smile Bay Dental Clinic" width="64" height="64" style="display:block; width:64px; height:64px;">
                            <div style="margin-top:10px; color:#0f2557; font-size:18px; font-weight:600;">Smile Bay Dental Clinic</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:32px;">
                            <p style="margin:0 0 8px 0; color:#0f2557; font-size:16px;">Hi {{ $name }},</p>
                            <p style="margin:0 0 20px 0; color:#334155; font-size:14px; line-height:1.5;">
                                Good news — your HMO coverage has been verified by our staff. Your original requested
                                date already passed, so we're proposing a new one below.
                                <strong>Please sign in to accept it or request a different date</strong> — no further
                                coverage verification is needed either way.
                            </p>

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4; border-radius:10px; margin:0 0 20px;">
                                <tr>
                                    <td style="padding:16px 20px; font-size:13px; color:#334155; line-height:1.9;">
                                        <strong style="color:#0f2557;">Procedure:</strong> {{ $serviceName }}<br>
                                        @if($dentistName)
                                            <strong style="color:#0f2557;">Dentist:</strong> {{ $dentistName }}<br>
                                        @endif
                                        <strong style="color:#0f2557;">Proposed date:</strong> {{ $date }}<br>
                                        <strong style="color:#0f2557;">Proposed time:</strong> {{ $time }}
                                    </td>
                                </tr>
                            </table>

                            @if($reason)
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border-radius:10px; margin:0 0 20px;">
                                    <tr>
                                        <td style="padding:14px 18px; font-size:13px; color:#334155; line-height:1.6;">
                                            <strong style="color:#0f2557;">Note from our staff:</strong><br>
                                            {{ $reason }}
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            @if($coverageNotes)
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff; border-radius:10px; margin:0 0 20px;">
                                    <tr>
                                        <td style="padding:14px 18px; font-size:13px; color:#1e3a8a; line-height:1.6;">
                                            <strong style="color:#1d4ed8;">Your verified coverage:</strong><br>
                                            {{ $coverageNotes }}
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            <p style="margin:0; color:#64748b; font-size:13px;">
                                Sign in to your Smile Bay patient portal, under My Appointments, to respond.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
