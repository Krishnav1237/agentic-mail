import { useEffect, useMemo, useState } from 'react';
import { Activity, Bot, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import ConnectPrompt from '../components/ConnectPrompt';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import Pagination from '../components/Pagination';
import { approveAction, cancelAction, getActivityFeed, getAgentActions, type AgentActionRow } from '../lib/api';
import { useApp } from '../lib/appContext';
import { formatDateTime, getStatusTone } from '../lib/presentation';

const approvalStatuses = new Set(['preview', 'suggest', 'suggested']);

const parseNumber = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const parsePreview = (payload: Record<string, any>) => payload?.__preview ?? null;

export default function AgentPage() {
  const { hasToken, setStatus, syncing, status: appStatus } = useApp();
  const [params, setParams] = useSearchParams();
  const [actions, setActions] = useState<AgentActionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feed, setFeed] = useState<{ summary_date: string; summary: any } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const limit = parseNumber(params.get('limit'), 50);
  const offset = parseNumber(params.get('offset'), 0);
  const statusFilter = params.get('status') ?? '';

  useEffect(() => {
    if (!hasToken) return;
    setFeedLoading(true);
    getActivityFeed()
      .then((data) => setFeed(data.feed))
      .catch((error) => console.error(error))
      .finally(() => setFeedLoading(false));
  }, [hasToken]);

  useEffect(() => {
    if (!hasToken) return;
    setLoading(true);
    setLoadError(null);
    getAgentActions({ limit, offset, status: statusFilter || undefined })
      .then((data) => {
        setActions(data.actions);
        setTotal(data.total);
      })
      .catch((error) => {
        console.error(error);
        setLoadError(error instanceof Error ? error.message : 'Unable to load agent actions.');
        setStatus('Unable to load agent actions.');
      })
      .finally(() => setLoading(false));
  }, [hasToken, limit, offset, statusFilter, setStatus]);

  const approvals = useMemo(
    () => actions.filter((action) => approvalStatuses.has(action.status)),
    [actions]
  );

  const isProcessing = syncing || appStatus.toLowerCase().includes('sync');

  const handleApprove = async (actionId: string) => {
    console.log('AGENT_ACTION', { action: 'approve', actionId });
    setStatus('Approving action...');
    try {
      await approveAction(actionId);
      setStatus('Action approved.');
      const updated = await getAgentActions({ limit, offset, status: statusFilter || undefined });
      setActions(updated.actions);
      setTotal(updated.total);
    } catch (error) {
      console.error(error);
      console.log('AGENT_ACTION_ERROR', { action: 'approve', actionId, error });
      setStatus('Approval failed.');
    }
  };

  const handleCancel = async (actionId: string) => {
    console.log('AGENT_ACTION', { action: 'cancel', actionId });
    setStatus('Cancelling action...');
    try {
      await cancelAction(actionId, 'user_cancelled');
      setStatus('Action cancelled.');
      const updated = await getAgentActions({ limit, offset, status: statusFilter || undefined });
      setActions(updated.actions);
      setTotal(updated.total);
    } catch (error) {
      console.error(error);
      console.log('AGENT_ACTION_ERROR', { action: 'cancel', actionId, error });
      setStatus('Cancel failed.');
    }
  };

  if (!hasToken) {
    return <ConnectPrompt />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agent operations"
        title="Review what the autonomous system is doing over time."
        description="This is the trust layer for an agentic product: activity feeds, approval queues, and workflow-level history that explains what the system planned, executed, and learned."
        stats={[
          { label: 'Queued approvals', value: String(approvals.length), helper: 'Items still waiting on you' },
          { label: 'Actions visible', value: String(actions.length), helper: 'Current page of execution history' },
          { label: 'Total actions', value: String(total), helper: 'Server-paginated audit trail' },
          { label: 'Daily summary', value: feed?.summary_date ?? 'Not yet', helper: 'Latest activity feed snapshot' }
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <Activity size={16} className="text-neutral-300" />
            Daily activity feed
          </div>
          {feedLoading ? (
            <p className="mt-4 text-sm leading-7 text-neutral-300">Loading...</p>
          ) : feed ? (
            <div className="mt-4 space-y-4">
              <div className="status-pill">{feed.summary_date}</div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="surface-subtle">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">Actions taken</div>
                  <div className="mt-3 text-sm leading-7 text-neutral-400 font-light">
                    {feed.summary.actions_taken?.join(', ') || 'No actions yet'}
                  </div>
                </div>
                <div className="surface-subtle">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">Improvements</div>
                  <div className="mt-3 text-sm leading-7 text-neutral-400 font-light">
                    {feed.summary.improvements?.join(', ') || 'No improvements logged'}
                  </div>
                </div>
                <div className="surface-subtle">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">Insights</div>
                  <div className="mt-3 text-sm leading-7 text-neutral-400 font-light">
                    {feed.summary.insights?.join(', ') || 'No insights logged'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-7 text-neutral-300">
              {isProcessing ? 'Processing your emails...' : 'No data yet. Try syncing your inbox.'}
            </p>
          )}
        </div>

        <div className="surface-card">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <ShieldCheck size={16} className="text-neutral-400" />
            Approval policy
          </div>
          <p className="mt-4 text-sm leading-7 text-neutral-400 font-light">
            High-confidence safe actions can execute automatically depending on autopilot level. Riskier steps stay here for review, keeping the agent proactive without becoming opaque.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="status-pill">Preview queues</span>
            <span className="status-pill">Approval-first send</span>
            <span className="status-pill">Workflow trace logging</span>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <Bot size={16} className="text-neutral-300" />
            Approvals queue
          </div>
          <select
            className="form-select max-w-[220px]"
            value={statusFilter}
            onChange={(event) => setParams({ ...Object.fromEntries(params.entries()), status: event.target.value, offset: '0' })}
          >
            <option value="">All statuses</option>
            <option value="preview">Preview</option>
            <option value="suggest">Suggest</option>
            <option value="suggested">Suggested</option>
            <option value="approved">Approved</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {approvals.length === 0 ? (
          <p className="mt-4 text-sm leading-7 text-neutral-300">No actions waiting for approval right now.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {approvals.map((action) => {
              const preview = parsePreview(action.action_payload ?? {});
              return (
                <div key={action.id} className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`badge ${getStatusTone(action.status)}`}>{action.status}</span>
                        <span className="status-pill normal-case tracking-normal">{action.workflow_name ?? 'Workflow bundle'}</span>
                      </div>
                      <div className="mt-3 text-lg font-semibold text-neutral-100">{action.action_type}</div>
                      <div className="mt-1 text-sm text-neutral-300">
                        {action.subject ? `${action.subject} • ` : ''}
                        {action.sender_name ?? action.sender_email ?? 'Unknown sender'}
                      </div>
                      {preview?.summary && (
                        <p className="mt-3 text-sm leading-7 text-neutral-400 font-light">{preview.summary}</p>
                      )}
                      {action.decision_reason && (
                        <p className="mt-2 text-xs leading-6 text-neutral-300">Reason: {action.decision_reason}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-primary" onClick={() => handleApprove(action.id)}>Approve</button>
                      <button className="btn-danger" onClick={() => handleCancel(action.id)}>Cancel</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {loading ? (
        <div className="glass-card rounded-xl p-10 text-center text-neutral-300">Loading agent history...</div>
      ) : loadError ? (
        <EmptyState title="Agent history unavailable" message={loadError} />
      ) : actions.length === 0 ? (
        <EmptyState
          title={isProcessing ? 'Processing your emails...' : 'No agent actions yet'}
          message={isProcessing ? 'The agent is still working through your latest sync.' : 'No data yet. Try syncing your inbox.'}
        />
      ) : (
        <div className="space-y-3">
          {actions.map((action) => (
            <div key={action.id} className="glass-card rounded-xl px-4 py-4 md:px-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${getStatusTone(action.status)}`}>{action.status}</span>
                    {action.workflow_name && <span className="status-pill normal-case tracking-normal">{action.workflow_name}</span>}
                  </div>
                  <div className="mt-3 text-lg font-semibold text-neutral-100">{action.action_type}</div>
                  <div className="mt-1 text-sm text-neutral-300">
                    {action.subject ? `${action.subject} • ` : ''}
                    {action.sender_name ?? action.sender_email ?? 'No linked email'}
                  </div>
                  {action.decision_reason && (
                    <p className="mt-3 text-sm leading-7 text-neutral-400 font-light">{action.decision_reason}</p>
                  )}
                </div>
                <div className="text-right text-sm text-neutral-300">
                  <div>{formatDateTime(action.created_at)}</div>
                  <div className="mt-1">
                    {action.confidence !== null ? `Confidence ${Number(action.confidence).toFixed(2)}` : 'No score'}
                  </div>
                </div>
              </div>
            </div>
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
