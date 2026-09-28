<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Clinic Operations Report</title>
@include('pdf.partials.styles')
</head>
<body>

@include('pdf.partials.letterhead', [
  'title' => 'Clinic Operations Report',
  'metaRows' => [
    ['label' => 'Period', 'value' => \Carbon\Carbon::parse($dateFrom)->format('M j, Y').' - '.\Carbon\Carbon::parse($dateTo)->format('M j, Y')],
    ['label' => 'Generated', 'value' => $generatedAt->format('M j, Y g:i A')],
  ],
])

<div class="pdf-section-title">Table 1 &mdash; Appointment Summary</div>
<table class="pdf-table pdf-table-summary">
  <tbody>
    <tr><td>Total appointments</td><td class="num">{{ $totals['total_appointments'] }}</td></tr>
    <tr><td>Completed</td><td class="num">{{ $totals['completed'] }}</td></tr>
    <tr><td>Cancelled / rejected</td><td class="num">{{ $totals['cancelled'] + $totals['rejected'] }}</td></tr>
    <tr><td>New patients</td><td class="num">{{ $totals['new_patients'] }}</td></tr>
    <tr><td>No-shows</td><td class="num">{{ $totals['no_show'] }}</td></tr>
    <tr><td>Completion rate</td><td class="num">{{ $completionRate }}%</td></tr>
  </tbody>
</table>
<p class="pdf-summary">
  <strong>{{ $totals['total_appointments'] }}</strong> appointment{{ $totals['total_appointments'] === 1 ? '' : 's' }}
  over {{ $dayCount }} day{{ $dayCount === 1 ? '' : 's' }} &mdash; averaging {{ $avgPerDay }} per day.
  @if ($peakDay)
    Busiest day: <strong>{{ \Carbon\Carbon::parse($peakDay->date)->format('M j, Y') }}</strong> ({{ $peakDay->count }} appointment{{ $peakDay->count === 1 ? '' : 's' }}).
  @endif
</p>

<div class="pdf-section-title">Table 2 &mdash; Payment Type</div>
<table class="pdf-table">
  <thead><tr><th>Type</th><th class="num">Count</th><th class="num">Share</th></tr></thead>
  <tbody>
    <tr><td>Cash</td><td class="num">{{ $paymentSplit['cash'] }}</td><td class="num">{{ $cashPct }}%</td></tr>
    <tr><td>HMO</td><td class="num">{{ $paymentSplit['hmo'] }}</td><td class="num">{{ $hmoPct }}%</td></tr>
  </tbody>
  <tfoot><tr><td>Total</td><td class="num">{{ $paymentTotal }}</td><td class="num">100%</td></tr></tfoot>
</table>

<div class="pdf-section-title">Table 3 &mdash; Services Rendered</div>
@if (count($topServices) === 0)
  <p class="pdf-empty">No data in this range.</p>
@else
  <table class="pdf-table">
    <thead><tr><th>Service</th><th class="num">Count</th><th class="num">Share</th></tr></thead>
    <tbody>
      @foreach ($topServices as $s)
        <tr><td>{{ $s->name }}</td><td class="num">{{ $s->count }}</td><td class="num">{{ $pct($s->count, $servicesTotal) }}%</td></tr>
      @endforeach
    </tbody>
    <tfoot><tr><td>Total</td><td class="num">{{ $servicesTotal }}</td><td class="num">100.0%</td></tr></tfoot>
  </table>
@endif

<div class="pdf-section-title">Table 4 &mdash; Appointments by Dentist</div>
@if (count($byDentist) === 0)
  <p class="pdf-empty">No data in this range.</p>
@else
  <table class="pdf-table">
    <thead><tr><th>Dentist</th><th class="num">Count</th><th class="num">Share</th></tr></thead>
    <tbody>
      @foreach ($byDentist as $d)
        <tr><td>{{ $d->name }}</td><td class="num">{{ $d->count }}</td><td class="num">{{ $pct($d->count, $dentistTotal) }}%</td></tr>
      @endforeach
    </tbody>
    <tfoot><tr><td>Total</td><td class="num">{{ $dentistTotal }}</td><td class="num">100.0%</td></tr></tfoot>
  </table>
@endif

@include('pdf.partials.footer', ['text' => 'Smile Bay Dental Clinic - Clinic Operations Report'])

</body>
</html>
