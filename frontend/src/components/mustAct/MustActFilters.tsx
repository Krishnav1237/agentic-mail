type MustActFiltersProps = {
  status: string;
  onStatusChange: (status: string) => void;
};

export default function MustActFilters({ status, onStatusChange }: MustActFiltersProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
        Filter
      </span>
      <select
        className="form-select max-w-[180px]"
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
      >
        <option value="open">Open</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="deferred">Deferred</option>
        <option value="edited">Edited</option>
      </select>
    </div>
  );
}

