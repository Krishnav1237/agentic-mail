import { useEffect, useMemo, useState } from 'react';
import { Inbox, Search, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import ConnectPrompt from '../components/ConnectPrompt';
import EmailRow from '../components/EmailRow';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import Pagination from '../components/Pagination';
import { generateReply, getEmails, markImportant, type EmailRow as Email } from '../lib/api';
import { useApp } from '../lib/appContext';

const parseNumber = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export default function InboxPage() {
  const { hasToken, setStatus } = useApp();
  const [params, setParams] = useSearchParams();
  const [emails, setEmails] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const limit = parseNumber(params.get('limit'), 50);
  const offset = parseNumber(params.get('offset'), 0);
  const query = params.get('query') ?? '';
  const classification = params.get('classification') ?? '';
  const status = params.get('status') ?? '';

  useEffect(() => {
    if (!hasToken) return;
    setLoading(true);
    getEmails({
      limit,
      offset,
      query: query || undefined,
      classification: classification || undefined,
      status: status || undefined
    })
      .then((data) => {
        setEmails(data.emails);
        setTotal(data.total);
      })
      .catch((error) => {
        console.error(error);
        setStatus('Unable to load inbox.');
      })
      .finally(() => setLoading(false));
  }, [hasToken, limit, offset, query, classification, status, setStatus]);

  const handleAction = async (label: string, action: () => Promise<unknown>) => {
    setStatus(`${label}...`);
    try {
      await action();
      setStatus(`${label} done.`);
    } catch (error) {
      console.error(error);
      setStatus(`${label} failed.`);
    }
  };

  const stats = useMemo(() => ({
    processed: emails.filter((email) => email.status === 'processed').length,
    pending: emails.filter((email) => email.status === 'pending').length,
    highSignal: emails.filter((email) => (email.ai_score ?? 0) >= 2).length
  }), [emails]);

  if (!hasToken) {
    return <ConnectPrompt />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inbox intelligence"
        title="Inspect what the system saw in the inbox."
        description="This is the structured email view: classification, confidence, sender context, and direct action controls without making you read raw message lists all day."
        stats={[
          { label: 'Inbox rows', value: String(total), helper: 'Server-paginated email list' },
          { label: 'Processed on page', value: String(stats.processed), helper: 'Already interpreted by the system' },
          { label: 'Pending on page', value: String(stats.pending), helper: 'Queued or still processing' },
          { label: 'High-signal on page', value: String(stats.highSignal), helper: 'AI score above 2.00' }
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.3fr_repeat(2,minmax(0,0.45fr))_0.8fr]">
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <Search size={16} className="text-neutral-300" />
            Search and filter inbox
          </div>
          <input
            className="form-input mt-4"
            placeholder="Search sender, subject, or message context"
            value={query}
            onChange={(event) => setParams({ ...Object.fromEntries(params.entries()), query: event.target.value, offset: '0' })}
          />
        </div>

        <div className="glass-card rounded-xl p-5">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">Classification</label>
          <select
            className="form-select mt-4"
            value={classification}
            onChange={(event) => setParams({ ...Object.fromEntries(params.entries()), classification: event.target.value, offset: '0' })}
          >
            <option value="">All</option>
            <option value="assignment">Assignment</option>
            <option value="internship">Internship</option>
            <option value="event">Event</option>
            <option value="academic">Academic</option>
            <option value="personal">Personal</option>
            <option value="spam">Spam</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="glass-card rounded-xl p-5">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">Processing status</label>
          <select
            className="form-select mt-4"
            value={status}
            onChange={(event) => setParams({ ...Object.fromEntries(params.entries()), status: event.target.value, offset: '0' })}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="processed">Processed</option>
          </select>
        </div>

        <div className="surface-card">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <ShieldCheck size={16} className="text-neutral-400" />
            Inbox trust rail
          </div>
          <p className="mt-4 text-sm leading-7 text-neutral-400 font-light">
            Drafts are allowed. Sending stays guarded and requires approval.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <span className="status-pill">Classification visibility</span>
        <span className="status-pill">Message-level actions</span>
        <span className="status-pill">Confidence-aware summaries</span>
      </div>

      {loading ? (
        <div className="glass-card rounded-xl p-10 text-center text-neutral-300">Loading inbox...</div>
      ) : emails.length === 0 ? (
        <EmptyState title="No emails found" message="Try adjusting filters or sync again. This view is built to stay useful even as your inbox grows." />
      ) : (
        <div className="space-y-3">
          {emails.map((email) => (
            <EmailRow
              key={email.id}
              email={email}
              onMarkImportant={(item) => handleAction('Marked important', () => markImportant(item.message_id))}
              onDraftReply={(item) => handleAction('Reply drafted', () => generateReply(item.message_id))}
            />
          ))}
        </div>
      )}

      <Pagination
        total={total}
        limit={limit}
        offset={offset}
        onPageChange={(nextOffset) => setParams({ ...Object.fromEntries(params.entries()), offset: String(nextOffset) })}
        onLimitChange={(nextLimit) => setParams({ ...Object.fromEntries(params.entries()), limit: String(nextLimit), offset: '0' })}
      />
    </div>
  );
}
