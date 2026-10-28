{{-- Expects: $title (string), $metaRows (array of ['label' => ..., 'value' => ...]) --}}
<table class="pdf-letterhead">
  <tr>
    <td>
      <table class="pdf-brand-row">
        <tr>
          <td class="pdf-logo-cell"><img src="{{ public_path('images/logo.png') }}"></td>
          <td class="pdf-brand-text-cell">
            <div class="pdf-brand-title">Smile Bay</div>
            <div class="pdf-brand-subtitle">DENTAL CLINIC</div>
          </td>
        </tr>
      </table>
      <div class="pdf-tagline">{{ $clinicInfo->tagline ?? 'Your Smile, Our Priority' }}</div>
      <div class="pdf-contact">
        {{ $clinicInfo->address ?? 'Ground Floor, Mega Building, National Highway, Landayan, San Pedro, Laguna, 4023' }}<br>
        {{ $clinicInfo->contact_number ?? '0917 132 3093' }} &middot; {{ $clinicInfo->contact_email ?? 'smilebayph@gmail.com' }}
      </div>
    </td>
    <td class="pdf-doc-col">
      <span class="pdf-doc-badge">{{ $title }}</span>
      <table class="pdf-meta">
        @foreach ($metaRows as $row)
          <tr>
            <td class="pdf-meta-label">{{ $row['label'] }}:</td>
            <td class="pdf-meta-value">{{ $row['value'] }}</td>
          </tr>
        @endforeach
      </table>
    </td>
  </tr>
</table>
