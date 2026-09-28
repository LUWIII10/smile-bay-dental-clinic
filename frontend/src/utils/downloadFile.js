import api from '../api';

// Shared by every "Download PDF" button (Reports, Patient Records' two print
// surfaces) — GETs a file as a blob and saves it via a throwaway <a download>,
// the standard way to trigger a real file-save dialog from an API response
// rather than navigating the tab to it. Filename comes from the backend's
// own Content-Disposition header (set by Laravel's $pdf->download(name)),
// falling back to fallbackName only if that header is ever missing.
export async function downloadFile(url, params, fallbackName = 'download.pdf') {
  let response;
  try {
    response = await api.get(url, { params, responseType: 'blob' });
  } catch (err) {
    // With responseType: 'blob', an error response body (Laravel's JSON
    // {message: ...} on a 500/422) arrives as a Blob too, not parsed JSON —
    // axios only auto-parses JSON for the response type it was told to
    // expect. Reading it back out as text here is what lets the caller show
    // the real backend message instead of a generic "something went wrong".
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const parsed = JSON.parse(text);
        if (parsed?.message) err.message = parsed.message;
      } catch {
        // Body wasn't JSON (e.g. a raw 500 HTML page) — fall back to
        // whatever axios's own error message already says.
      }
    }
    throw err;
  }

  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallbackName;

  const blobUrl = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}
