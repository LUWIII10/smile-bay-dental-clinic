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
                        <td style="background:#2952e3; height:6px; font-size:0; line-height:0;">&nbsp;</td>
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
                            <p style="margin:0 0 24px 0; color:#334155; font-size:14px; line-height:1.5;">
                                {{ $intro }}
                            </p>
                            <div style="text-align:center; margin:0 0 24px 0;">
                                <span style="display:inline-block; padding:14px 28px; background:#f1f5f9; border-radius:10px; font-size:28px; font-weight:700; letter-spacing:8px; color:#0f2557;">
                                    {{ $otp }}
                                </span>
                            </div>
                            <p style="margin:0 0 4px 0; color:#64748b; font-size:13px;">
                                This code expires in {{ $expiresInMinutes }} minutes.
                            </p>
                            <p style="margin:0; color:#64748b; font-size:13px;">
                                If you didn't request this, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
