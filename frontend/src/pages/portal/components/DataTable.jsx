// Generic white-card table: light-gray uppercase header, thin row borders.
// Below 768px it collapses into stacked key/value "cards" via CSS alone
// (each <td> gets a data-label so ::before can render the column header).
//
// Column definitions accept optional layout hints, all opt-in and additive
// — a column that sets none of these behaves exactly as before:
//   - minWidth: sets the column's target width via <colgroup> (only takes
//     effect together with table-layout: fixed, applied automatically once
//     any column requests one, and only above the 768px breakpoint — the
//     mobile stacked layout ignores it entirely). This is a proportional
//     share (e.g. a percentage), not a hard floor — under `minWidthPx`.
//   - minWidthPx: an actual CSS min-width floor (px), layered on top of
//     `minWidth`'s proportional share. Lets a column shrink toward its
//     percentage on a wide viewport but never below this floor — once the
//     container can't fit every column's floor, the table (not the page)
//     grows past 100% and .data-table-wrap's own overflow-x:auto takes
//     over instead of content silently clipping. Purely additive: no
//     existing caller sets this, so every table without it is unaffected.
//   - align: 'left' | 'center' | 'right', applied to both header and cell.
//   - noWrap: forces single-line + ellipsis truncation on desktop (for
//     short identifiers/names where wrapping mid-value looks broken);
//     never applied on the mobile stacked layout, which still wraps.
//   - clampLines: caps text to N lines with an ellipsis (for longer free
//     text like a service name) instead of either wrapping indefinitely
//     or truncating to one line.
//   - headerColor: tints just that column's <th> text (e.g. a CSS color
//     value) — for a table like Activity Log's where each column heading
//     gets its own accent color. Omit it for the normal muted-gray header
//     text every other table already has.
function DataTable({ columns, rows, keyField = 'id', emptyMessage = 'No records found.' }) {
  if (!rows || rows.length === 0) {
    return <div className="data-table-empty">{emptyMessage}</div>;
  }

  const hasColumnWidths = columns.some((c) => c.minWidth);

  const cellStyle = (column) => {
    const style = {};
    if (column.align) style.textAlign = column.align;
    if (column.minWidthPx) style.minWidth = column.minWidthPx;
    return Object.keys(style).length ? style : undefined;
  };

  const headerStyle = (column) => {
    const style = cellStyle(column) || {};
    if (column.headerColor) style.color = column.headerColor;
    return Object.keys(style).length ? style : undefined;
  };

  return (
    <div className="data-table-wrap">
      <table className={`data-table${hasColumnWidths ? ' data-table--fixed' : ''}`}>
        {hasColumnWidths && (
          <colgroup>
            {columns.map((column) => {
              const colStyle = {};
              if (column.minWidth) colStyle.width = column.minWidth;
              if (column.minWidthPx) colStyle.minWidth = column.minWidthPx;
              return (
                <col key={column.key} style={Object.keys(colStyle).length ? colStyle : undefined} />
              );
            })}
          </colgroup>
        )}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={headerStyle(column)}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[keyField]}>
              {columns.map((column) => {
                const cellClass = [
                  column.noWrap && 'data-table-cell-nowrap',
                  column.clampLines && 'data-table-cell-clamp',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined;

                // data-label feeds the stacked-card ::before content below
                // the breakpoint, which needs a plain string — column.label
                // itself may be JSX (e.g. a clickable sort control), so fall
                // back to mobileLabel when label isn't already a string.
                const labelText = typeof column.label === 'string' ? column.label : (column.mobileLabel || '');

                return (
                  <td
                    key={column.key}
                    data-label={labelText}
                    style={cellStyle(column)}
                    className={cellClass}
                  >
                    <span
                      className="data-table-value"
                      style={column.clampLines ? { WebkitLineClamp: column.clampLines } : undefined}
                    >
                      {column.render ? column.render(row) : row[column.key]}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
