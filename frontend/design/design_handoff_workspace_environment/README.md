# Handoff: Obligo Workspace Environment — Final Selected Screens

## Overview
This package covers the authenticated workspace of **Obligo** — Dashboard, Actions, Inbox, Opportunities, Approvals, and Tuning (settings). Each page went through several rounds of exploration in a design canvas; this handoff contains **only the final, approved option(s) per page** — not the full exploration history.

## About the Design Files
The files in this bundle are **design references built in HTML/CSS** — high-fidelity prototypes of look, layout, and copy. They are not production code to copy verbatim. Your task is to **recreate these screens in the target codebase's actual stack** (React/Vue/whatever is established there), using its existing component library, state management, and data layer — matching the HTML pixel-for-pixel in visual details (spacing, type, color) but implemented idiomatically.

`selected-designs.html` renders all 19 approved options grouped by page — open it in a browser to inspect exact layout/spacing/colors, or view the accompanying screenshots. View source for exact CSS values (all styling is inline).

## Fidelity
**High-fidelity.** Colors, typography, spacing, and copy are final. Recreate pixel-perfectly using the codebase's existing UI primitives where they already match this language; introduce new primitives only where nothing existing fits.

## Shared Shell (every page)
- Floating topbar (52px tall, 24px inset from viewport edges, rounded 14px): logo mark (`favicon.svg`) + "Obligo" wordmark + "OBLIGO" eyebrow on the left, two circular avatar/icon buttons on the right.
- Floating sidebar (156px wide, left-inset 24px): nav-only, one active pill (soft gradient fill + shadow, not a flat color block) floating behind the current item. Items: Dashboard, Inbox, Actions/Tasks, Opportunities, Approvals/Agent, Settings/Tuning (exact label set varies slightly by page version — use the labels shown in the final files).
- Main canvas: rounded 20px panel, subtle gradient wash, occupies remaining space (top 88px, 24px insets elsewhere), internal padding ~28–34px.
- **Dark theme**: near-black `#08090b` base, fine dot-grain texture overlay (`radial-gradient` dots, 9×9px, 8% opacity), soft drifting radial highlight top-right. Text on white-alpha scale (`rgba(255,255,255,X)`).
- **Light theme**: warm paper `#f7f5f0` / `#f6f3ea` base, white `#fff` cards. Text on near-black-alpha scale (`rgba(20,18,14,X)`).
- Type: Inter throughout (weights 300–600), JetBrains Mono for numeric/tabular values only. No emoji anywhere.
- Accent/semantic color: warm gold (`#D4AF37` family, gradient `#FBF5B7 → #D4AF37 → #996515`) means "Obligo surfaced this / earned attention" — reserved, never decorative. Overdue/urgent uses a separate warm rust/coral tone, never red, never gold (the two signals must stay visually distinct).

## Screens

### Dashboard — `#5a`
**Purpose**: Landing screen; gives relief (what Obligo already handled) then surfaces what needs a decision.
**Layout**: Single scrolling column inside the canvas, top to bottom:
1. **Relief line** — large (24px, weight 300) near-white sentence summarizing overnight activity, one smaller supporting line below, sits over a soft gold-tinted radial glow.
2. Hairline divider.
3. **"NEEDS YOUR DECISION"** eyebrow label (mono, 10px, letter-spaced, dim).
4. Decision list: the top/most valuable item gets full gold treatment (left accent bar gradient, gold dot, gold-tinted background wash, 58px row) — remaining items are progressively quieter (dim dot, then no dot at all) to keep gold rare and earned.
**Content is placeholder/sample copy** (labelled "Sample:" inline) — replace with real data bindings.

### Actions — `#7a` (dark, final), `#8a` (light-mode validation)
**Purpose**: Organized queue of pending automations/tasks.
**Layout**: Grouped by time/urgency. **Overdue is its own first-class group**, positioned ahead of "Today" — styled warm-neutral/dusty coral (~16% border opacity), never alarm-red. Today's items use the same gold "wash, not block" treatment as Dashboard's top decision (background tint + left accent, not a filled block) so gold reads consistently as one signal across the whole product.
**Light mode (`#8a`)** is a straight tonal inversion — same hierarchy, same gold hue family, only the paper/ink swap. No IA or layout differences from `#7a`.

### Inbox — `#11a` (dark, default stream), `#11b` (light, default stream), `#11c` (dark, thread open)
**Purpose**: Raw mail stream — familiar enough to land in immediately, still quiet/Obligo-flavored.
**Layout**: Continuous single stream (no Familiar/Clean mode toggle — that idea was tried and dropped). A quiet chip row above the stream carries provider category (Primary/Updates/Promotions) as plain low-emphasis text, never color-coded. Obligo involvement shows as an **earned gold dot + occasional gold-tinted trace snippet** — sparse, not on every row.
`#11c` shows the **thread-open state**: opening a message compresses the stream into a slim left rail and opens a reading pane beside it (not a modal, not full navigation away).
`#11b` is the light-mode equivalent of `#11a` — same structure, warm paper surface.

### Opportunities — `#14a` through `#14f`
**Purpose**: Discovery feed of opportunities (jobs, grants, fellowships, etc.), personalized.
**Layout**: Content organized into **discovery shelves** (grouped collections, not one flat list) with an **elevation band** above them reserved for an exceptional single match (only appears when something truly earns it — most of the time this slot is empty). A lifecycle tab row (e.g. Saved/Applied/Passed) filters the shelves in place; filtering collapses each shelf to only its matching rows rather than hiding the shelf.
Row anatomy: title (heaviest), source + timing as quiet metadata on one line, one short "why this" sentence as the only supporting text (no extra badges/icons).
- `#14a` — baseline: 5 rows across shelves, refined heading treatment (heading weight jumped from 500/11.5px to 600/14.5px, brightness raised) vs. earlier drafts.
- `#14b` — same shelves, elevation band unchanged; refined headings make each shelf read as a clearly distinct collection.
- `#14c` — lifecycle words shown inline inside each shelf row (not a separate column).
- `#14d` — **stress test**: elevation + urgency chip + lifecycle tag all present at once; must still read calmly (no more than one accent color fighting for attention at a time).
- `#14e` — **personalization proof**: same underlying pool of opportunities, two different (fictional) users see different shelf groupings, because shelf labels derive from each user's stated goals crossed with the current pool — never a fixed taxonomy.
- `#14f` — light-mode equivalents of the above: warm off-white surface, shelf headings become near-black semibold, gold keeps its hue but adjusts for contrast on light paper.

### Approvals — `#16a`, `#16b` (dark), `#17a`, `#17b` (light)
**Purpose**: Review/approve queue for anything Obligo drafted (currently scoped to email replies).
**Layout**: Two views of the same feature:
- `#16a` / `#17a` — **list page**: header band carries the page-level gold treatment (a hairline gold divider + light gold wash on the band itself); the shelf/row list below is otherwise ungolded — gold is intentionally consolidated to one place at the top rather than repeated per row.
- `#16b` / `#17b` — **review surface**: opened from a row; a slim list rail stays on the left (spatial continuity, so you don't lose your place) with a document-style draft on the right — no gold here at all, reads like a plain document, not a "special" Obligo moment. One filled primary action ("Approve & send"); everything else is outlined or plain text so hierarchy comes from that one button alone.
- `#17a` / `#17b` are the direct light-mode tonal inversion of `#16a` / `#16b` — identical structure, gold family kept but re-tuned for contrast (~`#8a6a1a`-range on light paper), no layout changes.

### Tuning (Settings) — `#21a` (dark), `#21b` (light)
**Purpose**: How-Obligo-behaves controls plus account-level settings.
**Layout**, top to bottom:
1. Page title "Tuning" + small uppercase eyebrow "How Obligo behaves today" + one supporting sentence.
2. **"How I Help"** — a simple two-column table/list: label left, current behavior value right (e.g. "Draft for approval", "Neutral"), each row expandable (chevron). Rows: Reply Drafting, Archiving, Labeling, Follow-ups, Reply Tone.
3. **Priorities** — helper sentence: *"Everything is equal right now — move categories between the two groups to change that."* (only shown before the user customizes anything). Two side-by-side lists — **High Priority** (Career, Academic, Finance, Networking, Health) and **Lower Priority** (Shopping, Travel) — each row has a single arrow affordance (→ to demote, ← to promote) to move it to the other list. No drag-and-drop, no numeric ranking.
4. **Inbox Cleanup** — same table pattern as "How I Help": category name left, current handling ("Keep") right, expandable. Rows: Promotions, Newsletters, Marketing, Banking.
5. **Advanced** — visually the quietest section on the page (smaller/dimmer heading, weight 500 vs. 600 used above) — meant to feel opt-in, not a primary destination:
   - **Priority Weights**: one-sentence explainer, then a table of horizontal range sliders (1–10, default 5, numeric value shown at the far right of each slider) for: Career, Academic, Finance, Personal, Health, Networking, Travel, Shopping. These map directly to backend ranking weights.
   - **Beta Features**: single row, toggle switch (default off), supporting text *"Receive upcoming Obligo features before public release."*
   - **Reset Tuning**: single row, neutral/outlined button labeled **"Reset to defaults"** — no destructive color. Must trigger a confirmation step before actually resetting (confirmation UI itself not yet designed).
   - **Delete Account**: last item on the page, separated by generous whitespace (~48px) from everything above. Plain text button, no red, no warning iconography. Must trigger a confirmation flow before actually deleting (confirmation UI itself not yet designed).
6. `#21b` is the light-mode equivalent of `#21a` — identical structure and hierarchy, warm-paper palette.

## Interactions & Behavior
- Sidebar active item = floating pill background behind current nav label (not a filled box).
- Table rows with a trailing chevron (⌄) are expandable/editable in place — clicking reveals more detail or an editor for that row (exact expanded content not yet designed for every row; extrapolate consistently with the row's stated behavior).
- Priorities: clicking → / ← moves a category between High/Lower Priority lists; once the user has customized this at least once, the helper sentence at the top should disappear.
- Advanced → Reset Tuning and Advanced → Delete Account both require a confirmation dialog before taking effect. Design that confirmation UI during implementation, consistent with the app's existing modal/dialog patterns.
- Approvals review surface: opening a proposal keeps the list visible as a slim rail (not a modal overlay, not a full page navigation) — closing returns to the same list scroll position.
- Inbox thread-open: same slim-rail pattern as Approvals — the list compresses rather than disappearing.
- No page in this set uses a right-hand modal/tooltip pattern for primary actions; the single filled button per screen is deliberate.

## State Management
- Theme: global dark/light mode, applies identically across all pages (same token ramp, `rgba(255,255,255,X)` dark / `rgba(20,18,14,X)` light).
- Tuning: Priorities need a High/Lower membership list per category (with an "unmodified" flag to show/hide the helper sentence), Priority Weights need a 1–10 integer per category (default 5), Beta Features a boolean (default false).
- Opportunities: lifecycle status per item (e.g. Saved/Applied/Passed) driving which shelf(s)/filter view it appears under.
- Approvals: draft status per item (pending/approved/sent) and the drafted content itself.

## Design Tokens
- **Gold (earned-attention accent)**: `#FBF5B7 → #D4AF37 → #996515` gradient family; light-mode equivalent shifts toward `#8a6a1a` range for contrast.
- **Overdue/urgent accent** (Actions): dusty coral/rust, ~16% border opacity — visually distinct from gold, never red.
- **Dark surfaces**: base `#08090b`; overlays as `rgba(255,255,255,X)` at X ≈ .008–.16 for panel washes, .28–.94 for text.
- **Light surfaces**: base `#f7f5f0` / `#f6f3ea`; cards `#fff`; overlays as `rgba(20,18,14,X)` at equivalent opacities.
- **Typography**: Inter 300–600 for all UI text; JetBrains Mono 400–500 for slider values / numeric tabular data only.
- **Radii**: topbar/panels 14–20px; sidebar nav pills 9px; buttons ~7px.
- **Spacing**: 24px outer insets around the floating shell; ~28–34px inner canvas padding; section gaps ~34px; table row padding ~10px vertical.

## Assets
- `favicon.svg` — logo mark used in the topbar (included in this bundle).
- Google Fonts: **Inter** (weights 200–600) and **JetBrains Mono** (400–500), loaded via `fonts.googleapis.com`.
- All other "imagery" is placeholder/sample text — no photography or icon assets beyond the mark.

## Files
- `selected-designs.html` — the 19 approved options only, grouped by page, viewable directly in a browser (styling is inline; view source for exact values).
- `favicon.svg` — logo mark asset.
- Screenshots (if included) — one PNG per page group for quick visual reference alongside the HTML.
