// Generic white-card table: light-gray uppercase header, thin row borders.
// Below 768px it collapses into stacked key/value "cards" via CSS alone
// (each <td> gets a data-label so ::before can render the column header).
function DataTable({ columns, rows, keyField = 'id', emptyMessage = 'No records found.' }) {
  if (!rows || rows.length === 0) {
    return <div className="data-table-empty">{emptyMessage}</div>;
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[keyField]}>
              {columns.map((column) => (
                <td key={column.key} data-label={column.label}>
                  <span className="data-table-value">
                    {column.render ? column.render(row) : row[column.key]}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
