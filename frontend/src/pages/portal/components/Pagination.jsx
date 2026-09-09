// Standard Laravel paginator meta ({ current_page, last_page, per_page,
// total, from, to }) rendered as a summary line + prev/next + page-size
// picker. Renders nothing when there's nothing to paginate (total === 0),
// same "don't show controls with nothing to control" rule as everywhere
// else in this app's empty states.
function Pagination({ meta, onPageChange, onPerPageChange, itemLabel = 'appointment' }) {
  if (!meta || !meta.total) return null;

  const { current_page: currentPage, last_page: lastPage, per_page: perPage, total, from, to } = meta;

  return (
    <div className="pagination-bar">
      <span className="pagination-summary">
        Showing {from}&ndash;{to} of {total} {itemLabel}{total === 1 ? '' : 's'}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Previous page"
        >
          &#8249;
        </button>
        <span className="pagination-page">{currentPage} / {lastPage}</span>
        <button
          type="button"
          className="pagination-btn"
          disabled={currentPage >= lastPage}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Next page"
        >
          &#8250;
        </button>
        <select
          className="form-select pagination-per-page"
          value={perPage}
          onChange={(e) => onPerPageChange(Number(e.target.value))}
        >
          <option value={10}>10 / page</option>
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
        </select>
      </div>
    </div>
  );
}

export default Pagination;
