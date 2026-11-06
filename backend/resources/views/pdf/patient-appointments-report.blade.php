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

  // "Dr. [First] [Middle...] [Last][, Suffix]" -> "Dr. [Last]" — same
  // shortening PatientRecords.jsx's own dentistSurname() applies to the
  // on-screen printed version of this report, for the same reason: the
  // full name was the single biggest source of crowding. function_exists
  // guard since this file has no class to hang a real method off of and a
  // raw @php function would otherwise fatal with "cannot redeclare" if
  // this view were ever rendered twice in one request (never happens
  // today — Pdf::loadView() runs once per request here — but costs
  // nothing to guard against).
  if (! function_exists('dentistSurname')) {
      function dentistSurname(?string $name): string
      {
          if (! $name) {
              return 'Unassigned';
          }
          $noSuffix = trim(explode(',', $name)[0]);
          $withoutTitle = trim(preg_replace('/^Dr\.?\s+/i', '', $noSuffix));
          $parts = preg_split('/\s+/', $withoutTitle, -1, PREG_SPLIT_NO_EMPTY);
          $surname = ! empty($parts) ? end($parts) : $withoutTitle;

          return 'Dr. '.$surname;
      }
  }
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
    // Only present when the Cash/HMO chips or HMO Provider dropdown
    // actually narrowed anything — see
    // PatientRecordController::filterSummaryText()'s own comment for why
    // this needs to be stated on the printed page itself, not just
    // implied by whatever was on screen when it was generated.
    ...($filterSummary ? [['label' => 'Filtered To', 'value' => $filterSummary]] : []),
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
        <th class="par-col-type">Type</th>
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
          <td>{{ dentistSurname($row->dentist->name ?? null) }}</td>
          <td class="par-col-type">
            @if (($row->patient->patient_type ?? null) === 'cash')
              <span class="par-type-cash">Cash</span>
            @else
              <span class="par-type-hmo">HMO</span>
              @if ($row->patient->hmoProvider->name ?? null)
                <br><span class="par-type-provider">{{ $row->patient->hmoProvider->name }}</span>
              @endif
            @endif
          </td>
        </tr>
      @endforeach
    </tbody>
  </table>
@endif

@include('pdf.partials.footer')

</body>
</html>
