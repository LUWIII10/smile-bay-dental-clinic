<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Patient Appointments Report</title>
@include('pdf.partials.styles')
</head>
<body>

@include('pdf.partials.letterhead', [
  'title' => 'Patient Appointments Report',
  'metaRows' => [
    ['label' => 'Date', 'value' => \Carbon\Carbon::parse($date)->format('l, F j, Y')],
    ['label' => 'Generated', 'value' => $generatedAt->format('M j, Y g:i A')],
    ['label' => 'Total Patients', 'value' => (string) count($appointments)],
  ],
])

@if (count($appointments) === 0)
  <p class="pdf-empty">No appointments on this date.</p>
@else
  <table class="pdf-table">
    <thead>
      <tr>
        <th>Patient</th>
        <th>Patient No.</th>
        <th>Time</th>
        <th>Service</th>
        <th>Dentist</th>
      </tr>
    </thead>
    <tbody>
      @foreach ($appointments as $row)
        <tr>
          <td>{{ trim(($row->patient->first_name ?? '').' '.($row->patient->last_name ?? '')) }}</td>
          <td>{{ $row->patient->patient_number ?? '' }}</td>
          <td>{{ \Carbon\Carbon::parse($row->appointment_time)->format('g:i A') }}</td>
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
