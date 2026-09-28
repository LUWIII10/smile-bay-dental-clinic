<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Patient Dental Record</title>
@include('pdf.partials.styles')
</head>
<body>

@php
  // Mirrors PatientRecords.jsx's own CONDITION_META / SEX_LABELS /
  // hasConditionFlag / pregnancyStatusLabel / lastProcedureForTooth exactly
  // — same labels, same "None known"/"—" fallbacks, same broken-out-condition
  // exclusion list, kept in sync with that file's own comments explaining
  // each rule.
  $conditionLabels = [
    'healthy' => 'Healthy', 'decayed' => 'Decayed', 'filled' => 'Filled',
    'missing' => 'Missing', 'crowned' => 'Crowned', 'root_canal' => 'Root Canal',
    'extracted' => 'Extracted', 'impacted' => 'Impacted', 'other' => 'Other',
  ];
  $sexLabels = ['male' => 'Male', 'female' => 'Female'];

  $hasFlag = function (...$labels) use ($patient) {
    $list = $patient->medical_conditions ?? [];
    foreach ($labels as $label) {
      if (in_array($label, $list, true)) return true;
    }
    return false;
  };

  $pregnancyStatus = $patient->sex === 'male'
    ? 'Not applicable'
    : ($hasFlag('Pregnant') ? 'Pregnant' : ($hasFlag('Breastfeeding') ? 'Breastfeeding' : 'Not pregnant'));

  $brokenOut = ['Pregnant', 'Breastfeeding', 'Smoking/Vape', 'Alcohol Use'];
  $medicalConditionsParts = array_values(array_diff($patient->medical_conditions ?? [], $brokenOut));
  if (!empty($patient->medical_conditions_other)) $medicalConditionsParts[] = $patient->medical_conditions_other;
  $medicalConditionsSummary = count($medicalConditionsParts) ? implode('; ', $medicalConditionsParts) : 'None';

  $dentalConcernsParts = $patient->current_dental_symptoms ?? [];
  if (!empty($patient->visit_reason)) $dentalConcernsParts[] = $patient->visit_reason;
  $dentalConcernsSummary = count($dentalConcernsParts) ? implode('; ', $dentalConcernsParts) : 'None reported';

  $age = null;
  if ($patient->date_of_birth) {
    $age = \Carbon\Carbon::parse($patient->date_of_birth)->age;
  }

  $lastProcedureForTooth = function ($toothNumber) use ($record) {
    $match = $record->treatmentHistory
      ->filter(fn ($h) => $h->tooth_number === $toothNumber)
      ->sortByDesc('performed_at')
      ->first();
    return $match ? $match->procedure_name : null;
  };

  $fmt = fn ($date) => $date ? \Carbon\Carbon::parse($date)->format('M j, Y') : '—';
  $statusLabel = fn ($status) => ucfirst(str_replace('_', ' ', (string) $status));
@endphp

@include('pdf.partials.letterhead', [
  'title' => 'Patient Dental Record',
  'metaRows' => [
    ['label' => 'Patient No.', 'value' => $patient->patient_number],
    ['label' => 'Date Printed', 'value' => $generatedAt->format('M j, Y')],
  ],
])

<p class="pdf-summary">
  Treatment History &amp; Clinical Notes below cover {{ $fmt($dateFrom) }} &ndash; {{ $fmt($dateTo) }}.
  Patient information and the dental chart are current as of the print date, in full, regardless of that range.
</p>

<div class="pdf-section-title">Patient Information</div>
<table class="pdf-grid">
  <tr>
    <td class="g-label">Patient Name</td><td class="g-value">{{ trim($patient->first_name.' '.($patient->middle_name ?? '').' '.$patient->last_name) }}</td>
    <td class="g-label">Contact Number</td><td class="g-value">{{ $patient->user->mobile_number ?? '—' }}</td>
  </tr>
  <tr>
    <td class="g-label">Patient No.</td><td class="g-value">{{ $patient->patient_number }}</td>
    <td class="g-label">Email</td><td class="g-value">{{ $patient->user->email ?? '—' }}</td>
  </tr>
  <tr>
    <td class="g-label">Date of Birth</td><td class="g-value">{{ $fmt($patient->date_of_birth) }}</td>
    <td class="g-label">Address</td><td class="g-value">{{ $patient->address_line ?? '—' }}</td>
  </tr>
  <tr>
    <td class="g-label">Age</td><td class="g-value">{{ $age ?? '—' }}</td>
    <td class="g-label">Emergency Contact</td>
    <td class="g-value">{{ $patient->emergency_contact_name ?? '—' }}{{ $patient->emergency_contact_relationship ? ' ('.$patient->emergency_contact_relationship.')' : '' }}</td>
  </tr>
  <tr>
    <td class="g-label">Sex</td><td class="g-value">{{ $sexLabels[$patient->sex] ?? $patient->sex ?? '—' }}</td>
    <td class="g-label">Emergency Contact No.</td><td class="g-value">{{ $patient->emergency_contact_number ?? '—' }}</td>
  </tr>
  <tr>
    <td class="g-label">Patient Category</td>
    <td class="g-value">
      {{ $patient->patient_type === 'cash' ? 'Cash' : 'HMO' }}
      @if ($patient->patient_type === 'hmo' && ($patient->hmoProvider->name ?? $patient->hmo_company_name ?? null))
        &mdash; {{ $patient->hmoProvider->name ?? $patient->hmo_company_name }}{{ $patient->hmo_number ? ' (#'.$patient->hmo_number.')' : '' }}
      @endif
    </td>
    <td class="g-label">Primary Dentist</td><td class="g-value">{{ $record->primaryDentist->name ?? 'Not yet assigned' }}</td>
  </tr>
</table>

<div class="pdf-section-title">Medical &amp; Dental History</div>
<table class="pdf-grid">
  <tr>
    <td class="g-label">Allergies</td><td class="g-value">{{ $patient->allergies ?: 'None known' }}</td>
    <td class="g-label">Smoking History</td><td class="g-value">{{ $hasFlag('Smoking/Vape') ? 'Smoker' : 'Non-smoker' }}</td>
  </tr>
  <tr>
    <td class="g-label">Current Medications</td><td class="g-value">{{ $patient->current_medications ?: 'None' }}</td>
    <td class="g-label">Alcohol History</td><td class="g-value">{{ $hasFlag('Alcohol Use') ? 'Reported' : 'None reported' }}</td>
  </tr>
  <tr>
    <td class="g-label">Medical Conditions</td><td class="g-value">{{ $medicalConditionsSummary }}</td>
    <td class="g-label">Previous Dental Treatment</td><td class="g-value">{{ $patient->last_dental_treatment ?: 'None on file' }}</td>
  </tr>
  <tr>
    <td class="g-label">Previous Surgeries / Hosp.</td><td class="g-value">{{ $patient->previous_surgeries ?: 'None' }}</td>
    <td class="g-label">Last Dental Visit</td><td class="g-value">{{ $patient->last_dental_visit ?: 'Not on file' }}</td>
  </tr>
  <tr>
    <td class="g-label">Pregnancy Status</td><td class="g-value">{{ $pregnancyStatus }}</td>
    <td class="g-label">Dental Concerns</td><td class="g-value">{{ $dentalConcernsSummary }}</td>
  </tr>
</table>

<div class="pdf-section-title">Dental Chart Summary</div>
@if ($record->toothConditions->count() === 0)
  <p class="pdf-empty">No tooth conditions charted yet.</p>
@else
  <table class="pdf-table">
    <thead><tr><th>Tooth No.</th><th>Condition</th><th>Treatment / Procedure</th><th>Notes</th><th>Last Updated By</th></tr></thead>
    <tbody>
      @foreach ($record->toothConditions as $tc)
        <tr>
          <td>{{ $tc->tooth_number }}</td>
          <td>{{ $conditionLabels[$tc->condition] ?? $tc->condition }}</td>
          <td>{{ $lastProcedureForTooth($tc->tooth_number) ?? '—' }}</td>
          <td>{{ $tc->notes ?: '—' }}</td>
          <td>{{ $tc->updatedBy->name ?? '—' }}</td>
        </tr>
      @endforeach
    </tbody>
  </table>
@endif

<div class="pdf-section-title">Treatment Plans</div>
@if ($record->treatmentPlans->count() === 0)
  <p class="pdf-empty">No treatment plans on file.</p>
@else
  <table class="pdf-table">
    <thead><tr><th>Plan Title</th><th>Dentist</th><th>Status</th><th>Target Date</th><th>Planned Procedures / Items</th></tr></thead>
    <tbody>
      @foreach ($record->treatmentPlans as $plan)
        <tr>
          <td>{{ $plan->title }}</td>
          <td>{{ $plan->dentist->name ?? '—' }}</td>
          <td>{{ $statusLabel($plan->status) }}</td>
          <td>{{ $plan->target_date ? $fmt($plan->target_date) : '—' }}</td>
          <td>
            @if ($plan->items->count())
              {{ $plan->items->map(fn ($it) => $it->procedure_name.($it->tooth_number ? ' (Tooth #'.$it->tooth_number.')' : ''))->implode('; ') }}
            @else
              &mdash;
            @endif
          </td>
        </tr>
      @endforeach
    </tbody>
  </table>
@endif

<div class="pdf-section-title">Treatment History</div>
@if ($printHistory->count() === 0)
  <p class="pdf-empty">No entries in the selected period.</p>
@else
  <table class="pdf-table">
    <thead><tr><th>Date</th><th>Tooth / Area</th><th>Procedure</th><th>Dentist</th><th>Notes</th></tr></thead>
    <tbody>
      @foreach ($printHistory as $h)
        <tr>
          <td>{{ $fmt($h->performed_at) }}</td>
          <td>{{ $h->tooth_number ?? '—' }}</td>
          <td>{{ $h->procedure_name }}</td>
          <td>{{ $h->performedBy->name ?? '—' }}</td>
          <td>{{ $h->notes ?: '—' }}</td>
        </tr>
      @endforeach
    </tbody>
  </table>
@endif

<div class="pdf-section-title">Clinical Notes</div>
@if ($printNotes->count() === 0)
  <p class="pdf-empty">No entries in the selected period.</p>
@else
  <table class="pdf-table">
    <thead><tr><th>Date</th><th>Dentist</th><th>Note</th></tr></thead>
    <tbody>
      @foreach ($printNotes as $note)
        <tr>
          <td>{{ $fmt($note->created_at) }}</td>
          <td>{{ $note->dentist->name ?? '—' }}</td>
          <td>{{ $note->note }}</td>
        </tr>
      @endforeach
    </tbody>
  </table>
@endif

<div class="pdf-section-title">Consent &amp; Record Verification</div>
<p class="pdf-summary">
  I certify that the information in this record is accurate to the best of my knowledge and consent to its use for dental care at Smile Bay Dental Clinic.
</p>
<table class="pdf-signature-row">
  <tr>
    <td><span class="pdf-signature-line">Patient / Guardian Signature</span></td>
    <td><span class="pdf-signature-line">Dentist Signature</span></td>
  </tr>
</table>
<table class="pdf-signature-row">
  <tr>
    <td><span class="pdf-signature-line">Date</span></td>
    <td><span class="pdf-signature-line">Record Verified By</span></td>
  </tr>
</table>

@include('pdf.partials.footer', ['text' => 'Smile Bay Dental Clinic - Patient Dental Record - Confidential Medical Record'])

</body>
</html>
