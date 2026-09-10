/**
 * The V1 integration manager — opened from Settings' "Integrations" row.
 *
 * Deliberately a modal, not a page (Part 1 of the integrations spec):
 * Telegram is the only real integration this build ships, so a dedicated
 * route/nav entry would be architecture built for integrations that don't
 * exist yet. This surface is meant to be promoted into a real page once
 * there are several meaningful integrations to browse — until then it's one
 * `Dialog` with one card in it, not a catalog.
 *
 * Every control here reads/writes `telegramIntegrationStore` — no local
 * shadow state for `connected`/preferences, so the visual state is always
 * driven by the actual store rather than hardcoded UI (per the spec).
 */
import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Dialog, DialogRow, dialogFieldStyle } from './Dialog';
import { Button } from './controls';
import { Select } from './controls';
import { Toggle } from './controls';
import { GoldDot } from './primitives';
import {
  telegramActions,
  sendTestNotification,
  useTelegramIntegration,
} from '../../lib/telegramIntegrationStore';
import {
  DEADLINE_REMINDER_BY_LABEL,
  type TelegramDeadlineReminder,
} from '../../lib/telegramIntegration';
import { labelForValue, valueForLabel } from '../../lib/workspaceData';

const DEADLINE_REMINDER_LABELS = Object.keys(DEADLINE_REMINDER_BY_LABEL);

type TestStatus = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Where linking stands, client-side.
 *
 * `awaiting` is the state that did not exist before and could not be avoided:
 * the backend issues a single-use code, the user leaves for Telegram to press
 * Start, and a webhook completes the binding seconds later. Nothing the
 * frontend can do collapses that into the synchronous boolean flip this modal
 * used to perform — so the modal now waits, and says so.
 */
type LinkState =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'awaiting'; linkUrl: string; expiresAt: string }
  | { phase: 'error'; message: string };

/** How often to re-ask the server whether the webhook has landed. */
const LINK_POLL_MS = 3000;

function TelegramCard() {
  const integration = useTelegramIntegration();
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [link, setLink] = useState<LinkState>({ phase: 'idle' });
  const [testError, setTestError] = useState<string | null>(null);

  // A fresh open (or a disconnect) shouldn't keep showing a stale "Test
  // notification requested" note from a previous session.
  useEffect(() => {
    if (!integration.connected) setTestStatus('idle');
  }, [integration.connected]);

  // The webhook completes the link server-side, so the only way this tab finds
  // out is by asking. Polling stops the moment the answer is yes, or once the
  // code the user is holding has expired — continuing past that point would
  // just be asking a question whose answer can no longer change.
  useEffect(() => {
    if (link.phase !== 'awaiting') return;

    const expiresAt = new Date(link.expiresAt).getTime();
    const timer = setInterval(() => {
      if (Number.isFinite(expiresAt) && Date.now() > expiresAt) {
        setLink({
          phase: 'error',
          message: 'That link expired. Start again to get a fresh one.',
        });
        return;
      }
      void telegramActions.refresh();
    }, LINK_POLL_MS);

    return () => clearInterval(timer);
  }, [link]);

  // Once the store reports a real connection, the pending UI has nothing left
  // to say. Driven by the store rather than by the poll's return value, so a
  // link completed in another tab clears this one too.
  useEffect(() => {
    if (integration.connected && link.phase !== 'idle') setLink({ phase: 'idle' });
  }, [integration.connected, link.phase]);

  const startConnect = async () => {
    setLink({ phase: 'working' });
    const result = await telegramActions.connect();
    if (!result.ok) {
      setLink({ phase: 'error', message: result.reason });
      return;
    }
    setLink({
      phase: 'awaiting',
      linkUrl: result.linkUrl,
      expiresAt: result.expiresAt,
    });
    // Opening it for them is the whole point of a deep link. A blocked popup
    // is not a failure — the same URL stays on screen as a link below.
    window.open(result.linkUrl, '_blank', 'noopener,noreferrer');
  };

  const startDisconnect = async () => {
    setLink({ phase: 'working' });
    const result = await telegramActions.disconnect();
    setLink(result.ok ? { phase: 'idle' } : { phase: 'error', message: result.reason });
  };

  const runTestNotification = async () => {
    setTestStatus('sending');
    setTestError(null);
    const result = await sendTestNotification();
    setTestStatus(result.ok ? 'sent' : 'error');
    if (!result.ok) setTestError(result.reason);
  };

  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid rgb(var(--ink) / 0.08)',
        padding: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 180px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              font: '500 13.5px/1.3 Inter, sans-serif',
              color: 'var(--text-strong)',
            }}
          >
            Telegram
            {integration.connected && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  font: '500 11px/1 Inter, sans-serif',
                  color: 'var(--text-secondary)',
                }}
              >
                <GoldDot size={6} />
                Connected
              </span>
            )}
          </div>
          <p
            style={{
              margin: '4px 0 0',
              font: '400 12px/1.5 Inter, sans-serif',
              color: 'var(--text-faint)',
              maxWidth: 320,
            }}
          >
            Receive Obligo notifications for things that need your attention.
          </p>
        </div>
        <Button
          variant={integration.connected ? 'outline' : 'primary'}
          onClick={integration.connected ? startDisconnect : startConnect}
          disabled={link.phase === 'working'}
        >
          {link.phase === 'working'
            ? 'Working…'
            : integration.connected
              ? 'Disconnect Telegram'
              : 'Connect Telegram'}
        </Button>
      </div>

      {/* The pending half of linking. Present only while a code is live, and
          deliberately explicit that the next move is the user's — pressing
          Start in Telegram is what actually connects this. */}
      {link.phase === 'awaiting' && (
        <div
          role="status"
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid rgb(var(--ink) / 0.10)',
            font: '400 12px/1.6 Inter, sans-serif',
            color: 'var(--text-secondary)',
          }}
        >
          Telegram should have opened in a new tab — press <strong>Start</strong>{' '}
          there to finish connecting. This page updates on its own once you do.
          <br />
          <a
            href={link.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--text-strong)', textDecoration: 'underline' }}
          >
            Open the link again
          </a>{' '}
          if it didn't.
        </div>
      )}

      {link.phase === 'error' && (
        <div
          role="status"
          style={{
            marginTop: 12,
            font: '400 11.5px/1.5 Inter, sans-serif',
            color: 'rgb(var(--coral) / 0.85)',
          }}
        >
          {link.message}
        </div>
      )}

      {integration.connected && (
        <div style={{ marginTop: 16 }}>
          <div
            className="obligo-eyebrow"
            style={{ color: 'var(--text-faint)', marginBottom: 2 }}
          >
            Notifications
          </div>
          <DialogRow label="Urgent emails">
            <Toggle
              checked={integration.notificationPreferences.urgentEmails}
              onChange={(urgentEmails) =>
                telegramActions.updateNotificationPreferences({ urgentEmails })
              }
              label="Notify on urgent emails via Telegram"
            />
          </DialogRow>
          <DialogRow label="Follow-ups" last>
            <Toggle
              checked={integration.notificationPreferences.followUps}
              onChange={(followUps) =>
                telegramActions.updateNotificationPreferences({ followUps })
              }
              label="Notify on follow-ups via Telegram"
            />
          </DialogRow>

          <div
            className="obligo-eyebrow"
            style={{ color: 'var(--text-faint)', margin: '16px 0 2px' }}
          >
            Timing
          </div>
          <DialogRow label="Preferred notification time">
            <input
              type="time"
              value={integration.deliveryPreferences.preferredTime}
              onChange={(e) =>
                telegramActions.updateDeliveryPreferences({
                  preferredTime: e.target.value,
                })
              }
              aria-label="Preferred notification time"
              style={{ ...dialogFieldStyle, width: 120 }}
            />
          </DialogRow>
          <DialogRow label="Notify before deadline" last>
            <Select
              value={labelForValue(
                DEADLINE_REMINDER_BY_LABEL,
                integration.deliveryPreferences.deadlineReminder
              )}
              options={DEADLINE_REMINDER_LABELS}
              onChange={(label) =>
                telegramActions.updateDeliveryPreferences({
                  deadlineReminder: valueForLabel<TelegramDeadlineReminder>(
                    DEADLINE_REMINDER_BY_LABEL,
                    label,
                    '1d'
                  ),
                })
              }
              ariaLabel="Notify before deadline"
              align="right"
            />
          </DialogRow>

          <div
            style={{
              marginTop: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <Button
              variant="outline"
              onClick={runTestNotification}
              disabled={testStatus === 'sending'}
            >
              <Send size={13} strokeWidth={2} aria-hidden />
              {testStatus === 'sending' ? 'Sending…' : 'Send test notification'}
            </Button>
            <span
              role="status"
              style={{
                font: '400 11.5px/1.4 Inter, sans-serif',
                color:
                  testStatus === 'error'
                    ? 'rgb(var(--coral) / 0.85)'
                    : 'var(--text-faint)',
              }}
            >
              {/* "Accepted", not "delivered" — the backend can confirm that
                  Telegram took the message, which is as close to arrival as
                  this app can honestly claim. */}
              {testStatus === 'sent' && 'Test notification sent to your Telegram chat.'}
              {testStatus === 'error' &&
                (testError ?? "Couldn't send the test notification. Try again.")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function TelegramIntegrationModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Integrations"
      description="Connect external services Obligo can notify you through."
      width={460}
    >
      <TelegramCard />
    </Dialog>
  );
}
