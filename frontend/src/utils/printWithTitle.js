// Shared by every browser-print button (Patient Records' two print surfaces,
// Reports) — Chromium's "Save as PDF" print destination suggests
// document.title as the filename, so this sets a descriptive one just for
// the print, then puts the real title back once the print dialog is
// actually done with it.
//
// window.print() does NOT block the calling script in modern Chromium —
// it returns immediately while the print preview opens asynchronously in a
// separate UI surface, so restoring document.title right after the call
// (the naive approach) undoes the title before the dialog ever reads it.
// The 'afterprint' event is the standard, reliable signal that the dialog
// has actually closed (printed or cancelled either way), so the restore is
// hooked to that instead of a synchronous line right after window.print().
export function printWithTitle(title) {
  const prevTitle = document.title;
  const restore = () => {
    document.title = prevTitle;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  document.title = title;
  window.print();
}
