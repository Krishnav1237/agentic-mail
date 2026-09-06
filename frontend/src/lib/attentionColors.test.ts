/**
 * The attention-colour preference, and the Quick Access collapse state that
 * shipped alongside it.
 *
 * Three things are being pinned here, and only the first is about colour:
 *
 *   1. The PALETTE contract — five options per axis, disjoint between the two,
 *      defaults that are the colours the product already shipped.
 *   2. The WIRE contract — a semantic name goes to storage, never a rendered
 *      RGB value, so retuning a pigment in CSS can never invalidate a stored
 *      or server-held preference.
 *   3. BACKWARD COMPATIBILITY — a settings blob written before these fields
 *      existed still loads, still keeps every unrelated preference it had, and
 *      resolves the new ones to the shipped defaults.
 *
 * What is NOT tested here, deliberately: which pixels any of this paints.
 * The enum → token mapping lives entirely in `index.css` as data-attribute
 * selectors, which is the point of the design — there is no TypeScript branch
 * on the preference to test, and asserting on hex values here would just
 * duplicate the stylesheet in a second place that could then disagree with it.
 * The propagation itself is verified in the browser.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_IMPORTANCE_COLOR,
  DEFAULT_URGENCY_COLOR,
  IMPORTANCE_COLOR_KEYS,
  IMPORTANCE_COLOR_OPTIONS,
  URGENCY_COLOR_KEYS,
  URGENCY_COLOR_OPTIONS,
} from './attentionColors';
import {
  ATTENTION_STATES,
  isImportant,
  isUrgent,
  needsAttention,
} from './attention';
import {
  attentionDotFill,
  attentionMetaColor,
  attentionRailFill,
  attentionVisual,
  deadlineMetaColor,
} from '../components/workspace/attention';
import {
  DEFAULT_PREFERENCES,
  sanitizePreferences,
  type AgentPreferences,
} from './agentPreferences';
import { ALL_MAIL_VIEW_IDS } from './mailViews';

type SettingsStore = typeof import('./settingsStore');

let settings: SettingsStore;
let storage: Map<string, string>;

const STORAGE_KEY = 'obligo-agent-preferences';

beforeEach(async () => {
  storage = new Map();
  // Same stub `settingsIntegration.test.ts` uses, and for the same reason:
  // the store guards on `typeof window === 'undefined'`, so without a
  // `window` every persistence assertion below would pass vacuously.
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
  });
  vi.resetModules();
  settings = await import('./settingsStore');
});

/** Re-imports the store so it re-reads what the previous instance persisted —
 * the only way to distinguish "held in memory" from "survives a reload". */
async function reload(): Promise<SettingsStore> {
  vi.resetModules();
  return import('./settingsStore');
}

describe('the palettes themselves', () => {
  it('offers five options on each axis', () => {
    expect(URGENCY_COLOR_OPTIONS).toHaveLength(5);
    expect(IMPORTANCE_COLOR_OPTIONS).toHaveLength(5);
  });

  it('never offers the same colour on both axes', () => {
    // The two axes have to stay tellable apart at a glance, which they cannot
    // if a user can set both to the same pigment.
    const shared = URGENCY_COLOR_KEYS.filter((k) =>
      (IMPORTANCE_COLOR_KEYS as string[]).includes(k)
    );
    expect(shared).toEqual([]);
  });

  it('gives every option a distinct key and a real label', () => {
    for (const list of [URGENCY_COLOR_OPTIONS, IMPORTANCE_COLOR_OPTIONS]) {
      expect(new Set(list.map((o) => o.key)).size).toBe(list.length);
      for (const option of list) {
        expect(option.label.trim()).not.toBe('');
        // Selection must never be communicated by colour alone, which starts
        // with every option having a name to communicate it WITH.
        expect(option.label).not.toBe(option.key);
      }
    }
  });

  it('renders every swatch from a token, never a literal colour', () => {
    // A hardcoded hex here would be a second copy of a value index.css already
    // owns — i.e. exactly the drift this token layer exists to prevent, and it
    // would let the picker preview a colour the app does not actually paint.
    for (const option of [
      ...URGENCY_COLOR_OPTIONS,
      ...IMPORTANCE_COLOR_OPTIONS,
    ]) {
      expect(option.swatch).toContain('var(--');
      expect(option.swatch).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  it('defaults to the coral + gold pair the product already shipped', () => {
    expect(DEFAULT_URGENCY_COLOR).toBe('coral');
    expect(DEFAULT_IMPORTANCE_COLOR).toBe('gold');
    expect(DEFAULT_PREFERENCES.urgencyColor).toBe('coral');
    expect(DEFAULT_PREFERENCES.importanceColor).toBe('gold');
  });
});

describe('sanitization', () => {
  it('resolves absent colour fields to the defaults', () => {
    const result = sanitizePreferences({});
    expect(result.urgencyColor).toBe('coral');
    expect(result.importanceColor).toBe('gold');
  });

  it('accepts every offered option on each axis', () => {
    for (const key of URGENCY_COLOR_KEYS) {
      expect(sanitizePreferences({ urgencyColor: key }).urgencyColor).toBe(key);
    }
    for (const key of IMPORTANCE_COLOR_KEYS) {
      expect(
        sanitizePreferences({ importanceColor: key }).importanceColor
      ).toBe(key);
    }
  });

  it('falls back to the default for a value outside the palette', () => {
    const raw = {
      urgencyColor: 'chartreuse',
      importanceColor: '#ff0000',
    } as unknown;
    const result = sanitizePreferences(raw);
    expect(result.urgencyColor).toBe('coral');
    expect(result.importanceColor).toBe('gold');
  });

  it('will not accept a colour from the other axis', () => {
    // `teal` is an importance option; asking for it as urgency is as invalid
    // as asking for a colour that does not exist at all.
    const raw = { urgencyColor: 'teal', importanceColor: 'coral' } as unknown;
    const result = sanitizePreferences(raw);
    expect(result.urgencyColor).toBe('coral');
    expect(result.importanceColor).toBe('gold');
  });

  it('defaults quickAccessCollapsed to expanded and keeps a real boolean', () => {
    expect(DEFAULT_PREFERENCES.quickAccessCollapsed).toBe(false);
    expect(sanitizePreferences({}).quickAccessCollapsed).toBe(false);
    expect(
      sanitizePreferences({ quickAccessCollapsed: true }).quickAccessCollapsed
    ).toBe(true);
    expect(
      sanitizePreferences({
        quickAccessCollapsed: 'yes',
      } as unknown).quickAccessCollapsed
    ).toBe(false);
  });
});

describe('an existing settings blob from before these fields existed', () => {
  /** Exactly what the previous build persisted: every field it knew about,
   * none of the three added since. */
  const legacyBlob = {
    replyDrafting: 'off',
    replyTone: 'friendly',
    automation: { archive: 'automatic', label: 'never', followup: 'suggest' },
    cleanup: {
      promotions: 'archive',
      newsletters: 'keep',
      marketing: 'spam',
      banking: 'keep',
    },
    topicWeights: {
      career: 9,
      academic: 2,
      finance: 5,
      personal: 5,
      health: 5,
      networking: 5,
      travel: 5,
      shopping: 1,
    },
    beta: true,
  };

  it('loads, and receives the defaults for the fields it has never heard of', () => {
    const result = sanitizePreferences(legacyBlob);
    expect(result.urgencyColor).toBe('coral');
    expect(result.importanceColor).toBe('gold');
    expect(result.quickAccessCollapsed).toBe(false);
  });

  it('keeps every unrelated preference exactly as it was', () => {
    const result = sanitizePreferences(legacyBlob);
    expect(result.replyDrafting).toBe('off');
    expect(result.replyTone).toBe('friendly');
    // Labeling no longer exists (dropped entirely), and Follow-ups collapsed
    // from never/suggest/automatic to off/on — this blob's 'suggest' is the
    // legacy value that migrates forward to 'on' rather than being dropped.
    expect(result.automation).toEqual({ archive: 'automatic', followup: 'on' });
    expect(result.cleanup).toEqual(legacyBlob.cleanup);
    expect(result.beta).toBe(true);
  });

  it('migrates the legacy topicWeights blob into an ordered highPriorityTopics list', () => {
    // Only `career` (9) sat strictly above the old neutral value (5) —
    // `shopping` (1) and `academic` (2) were BELOW neutral, which the old
    // rule also treated as "not high", so they correctly do not survive
    // into the new list either.
    const result = sanitizePreferences(legacyBlob);
    expect(result.highPriorityTopics).toEqual(['career']);
  });

  it('hydrates through the store without disturbing anything it already held', async () => {
    settings.settingsActions.hydrate(legacyBlob);
    const prefs = settings.getAgentPreferences();
    expect(prefs.urgencyColor).toBe('coral');
    expect(prefs.beta).toBe(true);
    expect(prefs.highPriorityTopics).toEqual(['career']);
  });
});

describe('changing a colour', () => {
  it('changes only the axis asked for', () => {
    settings.settingsActions.update({ urgencyColor: 'magenta' });
    expect(settings.getAgentPreferences().urgencyColor).toBe('magenta');
    expect(settings.getAgentPreferences().importanceColor).toBe('gold');

    settings.settingsActions.update({ importanceColor: 'violet' });
    expect(settings.getAgentPreferences().urgencyColor).toBe('magenta');
    expect(settings.getAgentPreferences().importanceColor).toBe('violet');
  });

  it('leaves every other preference untouched', () => {
    settings.settingsActions.update({ replyTone: 'professional', beta: true });
    settings.settingsActions.update({
      urgencyColor: 'rose',
      importanceColor: 'blue',
    });
    const prefs = settings.getAgentPreferences();
    expect(prefs.replyTone).toBe('professional');
    expect(prefs.beta).toBe(true);
    expect(prefs.replyDrafting).toBe(DEFAULT_PREFERENCES.replyDrafting);
    expect(prefs.cleanup).toEqual(DEFAULT_PREFERENCES.cleanup);
  });

  it('notifies subscribers, which is what repaints the application', () => {
    // The whole propagation path is: store change → emit → AppShell
    // re-renders → data attribute changes → CSS repaints every surface. If
    // the emit doesn't happen, nothing downstream does.
    let notified = 0;
    const unsubscribe = settings.subscribeToPreferences(() => (notified += 1));
    settings.settingsActions.update({ urgencyColor: 'crimson' });
    settings.settingsActions.update({ importanceColor: 'green' });
    unsubscribe();
    expect(notified).toBe(2);
  });

  it('sends the semantic name over the wire, not a rendered colour', async () => {
    settings.settingsActions.update({
      urgencyColor: 'crimson',
      importanceColor: 'green',
    });
    const written = JSON.parse(storage.get(STORAGE_KEY)!) as AgentPreferences;
    expect(written.urgencyColor).toBe('crimson');
    expect(written.importanceColor).toBe('green');
    // The backend contract must stay stable even if the palette is retuned,
    // so no rendered value may appear in the payload at all.
    const payload = storage.get(STORAGE_KEY)!;
    expect(payload).not.toMatch(/#[0-9a-f]{6}/i);
    expect(payload).not.toMatch(/rgba?\(/i);
  });

  it('survives a reload', async () => {
    settings.settingsActions.update({
      urgencyColor: 'amber',
      importanceColor: 'teal',
    });
    const reloaded = await reload();
    expect(reloaded.getAgentPreferences().urgencyColor).toBe('amber');
    expect(reloaded.getAgentPreferences().importanceColor).toBe('teal');
  });

  it('is restored to coral + gold by Reset to defaults', () => {
    settings.settingsActions.update({
      urgencyColor: 'magenta',
      importanceColor: 'violet',
    });
    settings.settingsActions.reset();
    expect(settings.getAgentPreferences().urgencyColor).toBe('coral');
    expect(settings.getAgentPreferences().importanceColor).toBe('gold');
  });
});

/**
 * The Settings preview renders one demo row and switches it between the three
 * attention states that HAVE a colour to preview. What is pinned here is the
 * contract that preview rests on, not its markup: the tests run in `node` with
 * no DOM (see `vite.config.ts` — deliberately, since everything else under
 * test is pure), so the switching interaction and the panel widths from part
 * one of this pass were verified in the browser instead.
 *
 * These two properties are the ones that could regress silently and would not
 * be obvious on screen:
 *
 *   · the preview offers exactly the states worth previewing, derived from the
 *     model rather than hand-listed;
 *   · every visual it renders resolves through the `--attention-*` token
 *     layer, which is the ONLY reason it tracks the user's chosen pigment. A
 *     literal sneaking into any of these functions would still look right in
 *     the default palette and quietly stop following the preference.
 */
describe('the states the attention preview can show', () => {
  const previewable = ATTENTION_STATES.filter((s) =>
    needsAttention(s.attention)
  );

  it('is exactly the three states that have a colour to preview', () => {
    expect(previewable.map((s) => s.key)).toEqual([
      'urgent-important',
      'urgent',
      'important',
    ]);
  });

  it('excludes normal — a state with neither axis raised has nothing to show', () => {
    expect(previewable.some((s) => s.key === 'normal')).toBe(false);
    expect(ATTENTION_STATES).toHaveLength(previewable.length + 1);
  });

  it('carries the axes its label claims', () => {
    const byKey = (k: string) => previewable.find((s) => s.key === k)!.attention;
    expect(isUrgent(byKey('urgent'))).toBe(true);
    expect(isImportant(byKey('urgent'))).toBe(false);
    expect(isUrgent(byKey('important'))).toBe(false);
    expect(isImportant(byKey('important'))).toBe(true);
    expect(isUrgent(byKey('urgent-important'))).toBe(true);
    expect(isImportant(byKey('urgent-important'))).toBe(true);
  });

  it('takes its labels from the model, so the preview cannot rename a state', () => {
    expect(previewable.map((s) => s.label)).toEqual([
      'Urgent + Important',
      'Urgent',
      'Important',
    ]);
  });
});

describe('the preview follows the configured pigment', () => {
  const previewable = ATTENTION_STATES.filter((s) =>
    needsAttention(s.attention)
  );

  /** Every colour the preview paints comes from one of these — the same four
   * the real Inbox row calls. */
  const rendered = (attention: Parameters<typeof attentionVisual>[0]) => {
    const visual = attentionVisual(attention, 'row');
    return [
      visual.bg,
      visual.border,
      visual.hoverBg,
      visual.hoverBorder,
      attentionRailFill(attention),
      attentionDotFill(attention),
      attentionMetaColor(attention),
    ].filter((v): v is string => typeof v === 'string');
  };

  it('resolves every visual through an --attention-* token, never a literal', () => {
    for (const state of previewable) {
      for (const value of rendered(state.attention)) {
        expect(value).toMatch(/^var\(--attention-/);
        // A hex or rgb() literal here would render correctly in the shipped
        // palette and silently ignore the user's choice — the exact failure
        // this token layer exists to make impossible.
        expect(value).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(value).not.toMatch(/\brgba?\(\s*\d/);
      }
    }
  });

  it('draws urgent states from the urgency pigment', () => {
    const urgent = previewable.find((s) => s.key === 'urgent')!.attention;
    expect(attentionVisual(urgent, 'row').bg).toBe(
      'var(--attention-urgency-bg)'
    );
    expect(attentionRailFill(urgent)).toBe('var(--attention-urgency-rail)');
    expect(attentionMetaColor(urgent)).toBe('var(--attention-urgency-ink)');
  });

  it('deadlineMetaColor overrides to the urgency pigment when overdue, regardless of attention', () => {
    // Overdue wins outright, ahead of importance — a deadline label reads
    // as overdue whether or not the item behind it is also important. The
    // token matches the one the Overdue section heading itself uses, so a
    // mail's own "9 days overdue" and the heading above it are visibly
    // making the same statement (Dashboard, Actions, Approvals,
    // Opportunities — one function, everywhere).
    const normal = previewable.find((s) => s.key === 'normal')?.attention ?? {
      urgency: 'normal' as const,
      importance: 'normal' as const,
    };
    const important = previewable.find((s) => s.key === 'important')!.attention;
    expect(deadlineMetaColor(normal, true)).toBe('var(--attention-urgency-soft)');
    expect(deadlineMetaColor(important, true)).toBe(
      'var(--attention-urgency-soft)'
    );
  });

  it('deadlineMetaColor falls back to attentionMetaColor when not overdue', () => {
    for (const state of previewable) {
      expect(deadlineMetaColor(state.attention, false)).toBe(
        attentionMetaColor(state.attention)
      );
    }
  });

  it('draws important states from the importance pigment', () => {
    const important = previewable.find((s) => s.key === 'important')!.attention;
    expect(attentionVisual(important, 'row').bg).toBe(
      'var(--attention-importance-bg)'
    );
    expect(attentionRailFill(important)).toBe(
      'var(--attention-importance-rail)'
    );
    expect(attentionMetaColor(important)).toBe(
      'var(--attention-importance-ink)'
    );
  });

  it('shows the combined state as an urgency surface with an importance dot', () => {
    // The convention the preview has to demonstrate faithfully, because it is
    // the one a user has to learn: red row, gold dot = both.
    const both = previewable.find((s) => s.key === 'urgent-important')!
      .attention;
    expect(attentionVisual(both, 'row').bg).toBe('var(--attention-urgency-bg)');
    expect(attentionRailFill(both)).toBe('var(--attention-urgency-rail)');
    expect(attentionDotFill(both)).toBe('var(--attention-importance-dot)');
  });

  it('shows the wash at the weight every surface in the app now uses', () => {
    // The preview renders at `'row'` density (Inbox's — see `StreamRow`), and
    // since the V1.0 normalisation the wash no longer varies by density at
    // all. So the weight a user judges here is the weight they will meet on
    // Inbox AND on Actions/Approvals/Dashboard, not a third value. If the two
    // densities ever diverge again, the preview silently stops representing
    // the card surfaces and this fails.
    for (const state of previewable) {
      const row = attentionVisual(state.attention, 'row');
      const card = attentionVisual(state.attention, 'card');
      expect(row.bg).toBe(card.bg);
      expect(row.hoverBg).toBe(card.hoverBg);
    }
  });
});

describe('Quick Access collapse', () => {
  it('starts expanded', () => {
    expect(settings.getAgentPreferences().quickAccessCollapsed).toBe(false);
  });

  it('toggles, persists, and survives a reload', async () => {
    settings.settingsActions.update({ quickAccessCollapsed: true });
    expect(settings.getAgentPreferences().quickAccessCollapsed).toBe(true);

    const reloaded = await reload();
    expect(reloaded.getAgentPreferences().quickAccessCollapsed).toBe(true);

    reloaded.settingsActions.update({ quickAccessCollapsed: false });
    const again = await reload();
    expect(again.getAgentPreferences().quickAccessCollapsed).toBe(false);
  });

  it('stores only the collapsed flag — never a copy of the pinned views', async () => {
    // The collapse state must stay independent of WHICH views are pinned, so
    // adding, removing or reordering a Quick Access entry can never
    // desynchronise it. Membership and order live in `useQuickAccess`; a copy
    // of them leaking into this blob would be exactly that bug.
    //
    // `highPriorityTopics` is the one legitimate array-valued field this
    // object does hold (a genuine preference, not a Quick Access copy — see
    // `agentPreferences.ts`), so it's named and excluded explicitly rather
    // than the check simply asserting "no arrays at all" the way it used to;
    // the assertion below on its own values is what keeps this test honest
    // about STILL catching a real Quick Access leak.
    settings.settingsActions.update({ quickAccessCollapsed: true });
    const written = JSON.parse(storage.get(STORAGE_KEY)!) as Record<
      string,
      unknown
    >;
    expect(written.quickAccessCollapsed).toBe(true);
    const arrayFields = Object.entries(written).filter(
      ([k, v]) => k !== 'highPriorityTopics' && Array.isArray(v)
    );
    expect(arrayFields).toEqual([]);
    // A real Quick Access leak would show up as mail-view ids (e.g.
    // 'starred', 'sent') inside this array — a priority topic never is one.
    expect(written.highPriorityTopics).toEqual([]);
    expect(
      (written.highPriorityTopics as string[]).some((t) =>
        (ALL_MAIL_VIEW_IDS as readonly string[]).includes(t)
      )
    ).toBe(false);
    // And the flag itself is a plain boolean, not a richer shape that could
    // grow a view list later without anyone noticing.
    expect(typeof written.quickAccessCollapsed).toBe('boolean');
  });

  it('is independent of the attention colours it ships beside', () => {
    settings.settingsActions.update({ quickAccessCollapsed: true });
    settings.settingsActions.update({ urgencyColor: 'rose' });
    expect(settings.getAgentPreferences().quickAccessCollapsed).toBe(true);
    expect(settings.getAgentPreferences().urgencyColor).toBe('rose');
  });

  it('is restored to expanded by Reset to defaults', () => {
    settings.settingsActions.update({ quickAccessCollapsed: true });
    settings.settingsActions.reset();
    expect(settings.getAgentPreferences().quickAccessCollapsed).toBe(false);
  });
});
