<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Patient Appointments Report</title>
@include('pdf.partials.styles')
</head>
<body>

@php
  $isSingleDay = $dateFrom === $dateTo;
@endphp

@include('pdf.partials.letterhead', [
  'title' => 'Patient Appointments Report',
  'metaRows' => [
    [
      'label' => $isSingleDay ? 'Date' : 'Date Range',
      'value' => $isSingleDay
        ? \Carbon\Carbon::parse($dateFrom)->format('l, F j, Y')
        : \Carbon\Carbon::parse($dateFrom)->format('M j').' – '.\Carbon\Carbon::parse($dateTo)->format('M j, Y'),
    ],
    ['label' => 'Generated', 'value' => $generatedAt->format('M j, Y g:i A')],
    // This report is deliberately appointment-centric, not patient-centric
    // (a patient with two visits in range shows up as two rows) — labeled
    // to match what count($appointments) actually counts, not "Total
    // Patients", which it isn't.
    ['label' => 'Total Appointments', 'value' => (string) count($appointments)],
  ],
])

@if (count($appointments) === 0)
  <p class="pdf-empty">No appointments in this date range.</p>
@else
  <table class="pdf-table">
    <thead>
      <tr>
        <th>Patient</th>
        <th class="par-col-patno">Patient No.</th>
        @unless ($isSingleDay)
          <th class="par-col-date">Date</th>
        @endunless
        <th class="par-col-time">Time</th>
        <th>Service</th>
        <th>Dentist</th>
      </tr>
    </thead>
    <tbody>
      @foreach ($appointments as $row)
        <tr>
          <td>{{ trim(($row->patient->first_name ?? '').' '.($row->patient->last_name ?? '')) }}</td>
          <td class="par-col-patno">{{ $row->patient->patient_number ?? '' }}</td>
          @unless ($isSingleDay)
            <td class="par-col-date">{{ $row->appointment_date->format('M j, Y') }}</td>
          @endunless
          <td class="par-col-time">{{ \Carbon\Carbon::parse($row->appointment_time)->format('g:i A') }}</td>
          <td>{{ $row->service->name ?? '' }}</td>
          <td>{{ $row->dentist->name ?? 'Unassigned' }}</td>
        </tr>
      @endforeach
    </tbody>
  </table>
@endif

@include('pdf.partials.footer')

</body>
</html>
