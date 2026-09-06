/**
 * Shared "schedule send" date math — extracted from `ReplyComposer` so the
 * Inbox thread view's Snooze control can offer the exact same four presets
 * without duplicating the logic.
 */

export type SchedulePreset = 'later-today' | 'tomorrow-morning' | 'tomorrow-afternoon' | 'next-week';

export const SCHEDULE_PRESETS: { key: SchedulePreset; label: string }[] = [
  { key: 'later-today', label: 'Later today' },
  { key: 'tomorrow-morning', label: 'Tomorrow morning' },
  { key: 'tomorrow-afternoon', label: 'Tomorrow afternoon' },
  { key: 'next-week', label: 'Next week' },
];

export function computePresetDate(preset: SchedulePreset, now: Date): Date {
  const d = new Date(now);
  switch (preset) {
    case 'later-today':
      d.setHours(d.getHours() + 3, 0, 0, 0);
      return d;
    case 'tomorrow-morning':
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    case 'tomorrow-afternoon':
      d.setDate(d.getDate() + 1);
      d.setHours(14, 0, 0, 0);
      return d;
    case 'next-week':
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
      return d;
  }
}

export function formatScheduled(date: Date) {
  const day = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} at ${time}`;
}
