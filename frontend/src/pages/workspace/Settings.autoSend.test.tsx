// @vitest-environment jsdom
/**
 * Real render + click coverage for the two pieces this pass added to
 * Settings — `AutoSendExplainerDialog` and `AutoSendTelegramWarning`. Both
 * are exported from `Settings.tsx` specifically so they can be rendered here
 * directly, without pulling the rest of the page (and its drag-and-drop
 * sections) into a jsdom render.
 *
 * `agentPreferences.test.ts` and `autoSendTelegramWarning.test.ts` pin the
 * LOGIC (the predicate, and both store-update orderings). This file pins
 * that the actual rendered UI reflects that logic and that its buttons call
 * the right callbacks — the class of bug a type checker cannot catch.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoSendExplainerDialog, AutoSendTelegramWarning } from './Settings';

// No global setupFile for this one jsdom-opted-in file — cleanup here instead,
// or each test's render accumulates in the same document and later queries
// (e.g. getByText) start matching leftover nodes from earlier tests.
afterEach(() => {
  cleanup();
});

describe('AutoSendExplainerDialog', () => {
  it('does not show the Telegram-disconnected warning when Telegram is connected', () => {
    render(
      <AutoSendExplainerDialog
        open
        telegramConnected={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.getByText(/Turn on auto-send\?/i)).toBeTruthy();
    expect(screen.queryByText(/isn't connected right now/i)).toBeNull();
  });

  it('shows the distinct disconnected warning when Telegram is NOT connected', () => {
    render(
      <AutoSendExplainerDialog
        open
        telegramConnected={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.getByText(/isn't connected right now/i)).toBeTruthy();
    expect(
      screen.getByText(/only way to stop a pending reply is to open Obligo yourself/i)
    ).toBeTruthy();
  });

  it('calls onConfirm — and not onCancel — when the primary button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <AutoSendExplainerDialog
        open
        telegramConnected={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Turn on auto-send' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel — and not onConfirm — when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <AutoSendExplainerDialog
        open
        telegramConnected={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    render(
      <AutoSendExplainerDialog
        open={false}
        telegramConnected={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.queryByText(/Turn on auto-send\?/i)).toBeNull();
  });
});

describe('AutoSendTelegramWarning', () => {
  it('calls onReconnectTelegram when its button is clicked, not onDisable', async () => {
    const user = userEvent.setup();
    const onReconnectTelegram = vi.fn();
    const onDisable = vi.fn();
    render(
      <AutoSendTelegramWarning
        onReconnectTelegram={onReconnectTelegram}
        onDisable={onDisable}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Reconnect Telegram' }));
    expect(onReconnectTelegram).toHaveBeenCalledTimes(1);
    expect(onDisable).not.toHaveBeenCalled();
  });

  it('calls onDisable when its button is clicked, not onReconnectTelegram', async () => {
    const user = userEvent.setup();
    const onReconnectTelegram = vi.fn();
    const onDisable = vi.fn();
    render(
      <AutoSendTelegramWarning
        onReconnectTelegram={onReconnectTelegram}
        onDisable={onDisable}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Disable auto-send' }));
    expect(onDisable).toHaveBeenCalledTimes(1);
    expect(onReconnectTelegram).not.toHaveBeenCalled();
  });

  it('states both the "not recommended" judgment and the reason, not just one', () => {
    render(<AutoSendTelegramWarning onReconnectTelegram={() => {}} onDisable={() => {}} />);
    expect(screen.getByText(/isn't recommended/i)).toBeTruthy();
    expect(screen.getByText(/can only be cancelled by opening/i)).toBeTruthy();
  });
});
