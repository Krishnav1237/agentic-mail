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

function TelegramCard() {
  const integration = useTelegramIntegration();
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');

  // A fresh open (or a disconnect) shouldn't keep showing a stale "Test
  // notification requested" note from a previous session.
  useEffect(() => {
    if (!integration.connected) setTestStatus('idle');
  }, [integration.connected]);

  const runTestNotification = async () => {
    setTestStatus('sending');
    const result = await sendTestNotification();
    setTestStatus(result.ok ? 'sent' : 'error');
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
          onClick={() =>
            integration.connected
              ? telegramActions.disconnectIntegration()
              : telegramActions.connectIntegration()
          }
        >
          {integration.connected ? 'Disconnect Telegram' : 'Connect Telegram'}
        </Button>
      </div>

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
              {testStatus === 'sent' &&
                'Test notification requested — delivery depends on the backend connection.'}
              {testStatus === 'error' &&
                "Couldn't send the test notification. Try again."}
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
