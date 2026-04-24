export default function MustActSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="h-32 animate-pulse rounded-xl border border-neutral-800 bg-neutral-900"
        />
      ))}
    </div>
  );
}

