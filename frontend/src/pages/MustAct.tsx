import { useState } from 'react';
import ConnectPrompt from '../components/ConnectPrompt';
import ActionPanel from '../components/actionPanel/ActionPanel';
import ActionToast from '../components/common/ActionToast';
import MustActList from '../components/mustAct/MustActList';
import PageHeader from '../components/PageHeader';
import {
  reopenMustAct,
  type MustActItem,
  undoAgentAction,
} from '../lib/api';
import { trackEvent } from '../lib/trackEvent';
import { useApp } from '../lib/useApp';
import { useWorkflowStore } from '../lib/useWorkflowStore';

export default function MustActPage() {
  const { hasToken, setStatus } = useApp();
  const { dispatch } = useWorkflowStore();
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<MustActItem | null>(null);
  const [listNonce, setListNonce] = useState(0);

  if (!hasToken) return <ConnectPrompt />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Must-Act queue"
        title="Priority decisions with full trust context"
        description="Approve, reject, defer, or edit with explicit rationale, risk, and confidence visibility."
      />

      <MustActList
        key={listNonce}
        onOpenItem={(item) => {
          setSelected(item);
          setPanelOpen(true);
        }}
        limit={50}
      />

      <ActionPanel
        item={selected}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onMutated={() => setListNonce((n) => n + 1)}
      />

      <ActionToast
        onUndo={(id, kind) => {
          void (async () => {
            try {
              if (kind === 'must_act') {
                await reopenMustAct(id);
              } else {
                await undoAgentAction(id);
              }
              trackEvent({ action: 'undo_used', metadata: { kind, id } });
              setStatus('Undo completed.');
              setListNonce((n) => n + 1);
            } catch (error) {
              console.error(error);
              setStatus('Undo failed.');
            }
          })();
        }}
      />
    </div>
  );
}
