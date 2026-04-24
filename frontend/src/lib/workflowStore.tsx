import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type {
  BillingPlan,
  FollowupPolicy,
  FollowupTimelineItem,
  MustActItem,
  UsageMetric,
} from './api';

type UpgradeModalState = {
  open: boolean;
  actionLabel: string;
  metric: string;
};

type UndoItem = {
  id: string;
  kind: 'must_act' | 'agent_action';
  label: string;
  expiresAt: number;
  previousStatus: string;
};

export type WorkflowState = {
  plan: BillingPlan | null;
  usage: UsageMetric[];
  mustAct: {
    items: MustActItem[];
    total: number;
    limit: number;
    offset: number;
    loading: boolean;
  };
  followups: {
    timeline: FollowupTimelineItem[];
    total: number;
    limit: number;
    offset: number;
    policy: FollowupPolicy | null;
    loading: boolean;
  };
  ui: {
    upgradeModal: UpgradeModalState;
    undoQueue: UndoItem[];
  };
};

type WorkflowAction =
  | { type: 'SET_PLAN'; payload: BillingPlan | null }
  | { type: 'SET_USAGE'; payload: UsageMetric[] }
  | {
      type: 'SET_MUST_ACT';
      payload: {
        items: MustActItem[];
        total: number;
        limit: number;
        offset: number;
      };
    }
  | { type: 'SET_MUST_ACT_LOADING'; payload: boolean }
  | { type: 'UPSERT_MUST_ACT_ITEM'; payload: MustActItem }
  | { type: 'SET_FOLLOWUPS_LOADING'; payload: boolean }
  | {
      type: 'SET_FOLLOWUP_TIMELINE';
      payload: {
        items: FollowupTimelineItem[];
        total: number;
        limit: number;
        offset: number;
      };
    }
  | { type: 'SET_FOLLOWUP_POLICY'; payload: FollowupPolicy }
  | { type: 'SHOW_UPGRADE_MODAL'; payload: { actionLabel: string; metric: string } }
  | { type: 'HIDE_UPGRADE_MODAL' }
  | { type: 'ENQUEUE_UNDO'; payload: UndoItem }
  | { type: 'DEQUEUE_UNDO'; payload: { id: string } };

const initialState: WorkflowState = {
  plan: null,
  usage: [],
  mustAct: {
    items: [],
    total: 0,
    limit: 20,
    offset: 0,
    loading: false,
  },
  followups: {
    timeline: [],
    total: 0,
    limit: 20,
    offset: 0,
    policy: null,
    loading: false,
  },
  ui: {
    upgradeModal: {
      open: false,
      actionLabel: '',
      metric: '',
    },
    undoQueue: [],
  },
};

const workflowReducer = (state: WorkflowState, action: WorkflowAction): WorkflowState => {
  switch (action.type) {
    case 'SET_PLAN':
      return { ...state, plan: action.payload };
    case 'SET_USAGE':
      return { ...state, usage: action.payload };
    case 'SET_MUST_ACT_LOADING':
      return { ...state, mustAct: { ...state.mustAct, loading: action.payload } };
    case 'SET_MUST_ACT':
      return {
        ...state,
        mustAct: {
          ...state.mustAct,
          ...action.payload,
        },
      };
    case 'UPSERT_MUST_ACT_ITEM':
      return {
        ...state,
        mustAct: {
          ...state.mustAct,
          items: state.mustAct.items.map((item) =>
            item.id === action.payload.id ? action.payload : item
          ),
        },
      };
    case 'SET_FOLLOWUPS_LOADING':
      return {
        ...state,
        followups: { ...state.followups, loading: action.payload },
      };
    case 'SET_FOLLOWUP_TIMELINE':
      return {
        ...state,
        followups: {
          ...state.followups,
          ...action.payload,
        },
      };
    case 'SET_FOLLOWUP_POLICY':
      return {
        ...state,
        followups: {
          ...state.followups,
          policy: action.payload,
        },
      };
    case 'SHOW_UPGRADE_MODAL':
      return {
        ...state,
        ui: {
          ...state.ui,
          upgradeModal: {
            open: true,
            actionLabel: action.payload.actionLabel,
            metric: action.payload.metric,
          },
        },
      };
    case 'HIDE_UPGRADE_MODAL':
      return {
        ...state,
        ui: {
          ...state.ui,
          upgradeModal: {
            open: false,
            actionLabel: '',
            metric: '',
          },
        },
      };
    case 'ENQUEUE_UNDO':
      return {
        ...state,
        ui: {
          ...state.ui,
          undoQueue: [action.payload, ...state.ui.undoQueue],
        },
      };
    case 'DEQUEUE_UNDO':
      return {
        ...state,
        ui: {
          ...state.ui,
          undoQueue: state.ui.undoQueue.filter((item) => item.id !== action.payload.id),
        },
      };
    default:
      return state;
  }
};

const WorkflowStoreContext = createContext<{
  state: WorkflowState;
  dispatch: Dispatch<WorkflowAction>;
} | null>(null);

export const WorkflowStoreProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(workflowReducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return (
    <WorkflowStoreContext.Provider value={value}>
      {children}
    </WorkflowStoreContext.Provider>
  );
};

export const useWorkflowStore = () => {
  const context = useContext(WorkflowStoreContext);
  if (!context) {
    throw new Error('useWorkflowStore must be used within WorkflowStoreProvider');
  }
  return context;
};

