/**
 * Canonical definition of the mail-management views (Starred, Snoozed, ...).
 * Single source of truth for id/label/icon/route — `useQuickAccess` (which
 * views are enabled in the sidebar, and in what order) and `Inbox`/`AppShell`
 * (which render them) all key off this list instead of inventing their own.
 */
import type { LucideIcon } from 'lucide-react';
import { Archive, CalendarClock, Clock, FilePen, Send, ShieldAlert, Star, Trash2 } from 'lucide-react';

export type MailViewId =
  | 'starred'
  | 'snoozed'
  | 'drafts'
  | 'scheduled'
  | 'sent'
  | 'archive'
  | 'trash'
  | 'spam';

export type MailViewDef = {
  id: MailViewId;
  label: string;
  icon: LucideIcon;
  path: string;
  emptyTitle: string;
  emptyDescription: string;
};

export const MAIL_VIEWS: MailViewDef[] = [
  {
    id: 'starred',
    label: 'Starred',
    icon: Star,
    path: '/inbox/starred',
    emptyTitle: 'Nothing starred',
    emptyDescription: 'Star a message from Inbox to keep it here.',
  },
  {
    id: 'snoozed',
    label: 'Snoozed',
    icon: Clock,
    path: '/inbox/snoozed',
    emptyTitle: 'Nothing snoozed',
    emptyDescription: 'Snoozed messages return to Inbox at their scheduled time.',
  },
  {
    // First of the three outgoing views, in the order a reply actually
    // travels: written (Drafts) → waiting (Scheduled) → gone (Sent).
    id: 'drafts',
    label: 'Drafts',
    icon: FilePen,
    path: '/inbox/drafts',
    emptyTitle: 'No drafts',
    emptyDescription: 'Replies you save without sending will appear here.',
  },
  {
    id: 'scheduled',
    label: 'Scheduled',
    icon: CalendarClock,
    path: '/inbox/scheduled',
    emptyTitle: 'Nothing scheduled',
    emptyDescription: 'Replies scheduled to send later will appear here.',
  },
  {
    id: 'sent',
    label: 'Sent',
    icon: Send,
    path: '/inbox/sent',
    emptyTitle: 'Nothing sent yet',
    emptyDescription: 'Replies you send will appear here.',
  },
  {
    id: 'archive',
    label: 'Archive',
    icon: Archive,
    path: '/inbox/archive',
    emptyTitle: 'Archive is empty',
    emptyDescription: 'Messages you archive stay here, out of Inbox.',
  },
  {
    id: 'trash',
    label: 'Trash',
    icon: Trash2,
    path: '/inbox/trash',
    emptyTitle: 'Trash is empty',
    emptyDescription: 'Deleted messages stay here.',
  },
  {
    id: 'spam',
    label: 'Spam',
    icon: ShieldAlert,
    path: '/inbox/spam',
    emptyTitle: 'No spam',
    emptyDescription: 'Messages marked as spam stay here.',
  },
];

export function mailViewById(id: string): MailViewDef | undefined {
  return MAIL_VIEWS.find((v) => v.id === id);
}

export const ALL_MAIL_VIEW_IDS = MAIL_VIEWS.map((v) => v.id);
export const DEFAULT_QUICK_ACCESS: MailViewId[] = ['starred', 'sent'];
