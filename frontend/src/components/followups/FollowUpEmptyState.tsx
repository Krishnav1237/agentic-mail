export default function FollowUpEmptyState() {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center">
      <h3 className="text-lg font-semibold text-neutral-100">No follow-ups yet</h3>
      <p className="mt-2 text-sm text-neutral-400">
        The system will keep pending follow-ups visible here as they are scheduled.
      </p>
    </div>
  );
}

