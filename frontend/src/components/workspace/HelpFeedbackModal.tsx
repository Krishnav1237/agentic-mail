/**
 * Help & Feedback — reached from the avatar menu, not a sidebar page (Part 2
 * of the spec: the app already has many primary navigation items, and this
 * is "how the user communicates with the IIL team", a different concern
 * from Settings/Profile/Mail — see Part 3's information architecture).
 *
 * One shared form structure handles all four categories (Get help / Report
 * a bug / Give feedback / Suggest a feature) rather than four near-identical
 * components — they differ only in prompt copy and whether the optional
 * "what were you doing" field and auto-attached context appear.
 */
import { useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { Bug, LifeBuoy, MessageSquarePlus, Sparkles } from 'lucide-react';
import { Dialog, dialogFieldStyle } from './Dialog';
import { Button } from './controls';
import { useUserProfile } from '../../lib/userProfileStore';
import {
  submitFeedback,
  type FeedbackCategory,
  type FeedbackContext,
} from '../../lib/feedback';

/** Matches `package.json`'s own version — the one non-sensitive build
 * identifier worth attaching to a bug report. */
const APP_VERSION = '1.0.0';

const CATEGORY_META: Record<
  FeedbackCategory,
  {
    label: string;
    icon: typeof LifeBuoy;
    prompt: string;
    detailPrompt?: string;
    submitLabel: string;
  }
> = {
  help: {
    label: 'Get help',
    icon: LifeBuoy,
    prompt: 'What do you need help with?',
    submitLabel: 'Send',
  },
  bug: {
    label: 'Report a bug',
    icon: Bug,
    prompt: 'What went wrong?',
    detailPrompt: 'What were you doing?',
    submitLabel: 'Send',
  },
  feedback: {
    label: 'Give feedback',
    icon: MessageSquarePlus,
    prompt: 'Tell us what you think.',
    submitLabel: 'Send',
  },
  feature: {
    label: 'Suggest a feature',
    icon: Sparkles,
    prompt: 'What would you like to see?',
    submitLabel: 'Send',
  },
};

const textareaStyle: CSSProperties = {
  ...dialogFieldStyle,
  minHeight: 92,
  resize: 'vertical',
  fontFamily: 'inherit',
};

const fieldLabelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 6,
  font: '400 12.5px/1.3 Inter, sans-serif',
  color: 'var(--text-secondary)',
};

type SubmitStatus = 'idle' | 'sending' | 'sent' | 'error';

/** Reads the non-sensitive context a bug report auto-attaches — current
 * route, theme, viewport, app version — so the user never has to type out
 * "I was on the Inbox page in dark mode" themselves.
 *
 * Reads `<html class="light">` directly rather than through
 * `useWorkspaceTheme` — that hook stamps/strips `.iil-workspace` on
 * `<html>` for its own lifetime (see its doc comment), on the assumption
 * that `AppShell` is its only concurrent consumer for the whole session. A
 * second live instance here would unmount every time this form closes
 * (category change, Back, Done) and rip `.iil-workspace` off `<html>` while
 * `AppShell`'s own instance was still mounted and depending on it — which is
 * exactly what broke light mode: the global `html.light` invert filter
 * (meant only for the Landing page) would reactivate under the workspace
 * until a full reload remounted `AppShell` and re-added the class. This
 * needs a one-off value for a form payload, not a live subscription, so a
 * plain read has no such side effect to have. */
function useFeedbackContext(): FeedbackContext {
  const location = useLocation();
  const theme: 'dark' | 'light' =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('light')
      ? 'light'
      : 'dark';
  return {
    route: location.pathname,
    theme,
    viewport:
      typeof window !== 'undefined'
        ? `${window.innerWidth}×${window.innerHeight}`
        : '',
    appVersion: APP_VERSION,
  };
}

function CategoryPicker({
  onSelect,
}: {
  onSelect: (category: FeedbackCategory) => void;
}) {
  return (
    <div>
      <p
        style={{
          margin: '0 0 12px',
          font: '400 13px/1.5 Inter, sans-serif',
          color: 'var(--text-secondary)',
        }}
      >
        How can we help?
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {(Object.keys(CATEGORY_META) as FeedbackCategory[]).map((key) => {
          const meta = CATEGORY_META[key];
          const Icon = meta.icon;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className="iil-btn iil-btn--outline"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 8,
                height: 'auto',
                padding: '14px 12px',
                textAlign: 'left',
              }}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden />
              <span style={{ font: '500 12.5px/1.3 Inter, sans-serif' }}>
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FeedbackForm({
  category,
  onBack,
  onDone,
}: {
  category: FeedbackCategory;
  onBack: () => void;
  onDone: () => void;
}) {
  const meta = CATEGORY_META[category];
  const profile = useUserProfile();
  const context = useFeedbackContext();
  const [message, setMessage] = useState('');
  const [detail, setDetail] = useState('');
  const [status, setStatus] = useState<SubmitStatus>('idle');

  const canSubmit = message.trim().length > 0 && status !== 'sending';

  const submit = async () => {
    if (!canSubmit) return;
    setStatus('sending');
    const result = await submitFeedback({
      category,
      message: message.trim(),
      detail: meta.detailPrompt ? detail.trim() || undefined : undefined,
      email: profile.email,
      displayName: profile.displayName,
      context,
    });
    setStatus(result.ok ? 'sent' : 'error');
  };

  if (status === 'sent') {
    return (
      <div>
        <p
          style={{
            margin: 0,
            font: '400 13px/1.6 Inter, sans-serif',
            color: 'var(--text-secondary)',
          }}
        >
          Sent — thanks for letting us know. The IIL team can follow up at{' '}
          {profile.email}.
        </p>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="outline" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="feedback-message" style={fieldLabelStyle}>
        {meta.prompt}
      </label>
      <textarea
        id="feedback-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        style={textareaStyle}
        autoFocus
      />

      {meta.detailPrompt && (
        <div style={{ marginTop: 12 }}>
          <label htmlFor="feedback-detail" style={fieldLabelStyle}>
            {meta.detailPrompt}
          </label>
          <textarea
            id="feedback-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            style={{ ...textareaStyle, minHeight: 64 }}
          />
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <label htmlFor="feedback-email" style={fieldLabelStyle}>
          User email
        </label>
        <input
          id="feedback-email"
          type="email"
          value={profile.email}
          readOnly
          style={{ ...dialogFieldStyle, color: 'var(--text-secondary)' }}
        />
      </div>

      {category === 'bug' && (
        <p
          style={{
            margin: '10px 0 0',
            font: '400 11px/1.5 Inter, sans-serif',
            color: 'var(--text-faint)',
          }}
        >
          We'll include your current page, theme and viewport to help us
          reproduce the issue.
        </p>
      )}

      {status === 'error' && (
        <p
          style={{
            margin: '10px 0 0',
            font: '400 11.5px/1.4 Inter, sans-serif',
            color: 'rgb(var(--coral) / 0.85)',
          }}
        >
          Couldn't send that. Try again.
        </p>
      )}

      <div
        style={{
          marginTop: 16,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Button variant="ghost" onClick={onBack} disabled={status === 'sending'}>
          Back
        </Button>
        <Button variant="primary" onClick={submit} disabled={!canSubmit}>
          {status === 'sending' ? 'Sending…' : meta.submitLabel}
        </Button>
      </div>
    </div>
  );
}

export function HelpFeedbackModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<FeedbackCategory | null>(null);

  const close = () => {
    onClose();
    // Reset after the close animation reads, not before — an abrupt jump
    // back to the picker while the dialog is still visibly closing would
    // read as the selection being discarded mid-click.
    setTimeout(() => setCategory(null), 200);
  };

  return (
    <Dialog open={open} onClose={close} title="Help & Feedback" width={420}>
      {category ? (
        <FeedbackForm
          category={category}
          onBack={() => setCategory(null)}
          onDone={close}
        />
      ) : (
        <CategoryPicker onSelect={setCategory} />
      )}
    </Dialog>
  );
}
