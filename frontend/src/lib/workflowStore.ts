/**
 * The canonical store for the three workflow collections — Actions,
 * Approvals and Opportunities.
 *
 * WHY THIS EXISTS. Mail has been canonical in `mailStore` for a while, but
 * the workflow records had no store at all: every page imported the static
 * arrays out of `workspaceData` and read them directly. That worked precisely
 * because the arrays never changed. It meant three things that stop being
 * true the moment a backend exists — a `GET /actions` response had nowhere to
 * land, no workflow record could be mutated at runtime, and nothing
 * re-rendered when one did.
 *
 * Deliberately the same shape as `mailStore`: a module-level external store
 * read through `useSyncExternalStore`, one `hydrate` entry point, mutations
 * as named actions. Two stores that behave identically are one pattern to
 * learn; two stores that behave differently are two.
 *
 * WHAT THIS STORE DOES NOT OWN. Completion. A workflow record's resolved
 * state lives on the mail row behind it (`StoredMailRow.completedAt`) and
 * always has — that's what makes "completed items are excluded from active
 * counts" true on Dashboard, Inbox and the workflow page at once. The
 * mutations below update the record's own fields and then delegate to
 * `mailActions.complete` for the part that is genuinely shared. This store
 * imports `mailStore`; `mailStore` does not import this one.
 */
import { useSyncExternalStore } from 'react';
import {
  actions as demoActions,
  approvals as demoApprovals,
  opportunities as demoOpportunities,
  type ActionItem,
  type Approval,
  type Lifecycle,
  type Opportunity,
} from './workspaceData';
import {
  getMailSnapshot,
  mailActions,
  registerPendingWorkflowCheck,
  subscribeToReactivation,
} from './mailStore';

type State = {
  /** Every Action, open and resolved alike, in one array.
   *
   * The demo data used to split these across `items` and a separate
   * `completed` array, which made completion unimplementable: the mutation
   * would have had to move a record between two collections that pages read
   * independently. One array plus the mail row's `completedAt` matches how
   * Approvals and Opportunities already work. */
  actions: ActionItem[];
  approvals: Approval[];
  opportunities: Opportunity[];
};

const EMPTY: State = { actions: [], approvals: [], opportunities: [] };

let state: State = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  emit();
}

export type WorkflowInput = {
  actions?: ActionItem[];
  approvals?: Approval[];
  opportunities?: Opportunity[];
};

export const workflowActions = {
  /**
   * THE BACKEND ENTRY POINT for all three collections.
   *
   * `GET /actions`, `GET /approvals` and `GET /opportunities` adapt into this
   * one call. Replaces rather than merges, for the same reason
   * `mailActions.hydrate` does: a fetch returns the server's view, and
   * quietly retaining records it didn't mention is how the two drift.
   */
  hydrate(input: WorkflowInput) {
    state = {
      actions: input.actions ?? [],
      approvals: input.approvals ?? [],
      opportunities: input.opportunities ?? [],
    };
    emit();
  },
  reset() {
    state = EMPTY;
    emit();
  },

  /**
   * Marks an Action done.
   *
   * Writes the record's own `completedAt` AND resolves the mail behind it,
   * because both are true and different surfaces read each: the Actions page
   * reads the mail row (which is what clears attention and drops the item out
   * of every active count), while the record's own field is what a backend
   * would persist for the Action itself.
   *
   * There was no mutation for this at all before — the page's "Completed"
   * footer rendered a hardcoded list, so an Action could be looked at but
   * never finished.
   */
  completeAction(id: string, note?: string) {
    const item = state.actions.find((a) => a.id === id);
    if (!item || item.completedAt) return;
    set({
      actions: state.actions.map((a) =>
        a.id === id
          ? { ...a, completedAt: new Date().toISOString(), ...(note ? { completedNote: note } : null) }
          : a,
      ),
    });
    if (item.mailId) mailActions.complete(item.mailId, note ?? item.title);
  },

  /**
   * Moves an Opportunity through its lifecycle.
   *
   * `passed` is the terminal state and the only one that resolves the mail —
   * saving or pursuing something means you're still interested in it, so it
   * stays in the active set and keeps whatever attention it had. Reopening a
   * passed opportunity (back to `new`/`saved`/`pursuing`) is deliberately not
   * supported here: nothing in the current UI offers it, and un-completing a
   * mail row is a different operation from progressing a workflow.
   */
  setOpportunityLifecycle(id: string, lifecycle: Lifecycle) {
    const item = state.opportunities.find((o) => o.id === id);
    if (!item || item.lifecycle === lifecycle) return;
    const passing = lifecycle === 'passed';
    set({
      opportunities: state.opportunities.map((o) =>
        o.id === id
          ? {
              ...o,
              lifecycle,
              ...(passing
                ? { completedAt: new Date().toISOString(), completedNote: `passed — ${o.title}` }
                : null),
            }
          : o,
      ),
    });
    if (passing) mailActions.complete(id, `passed — ${item.title}`);
  },

  /** Resolves an Approval. Approve and reject are the same state transition
   * with a different note — both mean "no longer awaiting your decision" —
   * so the distinction lives in the note, which is what the Completed footer
   * and the Dashboard callout display. */
  resolveApproval(id: string, note: string) {
    const item = state.approvals.find((a) => a.id === id);
    if (!item) return;
    set({
      approvals: state.approvals.map((a) =>
        a.id === id ? { ...a, completedAt: new Date().toISOString(), completedNote: note } : a,
      ),
    });
    mailActions.complete(id, note);
  },
};

/**
 * Mirrors `mailActions.reactivate` on this store's own three collections.
 *
 * `mailStore` clears the row's `completedAt`, which is enough on its own for
 * Approvals (its page reads the row's `completedAt`, not the Approval
 * record's own copy) — but Actions and Opportunities also gate on their OWN
 * record's `completedAt`/`lifecycle`, written by `completeAction`/
 * `setOpportunityLifecycle` and never touched by anything in `mailStore`
 * (which doesn't know these collections exist). Left alone, a reactivated
 * mail would clear on the Completed page and yet still read as done on
 * Actions or Opportunities — the same "same mail, two answers" bug
 * `pendingMails`'s own history (`Dashboard.tsx`) already names once, showing
 * up again in the opposite direction.
 *
 * Subscribed at module scope — this is a relationship between the two
 * stores, not something any component should have to wire up.
 */
subscribeToReactivation((mailId) => {
  const approval = state.approvals.find((a) => a.id === mailId);
  const action = state.actions.find((a) => a.mailId === mailId);
  const opportunity = state.opportunities.find((o) => o.id === mailId);
  if (!approval && !action && !opportunity) return;
  set({
    approvals: approval
      ? state.approvals.map((a) =>
          a.id === mailId ? { ...a, completedAt: undefined, completedNote: undefined } : a,
        )
      : state.approvals,
    actions: action
      ? state.actions.map((a) =>
          a.id === action.id ? { ...a, completedAt: undefined, completedNote: undefined } : a,
        )
      : state.actions,
    opportunities: opportunity
      ? state.opportunities.map((o) =>
          o.id === mailId
            ? { ...o, lifecycle: 'new', completedAt: undefined, completedNote: undefined }
            : o,
        )
      : state.opportunities,
  });
});

/** Snapshot for non-React readers — the counterpart to `useWorkflowStore`,
 * matching `getMailSnapshot`. */
export function getWorkflowSnapshot(): Readonly<State> {
  return getSnapshot();
}

/**
 * The single current workflow state for a mail id — the "one coherent
 * state" the spec asks for, derived rather than stored a second time.
 *
 * NOT A STAGE IN A PIPELINE. Opportunity/Action/Approval/Completed are
 * possible CURRENT classifications, not mandatory sequential steps — there
 * is no enforced Opportunity → Action → Approval → Completed order anywhere
 * in this store, no allowed-next-state graph, and nothing here assumes an
 * Opportunity must eventually become an Action or an Action an Approval. A
 * thread can go Opportunity → Completed directly, Approval → Action,
 * Completed → Action (via `mailActions.reactivate`, see below), or land on
 * any state with no prior state at all — whatever the current evidence
 * actually calls for. This function answers "what does Obligo currently think
 * this thread needs," fresh, every time it's called; it is the seam a
 * backend/AI evaluation is meant to drive (via `hydrate` and the mutations
 * above), not a position to be advanced through.
 *
 * Membership in the three collections is already mutually exclusive by
 * construction (nothing in this store ever seeds or moves an id into more
 * than one), so this is a priority-ordered read across sources that already
 * agree, not a new invariant to maintain: `completedAt` on the mail row wins
 * first (it's the one field every collection's own resolution funnels into,
 * per this file's own "what this store does not own" note), then whichever
 * of Approvals/Actions/Opportunities still lists the id as open.
 */
export type WorkflowState = 'opportunity' | 'action' | 'approval' | 'completed' | null;
export function workflowStateFor(mailId: string): WorkflowState {
  const row = getMailSnapshot().rows.find((r) => r.id === mailId);
  if (row?.completedAt) return 'completed';
  if (state.approvals.some((a) => a.id === mailId && !a.completedAt)) return 'approval';
  if (state.actions.some((a) => a.mailId === mailId && !a.completedAt)) return 'action';
  if (state.opportunities.some((o) => o.id === mailId && o.lifecycle !== 'passed'))
    return 'opportunity';
  return null;
}

/** Wires `mailStore`'s automatic-archive check to this store's own
 * collections, the same one-way registration `mailStore` documents on
 * `registerPendingWorkflowCheck` — `mailStore` never imports this file. */
registerPendingWorkflowCheck((mailId) => {
  const s = workflowStateFor(mailId);
  return s === 'action' || s === 'approval' || s === 'opportunity';
});

export function useWorkflowStore(): Readonly<State> {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/* ========================================================================
   DEMO BOOTSTRAP — THE REPLACEMENT POINT
   ========================================================================
   As in `mailStore`: nothing above this line knows the demo constants exist.
   Delete this block and call `workflowActions.hydrate` with the adapted API
   responses instead.

   `actions.items` and `actions.completed` are concatenated because the store
   holds one array — see `State.actions`.
   ======================================================================== */
export function demoWorkflowInput(): WorkflowInput {
  return {
    actions: [...demoActions.items, ...demoActions.completed],
    approvals: demoApprovals.items,
    opportunities: demoOpportunities.items,
  };
}

workflowActions.hydrate(demoWorkflowInput());
