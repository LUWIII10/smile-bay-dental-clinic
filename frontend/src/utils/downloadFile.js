import api from '../api';

// Shared by every "Download PDF" button (Reports, Patient Records' two print
// surfaces) — GETs a file as a blob and saves it via a throwaway <a download>,
// the standard way to trigger a real file-save dialog from an API response
// rather than navigating the tab to it. Filename comes from the backend's
// own Content-Disposition header (set by Laravel's $pdf->download(name)),
// falling back to fallbackName only if that header is ever missing.
export async function downloadFile(url, params, fallbackName = 'download.pdf') {
  const response = await api.get(url, { params, responseType: 'blob' });

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
