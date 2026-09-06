# Obligo Frontend Implementation Reference
Version 1.0

---

# Purpose

This document records the implementation details that define the current Obligo frontend.

Unlike the Design Constitution and the Frontend Architecture & Engineering Constitution, this document contains no product philosophy.

Every value recorded here originates from the implementation itself.

Its purpose is to eliminate ambiguity during future development by providing a single authoritative reference for measurements, tokens, motion, layout and component behavior.

Whenever implementation decisions are required, this document should be consulted before introducing new values.

This document should evolve together with the codebase.

---

# Source of Truth

Version 1.0 is extracted from the following implementation.

• index.css

• Landing.tsx

• AppShell.tsx

• ThemeToggle.tsx

• BrandLogo.tsx

• tailwind.config.js

Whenever implementation changes,

this reference should be updated.

The implementation remains the source of truth.

This document mirrors it.

---

# Reference Priority

Whenever multiple sources appear to disagree, use the following priority.

1.

Actual implementation

↓

2.

Frontend Implementation Reference

↓

3.

Frontend Architecture & Engineering Constitution

↓

4.

Design Constitution

This document exists to describe implementation.

Not replace it.

---

# 1. Global Design System

## Fonts

| Property | Value | Used By |
|-----------|-------|----------|
| Primary Font | Inter | Entire application |
| Monospace Font | JetBrains Mono | Metadata, Eyebrows |
| Font Loading | Google Fonts | Global |

---

## Tailwind Configuration

| Property | Value |
|-----------|-------|
| Content Scan | ./index.html |
| Source Scan | ./src/**/*.{ts,tsx} |
| Plugins | None |

---

## Extended Theme

### Fonts

| Token | Value |
|--------|-------|
| display | Inter |
| body | Inter |

### Colors

| Token | Value |
|--------|-------|
| background | #0A0A0A |
| surface | #111111 |

---

# 2. Global HTML Rules

## Root

| Property | Value |
|-----------|-------|
| Default Color Scheme | Dark |
| Default Font | Inter |
| Font Smoothing | Antialiased |

---

## Body

| Property | Value |
|-----------|-------|
| Background | #000000 |
| Text | #FFFFFF |
| Width | 100vw |
| Horizontal Overflow | Hidden |

---

## Selection

| Property | Value |
|-----------|-------|
| Background | rgba(255,255,255,0.2) |
| Text | White |

---

## Scrollbars

| Property | Value |
|-----------|-------|
| Width | 0px |
| Visibility | Hidden |

Reason:

The landing page intentionally removes scrollbar chrome to preserve the cinematic presentation.

---

# 3. Theme System

## Strategy

The application implements two different theme systems.

| Area | Strategy |
|------|----------|
| Landing Page | Global CSS inversion |
| Workspace | Token-based theming |

The Landing page uses CSS inversion for light mode.

The Workspace explicitly opts out and instead defines an independent token system.

Reason:

The workspace requires precise control over gold accents, paper colors and surface hierarchy that cannot be achieved through inversion alone.

---

## HTML Classes

| Class | Purpose |
|---------|---------|
| .light | Enables Light Mode |
| .obligo-workspace | Opts workspace out of inversion |

---

## Workspace Theme Driver

The Workspace theme is controlled through:

```html
data-theme="dark"

or

data-theme="light"
```

Every workspace token derives from this attribute.

---

# 4. Workspace Color Tokens

## Gold Palette

| Token | Value |
|---------|---------|
| --gold-1 | #FBF5B7 |
| --gold-2 | #D4AF37 |
| --gold-3 | #996515 |

---

## Gold Gradients

| Token | Value |
|---------|---------|
| --gold-grad | 180° gradient |
| --gold-grad-135 | 135° gradient |

Purpose:

Reserved exclusively for premium emphasis.

Never use for decorative coloring.

---

# 5. Workspace Layout Measurements

## Floating Shell

| Element | Measurement | Reason |
|----------|-------------|---------|
| Topbar Offset | 20px | Floating appearance |
| Side Offset | 24px | Breathing room |
| Bottom Offset | 24px | Floating canvas |
| Right Offset | 24px | Consistent frame |

---

## Topbar

| Property | Value |
|-----------|-------|
| Height | 52px |
| Border Radius | 14px |
| Horizontal Padding | 18px |

Purpose:

Acts as the workspace command bar.

---

## Sidebar

| Property | Value |
|-----------|-------|
| Width | 156px |
| Border Radius | 16px |
| Top Position | 88px |
| Left Position | 24px |
| Bottom Position | 24px |
| Internal Padding | 18px 10px |

Purpose:

Navigation only.

Contains no page-specific controls.

---

## Canvas

| Property | Value |
|-----------|-------|
| Left | 196px |
| Right | 24px |
| Top | 88px |
| Bottom | 24px |
| Border Radius | 20px |

Purpose:

Every workspace page renders inside this canvas.

Pages never replace the canvas.

They populate it.

---

# 6. Atmospheric Layers

The workspace atmosphere consists of two permanent layers.

## Grain Layer

| Property | Value |
|-----------|-------|
| Pattern | Radial dot grid |
| Dot Size | 0.5px |
| Grid | 9px × 9px |

Purpose:

Introduce subtle texture without becoming visible as a pattern.

---

## Glow Layer

| Property | Value |
|-----------|-------|
| Position | Top Right |
| Width | 520px |
| Height | 420px |
| Vertical Offset | -160px |
| Blur | 6px |

Purpose:

Creates the drifting highlight visible across every workspace page.

This layer exists independently of page content.

---

# Part I Summary

This section defines the immutable foundation of the Obligo frontend.

Everything above should be considered implementation constants.

Future pages should inherit these values rather than introducing alternatives.

---

# Layout, Motion & Interaction Reference

This section documents the shared layout and interaction systems implemented throughout the Landing Page and Workspace.

Every value recorded below originates from the current implementation and should be reused throughout future development.

---

# 7. PageRail Specification

## Purpose

PageRail is the primary content container used throughout the Landing Page.

It establishes the maximum readable width, horizontal padding and alignment rhythm that future workspace pages inherit.

PageRail is considered the canonical content container for Obligo.

Source:
Landing.tsx :contentReference[oaicite:0]{index=0}

---

## Implementation

| Property | Value |
|-----------|------:|
| Horizontal Alignment | `mx-auto` |
| Width | `w-full` |
| Maximum Width | `1360px` |
| Mobile Padding | `16px` (`px-4`) |
| Small Breakpoint Padding | `20px` (`sm:px-5`) |
| Large Breakpoint Padding | `24px` (`lg:px-6`) |
| Extra Large Padding | `32px` (`xl:px-8`) |

Implementation:

```tsx
mx-auto w-full max-w-[1360px] px-4 sm:px-5 lg:px-6 xl:px-8
```

Source:
Landing.tsx :contentReference[oaicite:1]{index=1}

---

## Rules

PageRail should wrap every major page.

Page content should never stretch directly to browser edges.

Additional screen width becomes breathing room.

Not additional reading width.

---

# 8. Section Layout System

Landing sections follow one shared structure.

| Property | Value |
|-----------|-------|
| Width | Full viewport |
| Vertical Alignment | Center |
| Minimum Height | `calc(100svh - 100px)` |

Implementation:

```tsx
flex
min-h-[calc(100svh-100px)]
w-full
flex-col
justify-center
```

Source:
Landing.tsx :contentReference[oaicite:2]{index=2}

---

## Narrative Sections

The four execution sections share one responsive layout.

Desktop

```text
Text | Image

or

Image | Text
```

Mobile

```text
Text

↓

Image
```

Responsive classes:

| Breakpoint | Layout |
|------------|--------|
| Default | Column |
| md | Row |
| md Reverse | Row Reverse |

Gap System

| Breakpoint | Gap |
|------------|-----|
| Default | 2rem |
| Small | 3rem |
| Desktop | 6rem |

Implementation:

```tsx
gap-8

↓

sm:gap-12

↓

md:gap-24
```

Source:
Landing.tsx :contentReference[oaicite:3]{index=3}

---

# 9. Navigation Reference

## Navigation Type

Floating Center Navigation

Purpose

Primary Landing navigation.

Never reused directly inside the workspace.

The workspace translates this behavior into the floating sidebar.

---

## Navigation Container

| Property | Value |
|-----------|-------|
| Maximum Mobile Width | 280px |
| Shape | Full Pill |
| Blur | `backdrop-blur-xl` |
| Background | `bg-white/[0.03]` |
| Border | `border-white/10` |

Shadow

```
0 12px 32px rgba(0,0,0,0.24)

+

Inset Highlight
```

Source:
Landing.tsx :contentReference[oaicite:4]{index=4}

---

## Active Navigation Bubble

Animation Type

Shared Layout Animation

Framer Motion

```tsx
layoutId="activeNavBubble"
```

Transition

| Property | Value |
|-----------|-------|
| Type | Spring |
| Duration | 0.6 |
| Bounce | 0.25 |

Source:
Landing.tsx :contentReference[oaicite:5]{index=5}

---

## Navigation Hover

Hover

```tsx
scale: 1.05

y: -2
```

Tap

```tsx
scale: 0.98
```

Transition

```tsx
type: spring

stiffness: 400

damping: 25
```

These values establish the official interaction language for primary navigation.

Future navigation systems should inherit these values unless a stronger product reason exists.

Source:
Landing.tsx :contentReference[oaicite:6]{index=6}

---

# 10. Scroll System

## Active Section Detection

Current section is determined using a viewport marker.

Marker Position

```
45%

of viewport height
```

Implementation

```tsx
marker = window.innerHeight * 0.45
```

Purpose

Prevent rapid switching near section boundaries.

Source:
Landing.tsx :contentReference[oaicite:7]{index=7}

---

## Navigation Scroll

Desktop

Scroll target

```
Section Top

-

Navigation Height

-

20px Buffer
```

Tablet / Mobile

Scroll target

```
First Heading

-

Navigation Height

-

24px Buffer
```

Reason

Desktop sections naturally center themselves.

Smaller devices require scrolling directly toward content.

Source:
Landing.tsx 

---

# 11. Motion Vocabulary

The Landing Page establishes the official motion vocabulary.

Every workspace interaction should inherit this language.

---

## Entrance Animation

Component

```
FadeInText
```

Behavior

| Property | Value |
|-----------|-------|
| Initial | Hidden |
| While In View | Visible |
| Viewport | Once |
| Trigger Margin | -10% |

Purpose

Content appears naturally while scrolling.

Never repeatedly.

Source:
Landing.tsx :contentReference[oaicite:9]{index=9}

---

## Stagger Animation

Pattern

```
Container

↓

Children
```

Examples

Problem Cards

Execution Sections

Feature Cards

Delays

| Component | Delay |
|------------|------:|
| Problem Cards | index × 0.08 |
| Feature Cards | index × 0.05 |
| Images | index × 0.20 |

Purpose

Guide reading order.

Not visual spectacle.

Source:
Landing.tsx 

---

# 12. Typography Scale

## Hero Heading

| Breakpoint | Size |
|------------|------|
| Small | 28px |
| Medium | 40px |
| Desktop | 60px |
| Large Desktop | 70px |

Characteristics

• Font Weight: Light

• Tight Tracking

• White Gradient Fill

Implementation

```tsx
bg-gradient-to-b

from-white

via-white/92

to-white/70
```

Source:
Landing.tsx :contentReference[oaicite:11]{index=11}

---

## Body Text

Default

```
16px
```

Desktop

```
20px
```

Weight

```
Light
```

Color

```
White / 40%
```

Purpose

Reduce visual fatigue during long-form reading.

Source:
Landing.tsx :contentReference[oaicite:12]{index=12}

---

## Eyebrow Labels

| Property | Value |
|-----------|-------|
| Font Size | 10px |
| Weight | Semi Bold |
| Case | Uppercase |
| Tracking | 0.2em |

Purpose

Section metadata.

Never primary information.

Source:
Landing.tsx 

---

# Part II Summary

This section establishes the measurable interaction language of Obligo.

Future implementations should inherit:

• PageRail

• Navigation motion

• Scroll behavior

• Stagger rhythm

• Entrance animations

• Typography scale

These values should be treated as implementation standards rather than design suggestions.

---

# Workspace Shell, Navigation & Shared Component Reference

This section documents the reusable workspace systems introduced by `AppShell`.

Unlike the Landing Page, which is responsible for storytelling, the Workspace is responsible for productivity.

Every page inside Obligo should inherit these systems rather than recreating them.

Source:
AppShell.tsx :contentReference[oaicite:0]{index=0}

---

# 13. Workspace Shell

## Purpose

AppShell is the permanent container for every authenticated page.

It owns:

• Atmosphere

• Theme

• Navigation

• Topbar

• Canvas

Pages never replace AppShell.

They render inside it.

---

## Hierarchy

```text
obligo-root

├── obligo-grain

├── obligo-glow

├── Topbar

├── Sidebar

└── Canvas (Outlet)
```

This hierarchy should remain stable.

Future pages should only populate the canvas.

Source:
AppShell.tsx :contentReference[oaicite:1]{index=1}

---

# 14. Workspace Layers

Rendering order

| Layer | Purpose |
|---------|---------|
| Grain | Texture |
| Glow | Atmosphere |
| Topbar | Global controls |
| Sidebar | Navigation |
| Canvas | Product content |

The atmosphere layers exist independently of page content.

Pages should never disable or replace them.

---

# 15. Topbar Specification

## Purpose

The Topbar is a global command surface.

It contains only information relevant across the entire application.

Individual pages should not inject controls into the Topbar during Sprint 1.

---

## Layout

```text
Brand

↓

Spacer

↓

Theme Toggle

↓

Profile
```

Brand remains left aligned.

Global controls remain right aligned.

Source:
AppShell.tsx :contentReference[oaicite:2]{index=2}

---

## Brand Block

Structure

```text
Logo

↓

Obligo

↓

Divider

↓

OBLIGO
```

Desktop

Displays full branding.

Small screens

The expanded title hides automatically.

Implementation

```tsx
hidden sm:inline
```

Reason

Preserves breathing room without compromising identity.

Source:
AppShell.tsx :contentReference[oaicite:3]{index=3}

---

## Brand Measurements

### Logo

| Property | Value |
|-----------|------:|
| Width | 20px |
| Height | 20px |
| Radius | 6px |

---

### Product Name

| Property | Value |
|-----------|------:|
| Weight | 600 |
| Size | 13px |
| Tracking | -0.01em |

---

### Subtitle

| Property | Value |
|-----------|------:|
| Weight | 500 |
| Size | 9.5px |
| Tracking | 0.16em |
| Transform | Uppercase |

Purpose

Provides identity without competing with page content.

Source:
AppShell.tsx :contentReference[oaicite:4]{index=4}

---

# 16. Theme Toggle

## Position

Always located in the top-right control group.

Never duplicated inside individual pages.

---

## Scale

Implementation

```tsx
scale-[0.72]

origin-right
```

Reason

Maintains visual balance relative to the profile avatar.

Source:
AppShell.tsx :contentReference[oaicite:5]{index=5}

---

# 17. Profile Avatar

Purpose

Represents the active account.

Current implementation renders the account holder's initials via
`initialsOf(CURRENT_USER_NAME)`, not the connected email's first letter.

DEFERRED — V1.1: this is a static, non-interactive element (a `title`
tooltip only). The profile menu the Design Constitution describes
(Connected Gmail / Theme / Account) has not been built — see Design
Constitution §8. Do not treat the avatar's current inertness as a bug to
silently work around; it is a scoped, intentional gap.

Implementation

```tsx
initialsOf(CURRENT_USER_NAME)
```

Source:
AppShell.tsx

---

## Measurements

| Property | Value |
|-----------|------:|
| Width | `calc(var(--ui-scale) * 30px)` |
| Height | `calc(var(--ui-scale) * 30px)` |
| Shape | Circle |
| Font Size | `calc(var(--ui-scale) * 11px)` |
| Weight | 500 |

Background

```
Linear Gradient

160°
```

Inset highlight

```
1px
```

Purpose

Provides subtle depth while remaining understated.

Source:
AppShell.tsx :contentReference[oaicite:7]{index=7}

---

# 18. Sidebar Navigation

## Purpose

The sidebar is navigation only.

It is intentionally free of:

Search

Filters

Widgets

Statistics

Inline settings controls

Those belong inside pages — "Settings" above refers to embedding
configuration controls directly in the sidebar chrome, never to the Settings
page itself, which is a normal workflow link like any other (see Navigation
Order below).

The sidebar exists only to move between workflows.

---

## Navigation Order

Current implementation

1.

Dashboard

2.

Inbox

3.

Actions

4.

Opportunities

5.

Approvals

6.

Settings

Source:
AppShell.tsx

Below the six primary items, a Quick Access group renders the mail-management
views (Starred, Snoozed, Drafts, Scheduled, Sent, Archive, Trash, Spam) the
user has pinned from Settings — see §18a below. It shares this navigation's
visual language (same `.obligo-nav-item`, same active-pill mechanics) but is a
distinct, user-configurable list, not part of the fixed six.

---

## Navigation Philosophy

Navigation represents workflows.

Not features.

Items should remain stable.

Future additions should occur only when they introduce genuinely new workflows.

---

# 18a. Quick Access

Purpose

User-configurable promotion of mail-management views into the primary
sidebar, so a frequently-checked view (Drafts, Scheduled — anything besides
Inbox itself) is one click away instead of requiring Inbox to be open first
and a sub-view selected from within it.

Source of truth

`useQuickAccess` (`lib/useQuickAccess.ts`) — `localStorage`-backed,
same-tab-synced via a custom event so the sidebar and Settings' own editor
for it (a two-column transfer list: pinned / Available) never disagree. Not
a fourth store (§92 of the Engineering Constitution) — this is UI placement
state, not application data, and stays intentionally separate from
`AgentPreferences`.

Eligible views

Every entry in `MAIL_VIEWS` (`lib/mailViews.ts`): Starred, Snoozed, Drafts,
Scheduled, Sent, Archive, Trash, Spam.

Default

Starred and Sent pinned; everything else Available.

Rendering

`AppShell` reads `useQuickAccess().quickAccess`, maps each id through
`mailViewById()`, and renders it in the sidebar below the primary six items,
in pinned order — absent from the DOM entirely when the list is empty,
rather than reserving dead space.

---

# 19. Active Navigation

The workspace inherits the Landing Page philosophy.

The active destination is represented through movement.

Not color changes.

The active indicator should glide between destinations.

Never fade.

Never instantly jump.

Reason

Movement creates continuity.

Source:
AppShell.tsx :contentReference[oaicite:9]{index=9}

---

# 20. Canvas Specification

Purpose

The canvas is the workspace.

Every page is rendered inside this area.

Pages should never attempt to recreate:

Rounded boundaries

Atmosphere

Floating layout

These responsibilities belong to AppShell.

---

## Canvas Rules

Pages own:

Content

Interaction

Workflow

AppShell owns:

Navigation

Theme

Atmosphere

Structure

This separation should never be violated.

---

# 21. Shared Page Template

Every workspace page should inherit one shared structure.

```text
Page Header

↓

Primary Surface

↓

Supporting Surface(s)

↓

Bottom Breathing Space
```

Pages should differ through content.

Not layout philosophy.

---

# 22. Page Header Specification

Every page begins with a consistent header.

Contains:

Title

↓

Optional count/status summary (`HeaderCountSummary`, e.g. "36 mails · 4
urgent · 2 important")

↓

Optional page-level action

The header establishes context before interaction begins.

It should not become a toolbar.

---

## Typography

CANONICAL V1.0 TITLE: quiet, not large. Every real workspace page —
Dashboard, Inbox (and its mail-management views), Actions, Opportunities,
Approvals, Settings — renders its title at the same weight-300, 20px
treatment, token-backed as `--type-page-title`
(`300 calc(var(--type-scale, 1) * 20px)/1.2 'Inter', sans-serif`, Engineering
Constitution §40/§42). `letterSpacing: '-0px'` and `color: var(--text-strong)`
alongside it (Approvals additionally applies the gold title gradient — Design
Constitution §4 permits gold on important page titles). All five real pages
consume this one token; none hand-derives its own copy of the shorthand.

A SECOND, LARGER TREATMENT EXISTS AND IS NOT THE SHIPPED PATTERN. The
`PageHeader` component (`components/workspace/WorkspacePage.tsx`) and the
`.obligo-title`/`.obligo-title--accent` classes render the Landing-derived
`clamp(30px, 4.2vw, 44px)` gradient-fill heading. Nothing in the shipped
navigation uses it — its only consumer is `Foundation.tsx`, the permanent
dev-only style guide (§48), where it remains as a visible reference for the
earlier, larger pattern rather than being repointed to match. If a future
page genuinely needs a heavier title treatment than `--type-page-title`,
`PageHeader` is where that decision is made explicitly — not by silently
reintroducing a second inline title style.

Supporting text (where a page uses one, e.g. `PageSection`'s `description`)

Smaller

Reduced opacity

Comfortable reading width

This hierarchy should remain identical across all six real pages.

---

# 23. Shared Surface Pattern

The primary building block throughout the workspace is the glass surface.

Characteristics

| Property | Usage |
|-----------|-------|
| Rounded corners | Large radius |
| Thin border | Low contrast |
| Soft shadow | Separation |
| Glass background | Depth |
| Inset highlight | Premium finish |

This pattern should be reused.

Never recreated with slightly different values.

---

# 24. Table Pattern

Tables are the preferred interaction model whenever users configure multiple related settings.

Current examples

Automation (labelled "How I Help" in the UI — Design Constitution §11)

Quick Access

Inbox Cleanup

Future candidates

Permissions

Notification preferences

Integrations

Reasons

• Compact

• Easy to scan

• Easy to compare

• Predictable

The table becomes the interaction surface.

Individual dropdowns remain secondary.

---

# 25. Dropdown Pattern

Dropdowns are the preferred control whenever:

Choices are mutually exclusive.

The choice count remains small.

The current value should remain visible.

Current usage

Automation Level

Reply Tone

Inbox Cleanup

Future usage should follow the same pattern.

---

# 26. Progressive Disclosure

The workspace intentionally hides advanced functionality.

Pattern

```text
Primary Settings

↓

Advanced

(collapsed)

↓

Power-user options
```

Purpose

Reduce cognitive load.

Allow advanced customization without intimidating first-time users.

Current implementation

Settings page.

Future implementations should reuse this philosophy.

---

The Workspace is built upon a small number of permanent systems.

• AppShell

• Topbar

• Sidebar

• Canvas

• Glass Surfaces

• Shared Tables

• Shared Dropdowns

Every future page should extend these systems rather than introducing competing interaction models.

---


# Shared Motion, Theme & Brand Identity Reference

This section documents the reusable interaction vocabulary and identity systems that define Obligo.

Unlike components, these systems should feel invisible to users.

Users should never consciously notice them.

Instead, they should simply experience a frontend that feels calm, responsive and cohesive.

The implementation documented here is considered canonical for all future workspace development.

---

# 27. Motion Philosophy

The application implements one unified motion language.

Every animation should communicate one of four things.

| Purpose | Description |
|----------|-------------|
| Orientation | Helps users understand where they are |
| Relationship | Shows which objects belong together |
| Confirmation | Confirms interaction |
| Continuity | Makes transitions feel physical |

Animations should never exist solely for decoration.

---

# 28. Motion Categories

The implementation naturally falls into four motion categories.

| Category | Examples |
|----------|----------|
| Ambient Motion | Starfield, drifting glow |
| Navigation Motion | Sidebar pill, landing navigation |
| Content Motion | Fade-ins, stagger reveals |
| Micro Motion | Hover, tap, toggles |

Future animations should belong to one of these existing categories.

New categories should only be introduced when genuinely necessary.

---

# 29. Ambient Motion

## Starfield

Source

Landing.tsx

Implementation

React Three Fiber

Purpose

Provide environmental depth without distracting from content.

Characteristics

| Property | Implementation |
|-----------|----------------|
| Render Engine | @react-three/fiber |
| Point Clouds | Multiple |
| Continuous Rotation | Yes |
| User Interaction | None |

The starfield should never become interactive.

It is environmental only.

---

## Glow Drift

The workspace glow exists independently of page content.

Characteristics

• Continuous

• Extremely slow

• Barely perceptible

Purpose

Prevent the interface from appearing static while avoiding visual distraction.

Future pages inherit this automatically.

---

# 30. Entrance Motion

## FadeInText

Source

Landing.tsx

Purpose

Reveal narrative content while scrolling.

Characteristics

| Property | Behavior |
|-----------|----------|
| Initial State | Hidden |
| Trigger | Viewport |
| Replay | Disabled |
| Direction | Vertical |
| Opacity | Animated |

This establishes the official content entrance language.

Workspace pages should use equivalent behavior for major content groups.

---

## Progressive Reveal

Large interfaces should reveal themselves progressively.

Preferred order

```text
Page

↓

Header

↓

Primary Surface

↓

Supporting Sections

↓

Secondary Information
```

Avoid revealing every element simultaneously.

---

# 31. Stagger Language

The landing page consistently staggers related content.

Purpose

Guide reading order.

Never create spectacle.

Typical usage

• Cards

• Narrative blocks

• Features

• Statistics

The stagger pattern should remain subtle.

Users should perceive structure rather than animation.

---

# 32. Hover Language

The hover language throughout Obligo follows one consistent philosophy.

Characteristics

• Small movement

• Small elevation

• Immediate response

• Fast recovery

Hover should never dramatically change layout.

Hover should never surprise the user.

---

## Allowed Hover Effects

Preferred

• Slight lift

• Border refinement

• Surface refinement

• Gold refinement

• Cursor acknowledgement

Avoid

• Large scaling

• Rotation

• Bounce

• Flashing

• Dramatic shadows

The interaction should feel precise.

Not playful.

---

# 33. Press Language

Interactive elements should acknowledge clicks immediately.

Typical responses

• Small scale reduction

• Immediate recovery

• Maintained readability

The interface should always feel responsive.

Backend latency should never affect click feedback.

---

# 34. Navigation Motion

Navigation is treated as movement through a physical environment.

Current implementation

Landing

↓

Shared Layout Animation

↓

Workspace Sidebar

The active destination moves.

It does not simply change color.

This principle should remain unchanged.

---

# 35. Scroll Behavior

The landing page establishes the official scroll philosophy.

Characteristics

• Continuous

• Predictable

• Section-aware

• Orientation preserving

Users should always understand where they are.

Scrolling should never feel disconnected from navigation.

---

# 36. Theme Toggle

Source

ThemeToggle.tsx

Purpose

Allow users to switch between workspace lighting conditions.

Characteristics

| Property | Value |
|-----------|-------|
| Persistence | Local Storage |
| System Preference Support | Yes |
| Workspace Override | Yes |

The Theme Toggle is global.

Pages should never implement independent theme switching.

---

# 37. Theme Initialization

Priority

1.

Stored User Preference

↓

2.

System Preference

↓

3.

Application Default

The application should avoid flashing incorrect themes during initialization.

---

# 38. Workspace Theme Tokens

The workspace does not use CSS inversion.

Instead,

semantic variables drive every visual property.

Examples include

Background

Canvas

Panel

Surface

Border

Primary Text

Muted Text

Gold

Glow

Components consume semantic meaning.

Never raw colors.

---

# 39. Brand Identity

The workspace brand consists of three elements.

Logo

↓

Obligo

↓

Obligo

This structure should remain consistent throughout the application.

The logo should never appear isolated from the brand for authenticated experiences.

---

# 40. Brand Animation

Source

BrandLogo.tsx

The landing page logo follows a staged reveal.

General sequence

```text
Icon

↓

Animation

↓

Wordmark
```

Purpose

Introduce the product naturally during the first impression.

The workspace uses the completed state only.

Authentication represents entry into the mature product.

---

# 41. Theme Consistency

Changing themes should modify only lighting.

It should never alter

Layout

Spacing

Motion

Hierarchy

Interaction

Typography

Users should perceive one product.

Not two separate interfaces.

---

# 42. Shared Atmosphere

The workspace atmosphere consists of reusable environmental systems.

Current implementation

• Grain

• Glow

• Surface depth

• Floating shell

• Layered elevation

Pages inherit this automatically.

No page should recreate atmosphere independently.

---

# 43. Motion Performance Rules

Every animation should satisfy the following.

□ GPU-friendly where possible.

□ Avoid unnecessary layout recalculation.

□ Maintain smooth interaction.

□ Preserve readability during motion.

□ Complete quickly enough to avoid interrupting work.

If animation and responsiveness conflict,

responsiveness wins.

---

# 44. Brand Consistency Rules

Every authenticated page should preserve:

□ Shared logo placement.

□ Shared topbar hierarchy.

□ Shared navigation.

□ Shared typography.

□ Shared atmosphere.

□ Shared gold usage.

Users should immediately recognize every page as belonging to the same product.

---

The Landing Page establishes the interaction vocabulary of Obligo.

The Workspace inherits and adapts it.

Future implementations should never introduce independent motion languages, independent theme systems or independent branding structures.

Instead, they should extend the shared identity already established by the existing implementation.

---

# Component Inventory & Implementation Notes

This section documents the reusable frontend systems that currently exist within the Obligo codebase.

Unlike previous sections, this chapter serves as an inventory.

Its purpose is to identify:

• Stable systems

• Reusable systems

• Systems intended for extension

• Systems scheduled for deprecation

Future contributors should consult this inventory before introducing new frontend abstractions.

---

# 45. Foundation Components

Foundation Components represent the smallest reusable interface elements.

These components should remain generic and independent of any specific page.

Current inventory (`components/workspace/`, re-exported from `index.ts`)
includes:

| Component | Status | Responsibility |
|-----------|--------|----------------|
| ThemeToggle | Stable | Global theme switching |
| BrandLogo | Stable | Product identity |
| Nav pill (`AppShell`, `SPRING_PILL`) | Stable | Active navigation indicator |
| Avatar (`AppShell`) | Stable | User identity (§17 — static, no menu) |
| `Select` | Stable | Single-choice input |
| `Toggle` | Stable | Binary input |
| `Slider` | Stable | Priority Weight controls (shipped, not planned) |
| `Button` | Stable | Primary interaction |
| `Divider` | Stable | Visual separation |
| `InteractiveRow` | Stable | The one row-interaction engine every list row (Dashboard, Inbox, Actions, Opportunities, Approvals, Drafts) builds on — owns hover/press/selected mechanics; pages configure only visual intensity |

These components should never contain business logic.

---

# 46. Layout Components

Layout Components establish reusable page structure.

Current inventory:

| Component | Status | Responsibility |
|-----------|--------|----------------|
| AppShell | Stable | Global workspace shell |
| PageRail (`.obligo-page`/`--rail-max`) | Stable | Maximum readable width |
| Canvas | Stable | Workspace content area |
| Sidebar | Stable | Navigation + Quick Access (§18a) |
| Topbar | Stable | Global controls |
| `WorkspacePage` | Stable | Shared Page Template (§21) — scroll container, reading rail, staggered entrance |
| `PageHeader` | Stable, but not the shipped page-title pattern | The larger Landing-derived title treatment; only Foundation renders it (§22) |
| `PageSection` | Stable | Section rhythm; heading renders as a real `<h2>` with `aria-labelledby` (Engineering Constitution §147) |

These components define spatial relationships rather than product workflows.

---

# 47. Pattern Components

Pattern Components combine multiple reusable elements into meaningful workflows.

Current patterns include:

| Pattern | Status |
|----------|--------|
| Dashboard Briefing | Stable |
| Approval Review Surface | Stable |
| Settings Table | Stable |
| Inbox Stream / List + Detail (`MailThreadView`) | Stable — shared by Inbox, every mail-management view, Drafts, Approvals, Dashboard |
| Opportunity Group | Stable |
| Mail Thread (`MailThreadView`, `ReplyComposer`) | Stable — the one opened-mail surface every page that reads a thread renders through |
| Drafts | Stable — a view over canonical `mailStore` state, not a new pattern (§99) |

Future product features should compose these patterns before creating new ones.

---

# 48. Page Inventory

Authenticated workspace pages currently include:

| Page | Status | Route |
|------|--------|-------|
| Dashboard | Stable | `/dashboard` |
| Inbox (+ mail-management views) | Stable | `/inbox`, `/inbox/:view` |
| Actions | Stable | `/actions` |
| Opportunities | Stable | `/opportunities` |
| Approvals | Stable | `/approvals` |
| Settings | Stable | `/settings` |
| Foundation | Stable, dev-only | `/foundation` — permanent style guide, deliberately outside the sidebar and `MAIL_VIEWS` |

`/inbox/:view` covers eight mail-management views via one shared component:
Starred, Snoozed, Drafts, Scheduled, Sent, Archive, Trash, Spam — see
`MAIL_VIEWS` (`lib/mailViews.ts`).

Every page inherits:

AppShell

↓

Canvas

↓

Page Template

↓

Shared Components

No page establishes its own visual language.

---

# 49. Shared Interaction Models

The application intentionally minimizes interaction models.

Current shared interaction patterns include:

| Pattern | Used By |
|----------|---------|
| Tables | Settings (How I Help, Quick Access, Inbox Cleanup) |
| Dropdowns | Settings |
| Split View / List + Detail | Inbox and every mail-management view, Drafts, Approvals |
| Summary Cards | Dashboard |
| Progressive Disclosure | Settings' Advanced section |

Whenever possible,

future workflows should reuse these existing interaction models.

---

# 50. Reusable Surface Types

The workspace intentionally limits the number of surface styles.

Current surface inventory:

| Surface | Purpose |
|----------|---------|
| Glass Panel (`Panel`, `.obligo-panel`) | Primary content |
| Floating Shell | Workspace frame |
| Table Surface | Configuration (Settings) |
| Overlay Surface | Temporary interaction (menus, popovers, dialogs) |

Additional surface styles should only be introduced when they solve a fundamentally new interaction problem.

---

# 51. Navigation Inventory

Current navigation consists of two permanent systems, plus one
user-configurable extension of the second:

Landing Navigation

Purpose

Product exploration.

Workspace Navigation

Purpose

Workflow switching between the six primary pages (§48).

Quick Access (§18a)

Purpose

User-pinned shortcuts to mail-management views, rendered below the primary
six. Configurable from Settings; order is user-controlled.

These systems intentionally share a common motion language while serving different user goals.

---

# 52. Theme Inventory

Current theme implementation consists of:

Landing

CSS inversion strategy.

Workspace

Semantic token strategy.

This distinction should remain unless the entire frontend is redesigned.

Individual pages should never introduce independent theme behavior.

---

# 53. Motion Inventory

Current motion systems include:

| Motion System | Status |
|--------------|--------|
| FadeInText | Stable |
| Active Navigation Bubble | Stable |
| Sidebar Navigation Pill | Stable |
| Hover Language | Stable |
| Page Entrance | Stable |
| Stagger Reveal | Stable |
| Theme Transition | Stable |
| `--dur-micro`/`--ease` CSS tokens | Stable — restate `motion.ts`'s `DURATION.micro`/`EASE` for CSS-driven transitions (Engineering Constitution §48) |

These systems establish the official animation vocabulary of Obligo.

---

# 54. Atmosphere Inventory

Permanent environmental systems:

| System | Purpose |
|---------|---------|
| Grain | Texture |
| Glow | Ambient lighting |
| Floating Shell | Workspace identity |
| Glass Surfaces | Depth |
| Layered Elevation | Hierarchy |

Atmosphere is considered part of the workspace infrastructure.

Pages consume it automatically.

---

# 55. Stable Systems

The following systems should be considered mature.

• AppShell

• Workspace layout

• Navigation philosophy, including Quick Access (§18a)

• Motion vocabulary

• Typography hierarchy, including the token-backed `--type-*` roles (§40)

• Theme architecture

• Shared atmosphere

• Design tokens — color/surface/shadow/blur/glow (long-standing) and
spacing/radius/typography (established; see Engineering Constitution
§25-26, §35, §40, §42)

• `mailStore` / `workflowStore` / `settingsStore` (Engineering Constitution
§93) — the shared-brain implementation

• The two-axis attention model (`lib/attention.ts`) — urgency and importance,
independent, never collapsed to one tier (Engineering Constitution §104)

• Drafts — a first-class `MAIL_VIEWS` entry, a view over canonical state,
not a parallel system (§99)

Future work should extend these systems.

Not replace them.

---

# 56. Systems Expected to Evolve

The following systems are intentionally designed for future expansion.

• Dashboard widgets

• Opportunity grouping

• Automation options

• Inbox cleanup categories

• Settings' Advanced controls

• Component variants

• Loading states — DEFERRED to backend integration, not yet built (Engineering
Constitution §56)

• Profile menu — DEFERRED to V1.1, not yet built (Design Constitution §8,
Reference §17)

• Draft-id / attachment reconciliation — the provisional-id and
`LocalAttachment`→`StoredAttachment` seams exist and are documented
(Engineering Constitution §105) but the backend endpoints that would
exercise them do not

Their architecture should remain stable while their capabilities expand.

---

# 57. Legacy Inventory

The following systems were identified during Sprint 1 review, and a later
backend-removal pass, as legacy implementations. None are referenced by the
current application.

| Component | Status |
|-----------|--------|
| Old AppShell | Replaced |
| Section | Removed |
| PageHeader (legacy, pre-Sprint-1) | Removed |
| TaskCard | Removed |
| TaskRow | Removed |
| EmailRow | Removed |
| EmptyState (legacy variant) | Removed |
| ConnectPrompt | Removed |
| Pagination | Removed |
| presentation.ts | Removed |
| api.ts / apiBase.ts | Removed — the dead Express/Node.js backend simulation layer; superseded by the frontend-only `mailStore`/`workflowStore`/`settingsStore` architecture (§93), which is the actual current data layer pending real backend integration |
| appContext.tsx / appContextStore.ts | Removed — superseded by the same |
| useApp.ts / useAdminShortcut.ts | Removed |
| ui/InteractiveDemo.tsx, ui/ProductDemo.tsx, ui/ThreeBackground.tsx | Removed |

These implementations should not be revived.

They should either be removed or replaced by the current shared design system.

---

# 58. Future Component Policy

Future reusable components should only be introduced when they satisfy all of the following.

□ Solve a recurring problem.

□ Cannot be expressed through composition.

□ Fit naturally within the existing design language.

□ Reuse shared tokens.

□ Reuse shared motion.

□ Remain independent of individual pages.

If these conditions are not satisfied,

an existing component should be reused or extended instead.

---

# 59. Document Maintenance

This reference should evolve together with the frontend.

Whenever implementation changes,

the corresponding reference should be updated during the same pull request.

Implementation and documentation should never diverge.

If implementation changes without updating this document,

the implementation becomes the authoritative source until the reference is corrected.

---

# Closing Statement

The Design Constitution defines the philosophy of Obligo.

The Frontend Architecture & Engineering Constitution defines how that philosophy is engineered.

The Frontend Implementation Reference documents the concrete implementation that exists today.

Together, these three documents form the complete frontend specification for Obligo.

Any future contributor, whether human or AI, should be able to understand, extend and maintain the product without relying on historical conversations or undocumented assumptions.

Future development should strengthen this system rather than fragment it.