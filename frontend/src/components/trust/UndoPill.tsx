type UndoPillProps = {
  disabled?: boolean;
  onClick: () => void;
  label?: string;
};

export default function UndoPill({ disabled, onClick, label }: UndoPillProps) {
  return (
    <button className="btn-ghost h-8 px-3 py-1 text-xs" onClick={onClick} disabled={disabled}>
      {label ?? 'Undo'}
    </button>
  );
}

