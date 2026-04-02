type PaginationProps = {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
  onLimitChange: (limit: number) => void;
};

const pageSizes = [20, 50, 100];

export default function Pagination({
  total,
  limit,
  offset,
  onPageChange,
  onLimitChange,
}: PaginationProps) {
  const pageCount = Math.max(Math.ceil(total / limit), 1);
  const currentPage = Math.min(Math.floor(offset / limit) + 1, pageCount);
  const canPrev = currentPage > 1;
  const canNext = currentPage < pageCount;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + limit, total);

  return (
    <div className="glass-card flex flex-col gap-4 rounded-xl px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400 font-light">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
          Rows
        </span>
        <select
          className="form-select max-w-[92px] py-2"
          value={limit}
          onChange={(event) => onLimitChange(Number(event.target.value))}
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="status-pill normal-case tracking-normal">
          {rangeStart}-{rangeEnd} of {total}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm text-neutral-300">
          Page{' '}
          <span className="font-semibold text-neutral-100">{currentPage}</span>{' '}
          of {pageCount}
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            disabled={!canPrev}
            onClick={() => onPageChange(Math.max(offset - limit, 0))}
          >
            Previous
          </button>
          <button
            className="btn-ghost"
            disabled={!canNext}
            onClick={() => onPageChange(offset + limit)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
