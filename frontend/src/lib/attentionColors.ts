/**
 * THE user-selectable palettes for the two attention axes.
 *
 * `lib/attention.ts` owns what urgency and importance MEAN;
 * `components/workspace/attention.ts` owns which visual channel carries each.
 * This module owns the one remaining question: which PIGMENT the user has
 * chosen for each axis.
 *
 * WHY ENUMS AND NOT COLORS. A preference stored as `#e0784a` pins the backend
 * contract to a specific rendered value, and the moment the design deepens
 * coral for a new light theme (which it already does — see `--coral` in
 * index.css, one value per theme) every stored blob is silently wrong. So the
 * wire carries `'coral'`, a name, and the FRONTEND resolves that name to a
 * theme-appropriate token. The backend never learns an RGB value, and the
 * palette can be retuned in CSS without a migration.
 *
 * WHY CURATED AND NOT A COLOR WHEEL. These pigments have to survive two
 * themes, sit under body text at readable contrast, tint a row without
 * swallowing it, and never collide with the other axis. An arbitrary picker
 * satisfies none of those; five hand-tuned options per axis satisfy all four,
 * and the two lists are deliberately disjoint in hue family (urgency runs
 * warm — red through magenta; importance runs gold + cool + green) so a user
 * cannot configure a state where "which axis is this?" stops being legible.
 *
 * WHERE THE ACTUAL VALUES LIVE. Not here — in `index.css`, as
 * `--urgency-<key>` / `--importance-<key>-*` token sets, one per theme. This
 * module holds only the key, its user-facing label, and the CSS custom
 * property a swatch should render, so there is exactly one place a colour is
 * written down and this file cannot drift from it.
 */

/** The urgency pigment. `coral` is the shipped default and the value every
 * absent/unrecognised preference resolves to. */
export type UrgencyColor = 'coral' | 'amber' | 'rose' | 'magenta' | 'crimson';

/** The importance pigment. `gold` is the shipped default. */
export type ImportanceColor = 'gold' | 'teal' | 'blue' | 'violet' | 'green';

export type AttentionColorOption<T extends string> = {
  key: T;
  /** User-facing name — the accessible label of the swatch control. */
  label: string;
  /** CSS `background` for the option's swatch. Reads the same token the
   * selected state would apply, so a swatch can never show a colour the
   * application wouldn't actually render. */
  swatch: string;
};

export const URGENCY_COLOR_OPTIONS: AttentionColorOption<UrgencyColor>[] = [
  { key: 'coral', label: 'Coral', swatch: 'rgb(var(--urgency-coral))' },
  { key: 'amber', label: 'Orange', swatch: 'rgb(var(--urgency-amber))' },
  { key: 'rose', label: 'Rose', swatch: 'rgb(var(--urgency-rose))' },
  { key: 'magenta', label: 'Magenta', swatch: 'rgb(var(--urgency-magenta))' },
  { key: 'crimson', label: 'Deep Red', swatch: 'rgb(var(--urgency-crimson))' },
];

/** Importance swatches render the option's own three-stop gradient rather than
 * a flat mid-tone, because the gradient IS the treatment every importance
 * surface carries (rail, dot). A flat swatch would misrepresent what picking
 * it does. */
export const IMPORTANCE_COLOR_OPTIONS: AttentionColorOption<ImportanceColor>[] =
  [
    { key: 'gold', label: 'Gold', swatch: 'var(--importance-gold-grad)' },
    { key: 'teal', label: 'Teal', swatch: 'var(--importance-teal-grad)' },
    { key: 'blue', label: 'Blue', swatch: 'var(--importance-blue-grad)' },
    { key: 'violet', label: 'Violet', swatch: 'var(--importance-violet-grad)' },
    { key: 'green', label: 'Green', swatch: 'var(--importance-green-grad)' },
  ];

export const DEFAULT_URGENCY_COLOR: UrgencyColor = 'coral';
export const DEFAULT_IMPORTANCE_COLOR: ImportanceColor = 'gold';

export const URGENCY_COLOR_KEYS = URGENCY_COLOR_OPTIONS.map((o) => o.key);
export const IMPORTANCE_COLOR_KEYS = IMPORTANCE_COLOR_OPTIONS.map((o) => o.key);
