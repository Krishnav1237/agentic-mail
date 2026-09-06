/**
 * Public surface of the shared workspace foundation. Pages and patterns import
 * from here so the underlying file layout can evolve without churn:
 *
 *   import { WorkspacePage, PageHeader, Panel, Select } from '@/components/workspace';
 *
 * Reuse these before creating anything new (Constitution §79, Playbook A.3-A.5).
 */
export * from './motion';
export * from './attention';
export * from './CompletionSummary';
export * from './HeaderCountSummary';
export * from './WorkspacePage';
export * from './Group';
export * from './InteractiveRow';
export * from './ExpandingSearch';
export * from './Panel';
export * from './Dialog';
export * from './controls';
export * from './feedback';
export * from './primitives';
export * from './ReplyComposer';
export * from './IILInsight';
export * from './MailThreadView';
export * from './Avatar';
export * from './AccountMenu';
export * from './TelegramIntegrationModal';
export * from './HelpFeedbackModal';
