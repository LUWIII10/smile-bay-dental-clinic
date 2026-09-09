import Swal from 'sweetalert2';

// Same toast config RegisterWizard.jsx already established for its
// unsupported-HMO-provider warning — top-end corner, auto-dismiss, no
// confirm button. Centralized here so every other action across the portal
// uses the exact same look/feel instead of each page inventing its own.
const BASE_CONFIG = {
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
};

export function showSuccessToast(message) {
  Swal.fire({ ...BASE_CONFIG, icon: 'success', title: message });
}

export function showErrorToast(message) {
  Swal.fire({ ...BASE_CONFIG, icon: 'error', title: message });
}

export function showWarningToast(message) {
  Swal.fire({ ...BASE_CONFIG, icon: 'warning', title: message });
}

// Styled replacement for window.confirm() — same SweetAlert2 dependency the
// toasts above already use, just a modal instead of a toast. Colors match
// the portal's own tokens (--portal-blue/--portal-red-text) rather than
// SweetAlert2's defaults, so it doesn't look like a bolted-on library.
export async function confirmAction({
  title,
  text,
  icon = 'warning',
  confirmButtonText = 'Yes',
  confirmButtonColor = '#2952e3',
}) {
  const result = await Swal.fire({
    icon,
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: 'Cancel',
    confirmButtonColor,
    cancelButtonColor: '#6b7280',
    reverseButtons: true,
    focusCancel: true,
  });
  return result.isConfirmed;
}
