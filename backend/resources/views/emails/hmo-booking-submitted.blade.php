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
                        <td style="background:#b45309; height:6px; font-size:0; line-height:0;">&nbsp;</td>
                    </tr>
                    <tr>
                        <td align="center" style="padding:28px 32px 12px;">
                            <img src="{{ $message->embed($logoPath) }}" alt="Smile Bay Dental Clinic" width="64" height="64" style="display:block; width:64px; height:64px;">
                            <div style="margin-top:10px; color:#0f2557; font-size:18px; font-weight:600;">Smile Bay Dental Clinic</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:32px;">
                            <p style="margin:0 0 8px 0; color:#0f2557; font-size:16px;">Hi {{ $name }},</p>
                            <p style="margin:0 0 20px 0; color:#334155; font-size:14px; line-height:1.5;">
                                We've received your appointment request. Since it's billed through your HMO,
                                our staff will review your coverage details before your appointment is confirmed.
                            </p>

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border-radius:10px; margin:0 0 20px;">
                                <tr>
                                    <td style="padding:16px 20px; font-size:13px; color:#334155; line-height:1.9;">
                                        <strong style="color:#0f2557;">Procedure:</strong> {{ $serviceName }}<br>
                                        @if($dentistName)
                                            <strong style="color:#0f2557;">Dentist:</strong> {{ $dentistName }}<br>
                                        @endif
                                        <strong style="color:#0f2557;">Requested date:</strong> {{ $date }}<br>
                                        <strong style="color:#0f2557;">Requested time:</strong> {{ $time }}
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:0; color:#64748b; font-size:13px;">
                                We'll email you again as soon as your appointment has been reviewed. No action is
                                needed from you right now.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
