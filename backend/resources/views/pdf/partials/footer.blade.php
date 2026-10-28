{{-- $text optional — defaults to the same line PrintFooter.jsx (the
     on-screen equivalent) defaults to, built from $clinicInfo (the
     composer-injected row) the same way. --}}
<div class="pdf-footer">{{ $text ?? ($clinicInfo->clinic_name ?? 'Smile Bay Dental Clinic') . ' - San Pedro, Laguna' }}</div>
