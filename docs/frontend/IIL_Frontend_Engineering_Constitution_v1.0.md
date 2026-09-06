# IIL (Inbox Intelligence Layer)
# Frontend Architecture & Engineering Constitution
Version: 1.0
Status: Draft
Owners: Founding Team
Last Updated: Sprint 1 Frontend Freeze

---

# Introduction

This document defines how the IIL frontend is engineered.

Unlike the Design Constitution, which explains **what the product should feel like**, this document explains **how that feeling is implemented**.

Its purpose is to ensure that every engineer implementing IIL produces interfaces that are visually, structurally and behaviorally consistent with the existing product.

The Landing Page is considered the reference implementation of the IIL design language.

Future workspace pages inherit from that implementation instead of reinventing it.

This document should be treated as the engineering source of truth for every frontend decision.

---

# Relationship with the Design Constitution

The Design Constitution defines:

• Product philosophy

• User experience philosophy

• Information hierarchy

• Visual identity

• Product personality

The Engineering Constitution defines:

• Architecture

• Layout

• Tokens

• Motion

• Components

• Responsiveness

• Accessibility

• Performance

• Engineering standards

The Design Constitution answers:

> Why does IIL behave this way?

The Engineering Constitution answers:

> How is that behavior implemented?

Both documents are required before implementing new features.

---

# PART I

# Product Engineering Philosophy

The following principles govern every engineering decision inside IIL.

These principles rarely change and should survive multiple frontend rewrites.

Whenever implementation decisions become ambiguous, these principles take precedence.

---

# 1. IIL is an Intelligence Layer

IIL is not an email client.

It is an Intelligence Layer built above email.

The frontend should always reinforce this distinction.

The application exists to reduce work rather than encourage interaction.

Time spent inside IIL should decrease as the system becomes more intelligent.

Every engineering decision should support this objective.

Success is measured by:

• Faster task completion

• Lower cognitive load

• Reduced interaction

Never optimize for:

• Session duration

• Click count

• Feature visibility

• Engagement metrics

The interface should quietly disappear behind the user's work.

---

# 2. One Product

The Landing experience and the Workspace experience are not separate products.

They are different parts of one continuous experience.

The Landing Page introduces IIL.

The Workspace continues it.

Every engineering decision should preserve this continuity.

A user moving from the Landing Page into the Workspace should feel like they walked deeper into the same building.

Not into another application.

This means:

• Shared atmosphere

• Shared spacing

• Shared motion

• Shared typography

• Shared component language

• Shared visual rhythm

No page may establish a separate visual identity.

---

# 3. Experience is Centralized

Pages should describe content.

The application template describes experience.

Individual pages should never implement their own:

• Navigation

• Atmosphere

• Theme

• Motion language

• Responsive behavior

• Layout philosophy

• Spacing philosophy

These responsibilities belong to the shared frontend architecture.

Whenever experience changes, it should change once.

Every page should automatically inherit the improvement.

---

# 4. Consistency Before Creativity

Consistency has higher priority than novelty.

New pages should achieve originality through composition rather than reinvention.

Whenever a problem can be solved using existing systems, those systems should be reused.

Future engineers should resist introducing page-specific implementations unless absolutely necessary.

The goal is for users to immediately understand new pages without relearning the interface.

Consistency reduces learning.

Consistency increases trust.

Consistency improves speed.

---

# 5. Build Today's Product

The frontend should solve today's product exceptionally well.

It should not attempt to predict every future feature.

Premature flexibility introduces unnecessary complexity.

Whenever new product requirements emerge, existing systems should be extended thoughtfully rather than over-engineered in advance.

Engineering effort should follow product maturity.

Never build "just in case."

Build when genuine product requirements appear.

---

# 6. Reuse Before Creating

Before introducing any new frontend system, ask the following questions.

1.

Can an existing system solve this problem?

If yes,

reuse it.

2.

Can a small extension solve this problem?

If yes,

extend it.

3.

Does this introduce a genuinely new interaction?

Only then create a new system.

This rule applies to:

• Components

• Layouts

• Motion

• Tokens

• Utilities

• Hooks

• Patterns

Every reusable system should justify its existence.

---

# 7. The Shared Brain

Pages never communicate directly with other pages.

Every page communicates only with the application's shared state.

The shared state communicates with the backend.

The backend performs business logic.

The resulting application state is then reflected back to every page.

Application flow therefore becomes:

User

↓

Current Page

↓

Shared State

↓

Backend

↓

Shared State

↓

Affected Pages

This architecture ensures:

• Predictability

• Easier debugging

• Lower coupling

• Better scalability

Pages should never synchronize each other manually.

---

# 8. The Product Evolves as a System

The frontend is treated as one evolving system rather than a collection of individual pages.

Every improvement should strengthen the system as a whole.

If multiple pages require the same enhancement, the enhancement should be introduced into the shared system rather than duplicated across pages.

Future product growth should primarily occur through extending shared foundations instead of multiplying page-specific solutions.

---

# Engineering Summary

Every engineering decision should reinforce one or more of the following principles.

• One Product

• Shared Experience

• Consistency

• Reuse

• Shared Brain

• Build Today's Product

Whenever two implementation choices appear equally valid, choose the option that better reinforces these principles.

---

# Frontend Architecture

This section defines how the IIL frontend is physically constructed.

Unlike the previous section, which explains engineering philosophy, this section defines the application's architecture and the responsibilities of every architectural layer.

Every future page, feature and interaction should fit naturally into this architecture.

The architecture is intentionally hierarchical.

Each layer owns a specific responsibility.

Lower layers should never assume the responsibilities of higher layers.

Likewise, higher layers should not duplicate responsibilities already owned by lower layers.

---

# 9. Overall Application Architecture

The frontend follows a layered architecture.

Every request, interaction and screen is built upon the same foundation.

The complete hierarchy is:

Browser

↓

React Application

↓

Global Providers

↓

Router

↓

AppShell

↓

Workspace Atmosphere

↓

Navigation Layer

↓

Canvas

↓

Page Template

↓

Page

↓

Sections

↓

Patterns

↓

Reusable Components

↓

Foundation Components

Every engineer should understand where their work belongs before writing any code.

Skipping architectural layers introduces duplication and inconsistency.

---

# 10. React Application

The React Application is responsible for bootstrapping IIL.

Responsibilities include:

• Application initialization

• Global Providers

• Routing

• Theme initialization

• Error boundaries

• Global context initialization

This layer should contain no product-specific presentation logic.

Its responsibility ends once the workspace is initialized.

---

# 11. Global Providers

Global Providers establish services required throughout the application.

Examples include:

• Authentication

• Application Context

• Theme

• Notifications

• Error Handling

• Future global services

Providers should expose shared capabilities.

They should never render visual interfaces.

Business logic belongs here.

Presentation does not.

---

# 12. Router

The Router determines which page is currently visible.

It does not determine how pages are displayed.

Its responsibilities are limited to:

• Route definitions

• Nested layouts

• Navigation

• Protected routes

The Router should remain unaware of page layouts, styling and presentation.

Those responsibilities belong to AppShell.

---

# 13. AppShell

AppShell is the single most important frontend component.

Every workspace page exists inside AppShell.

AppShell establishes the identity of IIL before any page content appears.

It owns:

• Workspace layout

• Top Navigation

• Sidebar

• Background atmosphere

• Theme application

• Shared motion

• Workspace spacing

• Shared responsive behavior

• Navigation state

AppShell should never contain page-specific content.

If Dashboard is replaced by Inbox, AppShell should remain unchanged.

AppShell is permanent.

Pages are temporary.

---

# 14. Atmosphere Layer

Immediately inside AppShell exists the Atmosphere Layer.

The Atmosphere Layer creates the environmental identity of IIL.

It is composed of shared visual systems including:

• Ambient glow

• Animated grain

• Background depth

• Lighting

• Theme-specific atmosphere

The purpose of the Atmosphere Layer is not decoration.

Its purpose is to ensure every workspace page feels like it exists inside one continuous environment.

Individual pages must never recreate atmospheric effects.

Atmosphere belongs exclusively to AppShell.

---

# 15. Navigation Layer

Navigation consists of two permanent systems.

Top Navigation

Sidebar Navigation

Neither belongs to any individual page.

They remain constant throughout the application.

Their responsibilities include:

• Orientation

• Navigation

• User identity

• Theme switching

• Global account controls (DEFERRED — V1.1: the identity element currently
renders as a static avatar; no interactive account menu exists yet — see
Design Constitution §8)

Sidebar Navigation additionally renders Quick Access: mail-management views
(Starred, Snoozed, Drafts, Scheduled, Sent, Archive, Trash, Spam) the user
has pinned from Settings, in user-controlled order. This is still navigation
the shell owns, not a page — the underlying selection/ordering is shared
state (`useQuickAccess`), read the same way by the sidebar and by Settings'
own editor for it, never duplicated between the two.

Navigation should never contain page-specific actions.

Actions belong inside individual pages.

Navigation belongs to the application.

---

# 16. Canvas

The Canvas is the workspace where pages exist.

It should be thought of as an empty room.

The Canvas is intentionally generic.

It provides:

• Available workspace

• Scroll container

• Content region

• Background continuity

The Canvas should never impose page-specific layouts.

Instead, it delegates layout responsibility to the Page Template.

---

# 17. Page Template

Every workspace page begins from the same Page Template.

The Page Template is one of the most important reusable systems in IIL.

It exists to ensure every page inherits identical structural behavior.

The Page Template owns:

• Maximum readable width

• Horizontal margins

• Vertical rhythm

• Page padding

• Initial page spacing

• Entrance behavior

• Responsive scaling

Individual pages should never redefine these properties.

If future improvements are made to page spacing or layout, they should be implemented once inside the Page Template.

Every page automatically benefits.

---

# 18. PageRail

PageRail is the implementation responsible for maintaining comfortable reading proportions.

It is inherited directly from the Landing Page implementation.

PageRail ensures content does not continue expanding simply because larger monitors are available.

Instead:

The workspace expands.

The content remains comfortably readable.

Extra horizontal space becomes environmental breathing room.

This preserves:

• Reading comfort

• Visual hierarchy

• Premium composition

• Consistent proportions

Every workspace page should inherit PageRail.

No page should bypass it.

---

# 19. Page Responsibilities

Individual pages are intentionally lightweight.

Pages describe content.

They do not define experience.

Pages are responsible for:

• Information architecture

• Section ordering

• User workflows

• Page-specific interactions

Pages are NOT responsible for:

• Global spacing

• Theme behavior

• Shared motion

• Shared navigation

• Shared atmosphere

• Shared responsiveness

These responsibilities already belong to higher architectural layers.

---

# 20. Sections

Each page is divided into logical Sections.

Examples include:

Dashboard

• Needs Attention

• Opportunities

• Upcoming

Approvals

• Pending Reviews

• Review Surface

Settings

• How I Help

• Quick Access

• Inbox Cleanup

• Priorities

• Advanced

Sections organize information.

They do not implement reusable visual systems.

Each section should be independently understandable.

Whitespace separates sections.

Not borders.

---

# 21. Patterns

Patterns are reusable arrangements of multiple components.

They represent common product interactions.

Examples include:

• Approval Review Surface

• Opportunity Group

• Dashboard Briefing

• Settings Table

• Mail Thread

Patterns combine existing components into meaningful workflows.

Patterns should not introduce new visual language.

They inherit existing components.

---

# 22. Reusable Components

Components are the building blocks used throughout the application.

Components represent reusable ideas.

Never pages.

Examples include:

• Panel

• Section Header

• Table

• Dropdown

• Button

• Input

• Toggle

• Timeline

• Badge

Every component should solve one clearly defined problem.

Components should remain composable.

Large interfaces should emerge from combining small components.

Not from building enormous page-specific widgets.

---

# 23. Foundation Components

Foundation Components exist at the lowest architectural level.

These include primitive interface elements such as:

• Button

• Input

• Select

• Toggle

• Slider

• Avatar

• Icon

• Divider

They should remain intentionally generic.

Product-specific behavior belongs to higher-level components.

Foundation Components should never contain business logic.

---

# 24. Layer Responsibilities

Every architectural layer owns a specific responsibility.

The responsibility should never be duplicated elsewhere.

React Application

Owns application startup.

Global Providers

Own global services.

Router

Owns navigation flow.

AppShell

Owns workspace identity.

Atmosphere

Owns environmental presentation.

Navigation

Owns orientation.

Canvas

Owns workspace region.

Page Template

Owns page structure.

Pages

Own content.

Sections

Own organization.

Patterns

Own workflows.

Components

Own reusable interface behavior.

Foundation Components

Own primitive interactions.

Whenever uncertainty exists regarding implementation, responsibility should be assigned to the highest architectural layer capable of solving the problem for every page.

---

# Architecture Checklist

Every new page must satisfy the following requirements before implementation is considered complete.

□ Uses AppShell.

□ Uses the shared Page Template.

□ Inherits PageRail.

□ Does not redefine workspace spacing.

□ Does not redefine navigation.

□ Does not implement its own atmosphere.

□ Uses existing reusable components.

□ Organizes information into Sections.

□ Builds workflows using existing Patterns.

□ Leaves global responsibilities to higher architectural layers.

If any of the above conditions are violated, the implementation should be reconsidered before merging.

---

# Design Token System & Visual Language

This section defines the visual language of IIL from an engineering perspective.

Unlike the Design Constitution, which describes the desired visual identity, this section documents the actual engineering systems responsible for producing that identity.

The Landing Page implementation is the canonical reference implementation for all design tokens.

Workspace pages inherit these systems.

They do not redefine them.

---

# 25. Design Token Philosophy

Every visual decision inside IIL should originate from a shared design token.

A component should never decide:

• its own color

• its own spacing

• its own animation

• its own shadow

• its own radius

Instead, components consume existing tokens.

The design system owns visual decisions.

Components only apply them.

This ensures that visual consistency is maintained throughout the application.

Color, elevation, shadow, blur, glow and gold each have their own established
token family (§29-38). Spacing, radius and typography now do too:
`--space-micro/component/section/page`, `--radius-component/panel/surface`,
and six `--type-*` role tokens (`page-title`, `section-title`, `body`,
`caption`, `metadata`, `label`), all defined once in `.iil-root` alongside
the others. New and touched code should reach for these first, the same way
it already reaches for `--panel`/`--gold-2`/etc. — see §46 (Forbidden
Practices) for what this replaces.

---

# 26. Single Source of Truth

The workspace design system is defined centrally.

The existing Landing Page and Workspace implementation are considered the official implementation of this system.

No page should introduce additional visual systems.

Whenever a token needs to evolve, it should evolve once.

Every component should inherit the update automatically.

---

# 27. Theme System

IIL supports two themes.

Dark

Light

These are not separate interfaces.

They are two lighting conditions applied to the same workspace.

Changing themes should never modify:

• Layout

• Component hierarchy

• Typography

• Motion

• Spacing

• Navigation

Only visual token values change.

The experience remains identical.

---

# 28. Theme Ownership

Theme behavior belongs exclusively to the workspace token system.

Individual components should never detect themes independently.

Instead,

components consume semantic tokens such as:

Workspace Background

Surface

Panel

Border

Primary Text

Secondary Text

Gold Accent

Glow

The theme system maps these semantic meanings to actual color values.

This separation prevents components from becoming theme-aware.

---

# 29. Semantic Tokens

Tokens should describe meaning.

Never appearance.

Correct examples:

Workspace Background

Canvas

Panel

Surface

Border

Primary Text

Muted Text

Gold Accent

Hover Surface

Glow

Incorrect examples:

Black

Grey

Dark Card

Yellow Border

Light Panel

Semantic names survive redesigns.

Appearance names do not.

---

# 30. Workspace Color Hierarchy

Every workspace page follows the same color hierarchy.

Background

↓

Canvas

↓

Panels

↓

Interactive Elements

↓

Primary Accent

↓

Critical Feedback

Each level should visually separate itself from the previous level without creating excessive contrast.

The interface should feel layered.

Not fragmented.

---

# 31. Gold Philosophy

Gold is intentionally scarce.

It communicates importance.

Never decoration.

Gold should be reserved for:

• Brand identity

• Important page headers

• Primary intelligence

• High-value insights

• Important navigation emphasis

Gold should never become a general-purpose highlight color.

Avoid using gold for:

• Large surfaces

• Tables

• Inputs

• Dropdowns

• Secondary buttons

• Decorative borders

Overusing gold removes its meaning.

---

# 32. Surface Hierarchy

The workspace is composed of multiple visual layers.

Each layer exists to establish depth.

The hierarchy should remain consistent across all pages.

Environment

↓

Canvas

↓

Panels

↓

Interactive Panels

↓

Floating Elements

↓

Overlays

Every layer should inherit the existing elevation system.

Pages must never invent new depth levels.

---

# 33. Elevation System

Elevation communicates interaction.

Not decoration.

Higher elevation indicates:

• Increased importance

• Active interaction

• Floating content

• Temporary interfaces

Static information should remain visually grounded.

Hover should slightly increase elevation.

Selection may increase elevation further.

Modal interfaces occupy the highest elevation.

Elevation should always remain subtle.

---

# 34. Border Philosophy

Borders are used to improve readability.

Not to divide everything.

Prefer whitespace first.

Borders second.

Heavy borders should never replace good spacing.

Tables intentionally use borders because they communicate structure.

General page layouts should primarily rely on whitespace.

---

# 35. Radius System

Border radius is part of the shared design language.

Components inherit existing radius values.

Pages must never define custom radii.

Different interface elements may consume different radius tokens.

For example:

Buttons

Panels

Tables

Pills

Dropdowns

These relationships are defined centrally.

Consistency is more important than exact values.

Three tokens cover the values a new component reaches for first —
`--radius-component` (8px: buttons, controls, small chips), `--radius-panel`
(10px: rows, cards, panels), `--radius-surface` (22px: large reading
surfaces like the thread pane). Existing, already-established component
classes (`.iil-panel`, `.iil-btn`, etc.) keep their own long-standing values
rather than being retrofitted onto these — the tokens exist to stop new
divergence, not to force a retroactive rewrite of values already consistent
with each other.

---

# 36. Shadow System

Shadows communicate physical depth.

Not decoration.

Every shadow belongs to the shared elevation system.

Individual components should never invent shadows.

Workspace shadows should communicate:

• Surface separation

• Hover

• Floating state

• Active interaction

Gold glow is treated separately from shadows.

---

# 37. Blur System

Blur is part of the environmental atmosphere.

It should never become decorative.

Blur exists primarily within:

• Top Navigation

• Floating surfaces

• Background atmosphere

• Overlays

Individual page content should rarely introduce additional blur.

Blur belongs to the workspace.

Not the page.

---

# 38. Lighting System

Lighting contributes to the premium appearance of IIL.

It should remain subtle.

Ambient lighting is implemented globally.

Pages inherit it automatically.

Lighting should support:

• Depth

• Warmth

• Focus

Never distraction.

---

# 39. Atmosphere

The workspace atmosphere consists of shared environmental effects.

Including:

• Animated grain

• Ambient glow

• Background depth

• Theme lighting

These systems create continuity between every page.

Pages should never recreate atmospheric effects.

Atmosphere belongs exclusively to AppShell.

---

# 40. Typography System

Typography follows one shared hierarchy.

The hierarchy should remain identical across every page.

Only semantic roles matter.

Examples:

Page Title

Section Title

Body

Caption

Metadata

Labels

Pages should consume these roles.

They should never invent new typographic hierarchies.

Implemented as `--type-page-title`, `--type-section-title`, `--type-body`,
`--type-caption`, `--type-metadata`, `--type-label` — each the literal `font`
shorthand already most common for that role, consumed as `font:
var(--type-body)`. `--type-page-title` is the canonical V1.0 page-title rule
(§17 Page Template, Reference §22): the quiet 20px weight-300 heading every
real workspace page renders, restated once instead of five separately
duplicated copies of the same shorthand.

---

# 41. Typography Philosophy

Typography exists to improve reading speed.

Never decoration.

Large headings establish hierarchy.

Body text communicates information.

Metadata remains visually quiet.

Text should never compete with the information it describes.

---

# 42. Spacing System

Spacing is one of the most important design tokens.

Spacing creates hierarchy before borders ever do.

The workspace follows a consistent spacing rhythm inherited from the Landing Page.

No component should introduce arbitrary spacing values.

Spacing tokens should define:

Micro spacing

↓

Component spacing

↓

Section spacing

↓

Page spacing

Every interface should feel rhythmically consistent.

Implemented as `--space-micro` (4px), `--space-component` (8px),
`--space-section` (14px) and `--space-page` (24px) — the values already most
common at each tier, not a new scale. Established in the token layer and
applied in shared primitives and touched code; not a mass-migration of every
existing hardcoded gap/padding value (§133 — refactoring should not alter
behavior; a 300-site mechanical rewrite is exactly the kind of change that
risks doing so for no product benefit).

---

# 43. Layout Rhythm

Whitespace communicates relationships.

Elements placed close together are interpreted as related.

Elements separated by larger spacing represent separate ideas.

This rhythm should remain identical across every page.

Future pages should inherit the existing rhythm instead of inventing new spacing relationships.

---

# 44. Visual Ownership

Visual systems belong to the design system.

Not individual components.

Whenever multiple components require the same visual property,

that property should become a shared token.

Never duplicate visual decisions.

Centralize them.

---

# 45. Extending the Design System

When new visual requirements emerge:

1.

Attempt to reuse an existing token.

2.

If impossible,

extend the shared token system.

3.

Never hardcode the value inside a component.

This ensures future visual changes remain centralized.

---

# 46. Forbidden Practices

The following practices are prohibited.

• Hardcoded colors

• Hardcoded spacing

• Hardcoded shadows

• Hardcoded radii

• Hardcoded transition durations

• Hardcoded blur values

• Page-specific design tokens

Whenever a repeated value appears,

it should become part of the shared design system.

---

# Design Token Checklist

Every implementation should satisfy the following.

□ Uses semantic color tokens.

□ Does not hardcode colors.

□ Uses shared spacing tokens.

□ Uses shared elevation.

□ Uses shared radius values.

□ Uses shared typography hierarchy.

□ Uses shared atmosphere.

□ Uses shared lighting.

□ Uses shared blur system.

□ Uses shared shadow system.

□ Introduces no page-specific visual tokens.

Only after all requirements are satisfied should visual implementation be considered complete.

---

# Motion, Interaction & Responsive Engineering

The purpose of this section is to define **how IIL behaves**, not simply how it looks.

Motion is treated as part of the product's communication system.

Responsive behavior is treated as part of the product's usability.

Neither should be considered decorative.

The Landing Page implementation is the canonical reference for motion and responsiveness.

Workspace pages inherit this behavior.

They do not reinterpret it.

---

# 47. Motion Philosophy

Motion exists to communicate.

Never to entertain.

Every animation inside IIL must satisfy at least one of the following purposes.

• Explain a state change

• Guide attention

• Preserve orientation

• Confirm interaction

• Reduce cognitive load

If an animation does not improve understanding,

it should not exist.

---

# 48. Motion Consistency

Every motion inside IIL belongs to one shared motion language.

The application should feel like one continuous physical environment.

Animations should never feel page-specific.

Whenever possible, reuse:

• Existing easing curves

• Existing spring configurations

• Existing animation timing

• Existing transition hierarchy

The Landing Page implementation defines the official motion language.

Workspace pages inherit it.

`motion.ts` (Framer Motion) remains the one canonical source for React-driven
animation. Two CSS custom properties, `--dur-micro` (220ms) and `--ease`
(the same cubic-bezier curve as `EASE`), restate its values for the smaller
set of interactions styled directly in CSS/inline `transition:` strings —
numerically identical to `motion.ts`, never a second vocabulary. Only exact
duplicates of these values were migrated onto them; several different, faster
short durations (.12s-.18s, for icon/color micro-fades) are a deliberately
distinct family and were left as-is rather than forced onto `--dur-micro`,
which would have changed their timing.

---

# 49. Motion Hierarchy

Not every interaction deserves the same amount of animation.

Motion should scale according to importance.

Micro Motion

Examples:

• Hover

• Button feedback

• Toggle changes

• Focus

Standard Motion

Examples:

• Dropdown opening

• Sidebar pill movement

• Section transitions

Large Motion

Examples:

• Theme switching

• Page transitions

• Major layout changes

Large motion should remain rare.

Frequent interactions should remain quick and subtle.

---

# 50. Hover Philosophy

Every interactive element should acknowledge the user's cursor.

Hover feedback should feel mechanical.

Not playful.

Acceptable hover responses include:

• Slight elevation

• Shadow refinement

• Border refinement

• Gold accent refinement

• Background refinement

Avoid:

• Large scaling

• Bounce animations

• Excessive glow

• Dramatic movement

Hover exists to confirm interactivity.

Not attract attention.

---

# 51. Click Feedback

Every click should produce immediate confirmation.

The user should never wonder whether an interaction was successful.

Feedback should remain subtle.

Examples include:

• Press state

• Elevation change

• Opacity adjustment

• Transition

Visual confirmation should appear immediately after interaction.

Business logic may complete later.

---

# 52. Focus States

Keyboard users should receive the same clarity as mouse users.

Every focusable element should provide:

• Clear visibility

• Consistent appearance

• Theme compatibility

Browser defaults should not become the final implementation.

Focus styling belongs to the shared design system.

---

# 53. Page Transitions

Changing pages should preserve continuity.

Navigation should feel like moving through one workspace.

Not loading unrelated websites.

Page transitions should remain understated.

The workspace itself should appear permanent.

Only page content changes.

---

# 54. Layout Animation

Layout animation should preserve spatial understanding.

Whenever interface elements move,

their movement should remain continuous.

Avoid:

Instant jumps.

Sudden repositioning.

Unexpected visual changes.

The user should always understand where interface elements came from.

And where they moved.

---

# 55. Shared Motion Ownership

Motion belongs to shared systems.

Pages should not define independent animation styles.

Shared systems include:

• Navigation

• Dropdowns

• Hover

• Panels

• Tables

• Theme switching

Whenever possible,

existing motion should be inherited rather than recreated.

---

# 56. Loading Philosophy

Loading should communicate progress without interrupting work.

Prefer:

Skeleton interfaces.

Reserved layout.

Progressive rendering.

Avoid:

Blocking full-page loaders.

Infinite spinners.

Loading should preserve page structure whenever possible.

Users should understand what is arriving before it appears.

DEFERRED — INTEGRATION PHASE: no loading state exists in V1.0. The demo data
layer (§114, §96) hydrates synchronously at import, so there is nothing to
show a skeleton for yet. This is not an omission to fix against the current
synchronous store — introducing fake loading states ahead of a real network
boundary would be decoration, not progress communication. Build this when
the backend integration actually introduces asynchronous fetches, against
the seam `mailActions.reset()`/`hydrate()` already provide (§114).

---

# 57. Empty States

Empty states are informational.

Not emotional.

Their purpose is to explain:

Why the page is empty.

What the user can do next.

How the product will behave in the future.

Empty states should remain calm.

Never playful.

Never apologetic.

---

# 58. Success Feedback

Success should feel quiet.

The product should acknowledge completion.

Then immediately allow the user to continue working.

Avoid:

Large banners.

Celebratory animations.

Confetti.

Overly enthusiastic messages.

The assistant should feel competent.

Not excited.

---

# 59. Error Feedback

Errors should explain.

Not alarm.

Whenever possible,

every error should answer three questions.

What happened?

Why did it happen?

What should the user do next?

Avoid vague messages.

Avoid technical terminology.

The interface should preserve trust,

even when something fails.

---

# 60. Responsive Philosophy

Responsiveness is not the process of shrinking interfaces.

It is the process of preserving usability across different screen sizes.

The product should always maintain comfortable reading proportions.

The browser may expand indefinitely.

The reading experience should not.

---

# 61. Reference Layout

The Landing Page establishes the official responsive philosophy.

Workspace pages inherit it.

The implementation should preserve:

• Comfortable reading width

• Balanced whitespace

• Stable proportions

• Consistent rhythm

The workspace should never stretch content merely because additional screen space exists.

Extra space becomes atmosphere.

Not content.

---

# 62. PageRail

Every workspace page must use the shared PageRail implementation.

PageRail is responsible for:

• Maximum readable width

• Horizontal centering

• Responsive padding

• Consistent proportions

Pages must never bypass PageRail.

PageRail is mandatory.

---

# 63. Scaling Philosophy

The interface should preserve perceived size.

Not maximize occupied space.

Large displays should produce:

More breathing room.

Not wider paragraphs.

Not larger tables.

Not stretched layouts.

The product should feel equally premium on:

• Small laptops

• Large laptops

• Desktop monitors

• Ultrawide displays

---

# 64. Breakpoint Ownership

Responsive behavior belongs to the shared workspace.

Pages should inherit breakpoints.

Pages should not introduce independent breakpoint systems.

When responsive behavior evolves,

it should evolve once.

Every page automatically inherits the improvement.

---

# 65. Content Reflow

As available space decreases,

content should reorganize itself.

Not simply shrink.

Preferred strategies include:

• Stacking sections

• Reducing columns

• Reflowing layouts

• Adjusting spacing

Avoid compressing typography to preserve layouts.

Readability has higher priority than visual symmetry.

---

# 66. Mobile Philosophy

Mobile is not a scaled-down desktop.

It is the same product expressed within different physical constraints.

Navigation,

spacing,

layout,

and interaction may adapt.

The product identity should not.

The experience should remain unmistakably IIL.

---

# 67. Interaction Consistency

Interaction behavior should remain identical across themes and screen sizes.

Users should never relearn:

Hover.

Focus.

Selection.

Navigation.

Buttons.

Dropdowns.

Consistency reduces cognitive load.

---

# 68. Motion Performance

Animations should never reduce perceived responsiveness.

The interface should always prioritize:

Smoothness.

Clarity.

Performance.

Whenever animation and responsiveness conflict,

responsiveness wins.

---

# 69. Accessibility Through Motion

Animations should assist orientation.

Never become obstacles.

Motion should remain subtle enough that users can comfortably perform repetitive work throughout the day.

Transitions should reduce cognitive effort.

Not increase it.

---

# Motion & Responsive Checklist

Every implementation must satisfy the following.

□ Reuses the shared motion language.

□ Introduces no custom easing curves.

□ Uses existing animation timing.

□ Uses shared hover behavior.

□ Uses shared page transitions.

□ Uses skeletons instead of blocking loaders.

□ Uses PageRail.

□ Preserves comfortable reading width.

□ Reflows layouts instead of compressing them.

□ Inherits shared breakpoints.

□ Preserves interaction consistency across themes.

□ Prioritizes performance over decorative animation.

Only after every item has been satisfied should motion and responsiveness be considered complete.

---

# Component System & Engineering Standards

This section defines how reusable components are designed, organized and evolved throughout IIL.

The objective of the component system is not simply code reuse.

Its objective is to preserve product identity while allowing the application to scale without accumulating inconsistent interfaces.

Every component should contribute toward a frontend that feels like one coherent system rather than a collection of independent pages.

---

# 70. Component Philosophy

Components represent reusable product concepts.

They do not represent pages.

A component should solve one reusable interface problem that can appear throughout the product.

Components should never be created simply because a page exists.

Instead, pages should emerge by composing reusable components together.

---

# 71. Components Describe Function

A component's name should communicate its responsibility.

Not its appearance.

Correct examples include:

• Panel

• Table

• Section

• Split View

• Timeline

• Dropdown

• Badge

• Empty State

Incorrect examples include:

• DashboardCard

• InboxCard

• ApprovalCard

• GoldPanel

• RoundedContainer

Names based on pages or appearance reduce long-term maintainability.

---

# 72. Component Hierarchy

Components exist in four architectural levels.

Foundation

↓

Layout

↓

Patterns

↓

Pages

Foundation Components provide primitive interactions.

Layout Components organize space.

Patterns combine multiple Layout Components into reusable workflows.

Pages compose Patterns into complete user experiences.

Responsibilities should never move downward unnecessarily.

---

# 73. Foundation Components

Foundation Components are intentionally generic.

Examples include:

• Button

• Input

• TextArea

• Dropdown

• Toggle

• Slider

• Avatar

• Icon

• Divider

Foundation Components should contain:

• Styling

• Accessibility

• Interaction

They should never contain:

• Business logic

• Page logic

• Product workflows

---

# 74. Layout Components

Layout Components establish reusable structure.

Examples include:

• Panel

• Section

• Table

• Grid

• Split View

• Scroll Region

• Toolbar

They define relationships between content.

They do not define the content itself.

---

# 75. Pattern Components

Patterns combine multiple reusable components into meaningful product workflows.

Examples include:

• Approval Review Surface

• Dashboard Summary

• Opportunity Group

• Mail Thread

• Settings Table

Patterns should never introduce new visual language.

They inherit existing components and arrange them to solve a recurring workflow.

---

# 76. Pages

Pages represent complete product workflows.

Examples include:

• Dashboard

• Inbox

• Actions

• Opportunities

• Approvals

• Settings

Pages should remain intentionally lightweight.

Their primary responsibility is orchestration.

Pages assemble Sections and Patterns.

They should avoid implementing reusable behavior.

---

# 77. Component Responsibilities

Every component should solve one clearly defined problem.

A component should not attempt to become an entire application.

For example,

a Panel owns:

• Surface

• Padding

• Elevation

• Border

A Panel should not own:

• Email approval logic

• AI state

• Business decisions

Responsibilities should remain narrowly defined.

---

# 78. Component Ownership

Each reusable behavior should have exactly one owner.

Examples include:

Buttons own button interaction.

Dropdowns own dropdown interaction.

Tables own table structure.

Panels own surface presentation.

Pages consume these behaviors.

They should never duplicate them.

Whenever duplicated behavior appears,

it should be extracted into the component responsible for that interaction.

---

# 79. Reuse Before Extension

Whenever a new interface requirement appears,

the following order should always be followed.

1.

Reuse an existing component.

2.

Extend an existing component.

3.

Compose multiple components.

4.

Create a new component.

New reusable components should be the final option.

Not the first.

---

# 80. Extension Philosophy

Existing components should evolve naturally.

Avoid creating nearly identical replacements.

Prefer:

Button

↓

Button (Primary)

↓

Button (Secondary)

↓

Button (Danger)

Instead of:

PrimaryButton

DangerButton

DeleteButton

PremiumButton

Every extension should preserve the original component's identity.

---

# 81. Component Variants

Variation should exist through configuration.

Not duplication.

Whenever multiple versions of the same interaction appear,

they should be represented through variants.

Variants may alter:

• Appearance

• Density

• Size

• Emphasis

Variants should never change the fundamental responsibility of the component.

---

# 82. Composition Philosophy

Large interfaces should emerge by composing smaller building blocks.

For example,

Approvals should not become one enormous component.

Instead,

Approval Page

↓

Approval Review Surface

↓

Panels

↓

Tables

↓

Buttons

↓

Dropdowns

Small building blocks improve:

• Testing

• Reusability

• Readability

• Scalability

---

# 83. Component Independence

Reusable components should remain independent of the page using them.

A Panel should not know whether it exists inside:

Dashboard

Approvals

Actions

Opportunities

Components should operate identically regardless of where they are used.

---

# 84. Styling Ownership

Components consume styling.

They do not define styling.

Visual properties should originate from the Design Token System.

Components should never introduce:

• Colors

• Shadows

• Radii

• Blur

• Motion

These belong to the shared design system.

---

# 85. State Ownership

Components manage only their own local interaction state.

Examples include:

• Hover

• Focus

• Expanded

• Collapsed

• Selected

Application state belongs to:

Shared Context

Backend

Global Providers

Components should never become miniature state managers.

---

# 86. Business Logic

Business logic should never exist inside reusable UI components.

Examples include:

Priority calculations.

AI reasoning.

Deadline classification.

Email processing.

Automation decisions.

These belong exclusively to the backend or shared application layer.

UI components display results.

They do not compute them.

---

# 87. Creating New Components

Before introducing a new reusable component,

answer the following questions.

Can an existing component solve this?

Can an existing component be extended?

Can multiple components be composed together?

Does this interaction appear in multiple places?

If the answer to these questions is "no",

a new reusable component may be created.

Otherwise,

reuse the existing system.

---

# 88. Deprecating Components

When components become obsolete,

they should be removed.

Avoid maintaining legacy components that are no longer referenced by the application.

Unused components increase maintenance cost and create confusion.

The codebase should evolve alongside the product.

Not preserve historical artifacts.

---

# 89. Folder Organization

Reusable components should be organized by responsibility.

Never by page.

Correct organization:

components/

Foundation

Layout

Patterns

Navigation

Feedback

Forms

Incorrect organization:

DashboardComponents

InboxComponents

ApprovalsComponents

Page ownership belongs to the Pages directory.

Shared systems belong to Components.

---

# 90. Naming Convention

Component names should remain concise.

Examples:

Panel

Table

Section

Dropdown

Badge

Timeline

Toolbar

EmptyState

Avoid prefixes that tie components to individual pages.

Good names survive product growth.

---

# 91. Engineering Rule

Whenever a future engineer creates a new component,

they should assume that another page will eventually need it.

This mindset naturally encourages:

Consistency.

Reusability.

Maintainability.

Component design should optimize for the product.

Not for the current sprint.

---

# Component Checklist

Every reusable component should satisfy the following.

□ Represents a reusable concept.

□ Solves one clearly defined problem.

□ Uses shared design tokens.

□ Uses shared motion language.

□ Contains no business logic.

□ Contains no page-specific assumptions.

□ Supports extension before duplication.

□ Can be composed with other components.

□ Uses semantic naming.

□ Is organized by responsibility.

□ Avoids unnecessary configuration.

□ Preserves consistency with the existing design system.

Only after satisfying every requirement should a component become part of the shared frontend library.

---

# State Management, Data Flow & Backend Integration

This section defines how information moves throughout IIL.

The frontend is responsible for presenting information.

The backend is responsible for understanding information.

This separation is fundamental to the architecture of IIL.

Business intelligence should never migrate into frontend code.

The frontend reflects the state of the system.

It does not become the system itself.

---

# 92. Single Source of Truth

Every piece of application state should exist in exactly one place.

Pages should never maintain independent copies of shared information.

The frontend should always observe a single authoritative state.

Whenever multiple pages display the same information,

they should all reference the same source.

Duplicated state inevitably produces inconsistent interfaces.

---

# 93. The Shared Brain

The shared application state acts as the frontend's central brain.

Every page communicates with it.

No page communicates directly with another page.

The shared brain is responsible for:

• Current application state

• Synchronization

• Cache ownership

• Cross-page updates

• Shared user preferences

Pages remain consumers of state.

Not distributors of it.

Implemented as three module-level stores in `lib/`, each exposed through
`useSyncExternalStore` (never React Context, never per-page `useState` for
anything shared) and each owning exactly one domain:

`mailStore` — every mail record, thread detail, draft, and Sent/Scheduled
outgoing message. THE single source every page's counts and rows derive
from.

`workflowStore` — Actions, Approvals and Opportunities records. Reads
`mailStore` in one direction only (never the reverse), so a workflow item is
still, underneath, the same mail every other page shows.

`settingsStore` — `AgentPreferences` (§103). `mailStore` subscribes to it, so
changing a preference re-derives mail state the same render cycle every
subscribed page re-renders in — no page has to know a preference changed.

No fourth store should appear for a concern one of these three already owns.

---

# 94. Information Flow

Every user interaction follows the same lifecycle.

User

↓

Interaction

↓

Current Page

↓

Shared Brain

↓

Backend

↓

Shared Brain

↓

Affected Pages

This architecture should remain consistent regardless of feature complexity.

---

# 95. Frontend Responsibilities

The frontend is responsible for:

• Presenting information

• Collecting user input

• Displaying AI output

• Triggering backend actions

• Managing local interaction state

The frontend should never become responsible for product intelligence.

---

# 96. Backend Responsibilities

The backend owns every intelligent decision.

Examples include:

• Opportunity detection

• Priority calculation

• AI prompting

• Automation logic

• Spam classification

• Email understanding

• Draft generation

• Deadline detection

• Reminder scheduling

• Weight calculations

• Goal interpretation

Whenever intelligence exists,

it belongs to the backend.

---

# 97. Local Component State

Components may maintain temporary UI state.

Examples include:

Expanded

Collapsed

Hovered

Focused

Open

Closed

Selected

Loading

These states exist only to improve interaction.

They should never become business state.

---

# 98. Global Application State

Global state contains information shared across multiple pages.

Examples include:

Authentication

Theme

Navigation

Connected account

Current workspace

User preferences

Automation settings

Priority configuration

Application notifications

Global state should remain centralized.

---

# 99. Server State

Server state originates from the backend.

Examples include:

Emails

AI summaries

Drafts

Approvals

Deadlines

Actions

Opportunities

Statistics

The frontend should never attempt to recreate server logic.

Instead,

it displays the latest available server state.

DRAFTS, IMPLEMENTED. This category is no longer aspirational: Drafts is the
eighth entry in the shared `MAIL_VIEWS` list, reached through the same
`/inbox/:view` route every other mail-management view (Starred, Snoozed,
Scheduled, Sent, Archive, Trash, Spam) uses — no separate navigation system,
no page-local draft array. One draft per thread, canonically stored in
`mailStore`; the Drafts page is a pure view over that state, with no count,
array or mutation of its own. Save, reopen, edit, discard, send and schedule
all flow through the same store the rest of the mailbox already uses, and
opening a draft opens the real conversation it belongs to through the same
`MailThreadView` every other page opens through — not a second, dedicated
draft-editing surface.

---

# 100. Optimistic Updates

Whenever appropriate,

the frontend may temporarily reflect an expected successful result before backend confirmation.

Examples include:

Approving a draft.

Archiving an email.

Marking a task complete.

If backend confirmation fails,

the interface should gracefully return to the previous state while explaining what occurred.

Optimistic updates should only be used when failure is uncommon and recovery is straightforward.

---

# 101. Loading Strategy

Loading should occur progressively.

The interface should reveal useful information as soon as it becomes available.

Avoid blocking the entire workspace while waiting for one request.

Independent sections should load independently whenever possible.

Users should always feel the application is progressing.

---

# 102. Error Recovery

Every backend interaction should define a recovery path.

Errors should never leave the interface in an ambiguous state.

Recovery options may include:

Retry

Edit

Undo

Refresh

Dismiss

The objective is preserving user trust.

Not hiding failure.

---

# 103. User Preferences

User preferences belong to persistent application state.

Examples include:

Automation level

Priority ordering

Inbox cleanup preferences

Reply tone

Advanced configuration

Preferences should automatically persist across sessions.

Pages should never individually manage preference storage.

---

# 104. Derived State

Whenever information can be derived,

it should not be stored separately.

Example:

If Pending Approval Count can be calculated from existing approvals,

store the approvals.

Calculate the count.

Do not maintain two independent values representing the same information.

Derived state reduces synchronization bugs.

THE CANONICAL EXAMPLE IN THIS CODEBASE: attention. Every mail carries two
independent axes — urgency and importance — never collapsed into one tier.
Coral/red means urgent; gold means important (Design Constitution §4); a
mail can be neither, either, or both at once. Each row stores `baseAttention`
(what the agent/model determined) and derives `attention` (baseAttention
with the user's Priority Weights applied) on every read — the same
store-the-input/derive-the-output shape as "store the approvals, calculate
the count" above, just with two axes instead of one. No page computes
attention itself; every page reads `row.attention` and the shared
`needsAttention`/`summarizeAttention` helpers, so "which mail needs
attention" can never drift between Dashboard's count and Inbox's dot.

---

# 105. Data Ownership

Every piece of data should have one owner.

Examples:

Theme

↓

Theme Provider

Authentication

↓

Authentication Provider

User Preferences

↓

Shared Brain

Emails

↓

Backend

AI Draft

↓

Backend

Panels and pages consume information.

They do not own it.

TEMPORARY OWNERSHIP, NAMED AS SUCH. Two record kinds in `mailStore` are
client-created before any backend exists to assign them a permanent
identity, and both say so explicitly rather than pretending the client's
value is final:

Draft id

↓

Client-issued (`local-` prefixed) until reconciled, then Backend

A `DraftRow.id` is provisional. `isProvisionalId()` names the question; the
collection's real key is `threadId`, which every lookup/mutation already
uses — so reconciliation is a field rewrite on one record, never a graph
update. The client does not assume the server echoes its id back.

Attachment

↓

`LocalAttachment` (this tab only) until uploaded, then `StoredAttachment`
(Backend)

A picked file lives as a `LocalAttachment`, holding a real `File` that
cannot survive a reload and is never persisted or faked into surviving one
(no base64, no object URL kept past its document). Upload is backend work
that has not been built; when it is, the same record's attachment becomes a
`StoredAttachment` — every consumer already accepts the `Attachment` union,
not one arm of it, so this is an in-place swap, not a redesign of the
composer, Drafts, or the mail store.

---

# 106. API Philosophy

The frontend should communicate with the backend using well-defined contracts.

Pages should never depend on backend implementation details.

Frontend code should remain stable even if backend implementation evolves.

Contracts should prioritize:

Clarity

Predictability

Versionability

---

# 107. Backend Trust

Whenever frontend and backend disagree,

the backend is considered authoritative.

The frontend should update itself accordingly.

Business logic should never be duplicated merely to verify backend behavior.

One implementation is preferable to two inconsistent implementations.

---

# 108. AI Integration

AI output should be treated as server-generated content.

The frontend should remain model-agnostic.

It should not know:

Which model generated the output.

Which prompt generated the output.

Which reasoning pipeline produced the response.

The frontend displays AI results.

It does not participate in AI reasoning.

---

# 109. Streaming

Where supported,

AI responses should stream naturally into the interface.

Streaming should preserve layout stability.

Avoid sudden interface jumps.

Reserve space whenever possible before streamed content appears.

---

# 110. Caching

Caching exists to improve perceived responsiveness.

Not correctness.

The backend remains the authoritative source of truth.

Cached data should automatically synchronize when fresher information becomes available.

---

# 111. Synchronization

Whenever application state changes,

every affected page should update automatically through the shared brain.

Examples include:

Approving an email.

↓

Approvals updates.

↓

Dashboard updates.

↓

Inbox updates.

↓

Actions update.

No page should manually notify another page.

Synchronization belongs exclusively to shared application state.

---

# 112. Offline Philosophy

Offline behavior should degrade gracefully.

Whenever backend functionality becomes unavailable,

the frontend should continue providing as much useful functionality as possible.

Unavailable features should clearly communicate their status without appearing broken.

---

# 113. Security Boundary

Sensitive operations should always occur on the backend.

Examples include:

Authentication validation

Permission checks

Email sending

AI prompting

Priority calculations

Automation execution

The frontend should never assume authority over protected operations.

THE INBOUND-HTML BOUNDARY. Received mail bodies are the one place untrusted,
attacker-authored content enters the frontend at all. `SanitizedHtml` is a
branded type — a plain `string` cannot satisfy it — so the only way HTML
reaches `dangerouslySetInnerHTML` (inside `MailBody`, the sole component that
ever calls it for inbound mail) is through `sanitizedHtmlFromBackend()`, a
single, greppable assertion made once, at the data boundary. Sanitization
itself — stripping scripts, event handlers, `javascript:` URLs, tracking
pixels — happens on the backend, not in this repo; the type exists to record
who is responsible, not to perform the work. No demo message currently
produces HTML (all are plain text), so the type is intentionally unused
today — it exists so a real provider payload has one obvious, already-decided
place to attach, rather than a component reaching for
`dangerouslySetInnerHTML` under deadline.

---

# 114. Engineering Principle

The frontend should answer one question exceptionally well:

"What should the user see right now?"

The backend should answer everything else.

Whenever uncertainty exists,

move intelligence toward the backend.

Keep presentation inside the frontend.

THE CURRENT BACKEND SIMULATION, AND ITS BOUNDARY. `mailStore.ts` and
`agentPreferences.ts` currently contain a simulation of backend-agent
behavior — classification, cleanup filing, priority weighting, deadline
escalation — run in the frontend against demo data, because no backend
exists yet to run it for real. This is allowed, and is explicitly temporary:
the block is fenced and labelled "DEMO BOOTSTRAP — THE REPLACEMENT POINT" in
`mailStore.ts`, the one place this gets deleted when a real backend arrives.
Nothing above that boundary — no page, no reusable component — computes an
agent decision; every renderer reads a result (`row.attention`, `row.status`,
`getThreadDetail(...).draftPreview`) the same way it will once a real backend
produces that result instead. Do not move this logic into components. Do not
treat its presence as license to add more of it than backend integration
will actually require.

---

# State Management Checklist

Every new feature should satisfy the following.

□ Uses the shared application state.

□ Introduces no duplicated global state.

□ Keeps business logic inside the backend.

□ Stores only necessary local interaction state.

□ Uses progressive loading.

□ Supports graceful error recovery.

□ Treats backend as the source of truth.

□ Synchronizes through the shared brain.

□ Avoids page-to-page communication.

□ Separates presentation from intelligence.

Only after satisfying every requirement should a new feature be considered architecturally complete.

---

# Project Organization, Code Standards & Developer Experience

This section defines how the IIL frontend codebase is organized.

A clean architecture is only sustainable if the codebase itself remains understandable.

The objective is that any engineer joining the project should be able to locate any responsibility within minutes.

Organization should optimize for long-term maintainability rather than short-term convenience.

---

# 115. Codebase Philosophy

The codebase should mirror the architecture of the product.

Folders should represent responsibilities.

Not implementation history.

Every directory should answer one question:

"What responsibility lives here?"

If that answer is unclear,

the organization should be reconsidered.

---

# 116. Project Structure

The frontend should remain organized around shared systems.

Recommended structure:

src/

↓

app

↓

components

↓

pages

↓

contexts

↓

hooks

↓

lib

↓

services

↓

types

↓

assets

↓

styles

↓

utils

↓

constants

↓

tokens

↓

animations

↓

providers

↓

router

Every directory should own one responsibility.

---

# 117. Pages Directory

The Pages directory owns complete product workflows.

Each page should contain only code required to assemble that experience.

Pages should avoid becoming implementation-heavy.

Examples:

Dashboard

Inbox

Actions

Approvals

Opportunities

Settings

Pages should import reusable systems.

Not create them.

---

# 118. Components Directory

Components exist to be shared.

The Components directory should never become page-specific.

Recommended organization:

components/

Foundation

Layout

Patterns

Navigation

Forms

Feedback

Data Display

Shared

The objective is discoverability.

Engineers should immediately know where reusable UI belongs.

---

# 119. Hooks

Hooks encapsulate reusable behavior.

Not reusable interfaces.

Examples include:

Keyboard shortcuts

Responsive utilities

Selection logic

Viewport observation

Animation helpers

Preference helpers

Hooks should never contain presentation.

They expose behavior.

Components consume that behavior.

---

# 120. Contexts

Contexts provide shared application state.

Each Context should own one domain.

Examples:

Theme

Authentication

Application State

Notifications

Contexts should remain focused.

Avoid creating one enormous global context.

---

# 121. Services

Services communicate with external systems.

Examples:

Backend APIs

Authentication providers

Analytics

Future integrations

Pages should communicate with services through shared abstractions.

Never directly.

---

# 122. Utilities

Utilities contain pure functions.

Utilities should:

Accept input.

Return output.

Produce no side effects.

Utilities should remain independent of React.

If React is required,

the logic probably belongs in a Hook instead.

---

# 123. Types

Shared TypeScript types belong in one centralized location.

Avoid redefining identical interfaces throughout the application.

Types should describe:

Backend contracts.

Application models.

Component interfaces.

Shared enums.

Centralized types reduce inconsistencies.

---

# 124. Constants

Repeated values that represent business meaning should become constants.

Examples include:

Route names.

Feature flags.

Supported reply tones.

Automation modes.

Priority categories.

Constants improve readability while reducing duplicated literals.

---

# 125. Assets

Assets should remain organized.

Examples:

Icons

Illustrations

Brand assets

Logos

Images

Avoid scattering assets throughout unrelated folders.

---

# 126. Naming Philosophy

Names should communicate responsibility immediately.

A reader should understand what something does before opening the file.

Prefer:

ApprovalReview

OpportunityGroup

SectionHeader

NotificationProvider

Avoid:

Helper

Manager

Misc

Utils2

Temp

ComponentFinal

Meaningful names reduce documentation requirements.

---

# 127. File Naming

Files should follow consistent conventions.

Components:

PascalCase

Hooks:

camelCase beginning with "use"

Utilities:

camelCase

Contexts:

PascalCase

Pages:

PascalCase

Constants:

camelCase or UPPER_CASE where appropriate

Consistency improves navigation.

---

# 128. Imports

Imports should flow consistently.

Preferred order:

External Libraries

↓

Shared Providers

↓

Contexts

↓

Hooks

↓

Services

↓

Components

↓

Utilities

↓

Types

↓

Styles

Keeping imports predictable improves readability.

---

# 129. File Size Philosophy

Large files are not automatically bad.

However,

large files containing multiple unrelated responsibilities should be divided.

Prefer splitting by responsibility.

Not arbitrary line count.

A file should remain understandable from beginning to end.

---

# 130. Comments

Code should explain itself whenever possible.

Comments should explain:

Why

Not:

What

Avoid comments describing obvious implementation.

Prefer documenting architectural reasoning.

Good comments survive refactoring.

---

# 131. Documentation

Every shared system should contain documentation explaining:

Purpose.

Responsibilities.

Public API.

Limitations.

Future engineers should understand how to use a system without reading its implementation first.

---

# 132. Dead Code

Unused code should not remain in the repository.

Examples include:

Unused components.

Unused hooks.

Unused helpers.

Unused utilities.

Historical implementations should remain in version control.

Not inside production code.

---

# 133. Refactoring Philosophy

Refactoring should improve:

Clarity.

Maintainability.

Consistency.

It should not alter product behavior.

Whenever a refactor changes behavior,

it should be treated as a feature,

not maintenance.

---

# 134. Feature Development

Every new feature should follow the same implementation sequence.

Understand the Design Constitution.

↓

Read the Engineering Constitution.

↓

Reuse existing architecture.

↓

Reuse existing components.

↓

Implement.

↓

Verify responsiveness.

↓

Verify accessibility.

↓

Review against engineering checklist.

This sequence should become standard practice.

---

# 135. Code Review Philosophy

Every review should evaluate:

Architecture.

Consistency.

Maintainability.

Accessibility.

Performance.

User experience.

Not simply whether the code compiles.

A technically correct implementation may still violate the product's engineering philosophy.

---

# 136. Engineering Checklist

Before merging any feature, verify:

□ Folder placement follows architecture.

□ Naming is semantic.

□ Existing systems are reused.

□ New components are justified.

□ No duplicated logic exists.

□ Shared types are reused.

□ No dead code introduced.

□ Imports follow project conventions.

□ Documentation updated where necessary.

□ Code remains understandable without explanation.

Only after every requirement has been satisfied should implementation be considered complete.

---

# Performance, Accessibility & Claude Code Implementation Standards

This section defines the engineering standards that every implementation must satisfy before it can be considered production-ready.

A feature is not complete because it looks correct.

It is complete when it is:

• Fast

• Accessible

• Maintainable

• Consistent

• Predictable

The purpose of this section is to establish those standards.

---

# 137. Performance Philosophy

Performance is a feature.

Users should never perceive the application as slow because of frontend implementation.

The frontend should prioritize:

Immediate interaction.

Smooth navigation.

Predictable rendering.

Low cognitive friction.

Every engineering decision should consider performance from the beginning rather than treating it as a later optimization task.

---

# 138. Perceived Performance

Perceived performance is more important than raw benchmark numbers.

Users judge responsiveness by how quickly the interface acknowledges their actions.

Prefer:

Immediate visual feedback.

Skeleton loading.

Reserved layout.

Progressive rendering.

Avoid:

Blank screens.

Blocking overlays.

Unexpected layout shifts.

The interface should always appear alive.

---

# 139. Rendering Philosophy

Render only what is necessary.

Avoid unnecessary rerenders.

Shared state should update only the interfaces that genuinely depend upon it.

Changes affecting one workflow should not cause unrelated sections of the application to rerender.

Rendering work should remain proportional to user interaction.

---

# 140. Component Stability

Reusable components should behave predictably.

Inputs should produce consistent outputs.

Avoid unnecessary remounting.

Preserve component state whenever appropriate.

Stable interfaces feel faster than technically identical interfaces that constantly recreate themselves.

---

# 141. Lazy Loading

Load functionality when it becomes necessary.

Examples include:

Future feature modules.

Large visualizations.

Rarely used dialogs.

Settings subsections.

Avoid delaying critical interface elements.

Users should never wait for the primary workflow to become available.

Landing is route-level `React.lazy` (`App.tsx`) — the only consumer of
Three.js/`@react-three/fiber` in the app (its starfield), split into its own
chunk so every authenticated workspace route stops downloading a 3D renderer
it never mounts. A `Suspense` boundary with a `null` fallback wraps it;
Landing's own visual implementation and behavior are unaffected. This is the
pattern for any future large, single-route dependency — not something to
repeat for every route by default.

---

# 142. Asset Optimization

Every asset should justify its existence.

Images.

Icons.

Illustrations.

Fonts.

Animations.

Avoid unnecessary asset duplication.

Whenever assets are shared,

they should exist once.

Compression should preserve perceived quality.

---

# 143. Animation Performance

Animations should rely on performant properties whenever possible.

Avoid animations that trigger expensive layout recalculations unnecessarily.

Motion should remain smooth across:

Small laptops.

Large laptops.

Desktop monitors.

High refresh rate displays.

Performance always has higher priority than decorative animation.

---

# 144. Accessibility Philosophy

Accessibility is part of product quality.

Not an optional enhancement.

Every user should receive the same product,

regardless of:

Input method.

Motor ability.

Vision.

Device.

Accessibility should be integrated during implementation.

Not added afterward.

---

# 145. Keyboard Navigation

Every interactive element should remain fully usable through keyboard interaction.

Users should be able to:

Navigate.

Select.

Expand.

Collapse.

Approve.

Reject.

Submit.

Without requiring a pointing device.

Keyboard users should receive the same level of polish as mouse users.

---

# 146. Focus Management

Focus should always remain visible.

After every interaction,

the user should immediately understand where keyboard focus currently exists.

Focus should never disappear unexpectedly.

When dialogs close,

focus should return naturally to the originating interface.

Focus order should always follow logical reading order.

---

# 147. Semantic HTML

HTML should communicate meaning before appearance.

Choose elements based on their semantic purpose.

Not their default styling.

Correct document structure improves:

Accessibility.

Maintainability.

Searchability.

Developer understanding.

Styling should never dictate semantic choice.

`PageSection`'s heading renders as a real `<h2>` with `aria-labelledby`
wiring its `<section>` to it — not the styled `<div>` it used to be. Every
section on every page is a named landmark a screen reader can navigate by;
`PageHeader`'s single `<h1>` is no longer the only heading in the document
outline. Purely additive: font, spacing, alignment and color are unchanged.

---

# 148. ARIA Philosophy

ARIA should supplement semantic HTML.

Never replace it.

Native HTML behavior should remain the first choice.

Additional accessibility metadata should only be introduced when semantic HTML alone cannot adequately describe the interaction.

---

# 149. Contrast

Readable interfaces create trust.

Every theme should preserve sufficient contrast between:

Background.

Surface.

Text.

Borders.

Interactive controls.

Hover states.

The design system should guarantee contrast.

Individual pages should never attempt to solve it independently.

---

# 150. Motion Accessibility

Animations should support understanding.

Not overwhelm users.

Motion should remain:

Subtle.

Purposeful.

Predictable.

Users preferring reduced motion should continue receiving a fully functional interface.

Only the amount of animation changes.

The interaction model remains identical.

---

# 151. Error Accessibility

Errors should be communicated through more than color.

Users should understand failure through:

Language.

Structure.

Visual hierarchy.

Supporting indicators.

Never rely exclusively on red text or icons.

---

# 152. Form Accessibility

Every form control should clearly communicate:

Purpose.

Current value.

Validation state.

Required actions.

Labels should remain permanently understandable.

Placeholder text should never become the only source of explanation.

---

# 153. Engineering Review

Before implementation is considered complete,

verify the following:

Architecture.

Responsiveness.

Accessibility.

Performance.

Motion.

Consistency.

Maintainability.

Every feature should satisfy all engineering standards simultaneously.

---

# 154. Claude Code Philosophy

Claude Code is an implementation tool.

Not a design tool.

Its responsibility is to reproduce IIL faithfully.

It should extend existing systems.

Not reinterpret them.

Creativity belongs during product design.

Engineering belongs during implementation.

---

# 155. Design Authority

The following documents define the product.

1.

Design Constitution.

2.

Frontend Architecture & Engineering Constitution.

3.

Existing Landing Page implementation.

Claude Code should treat these as authoritative.

Whenever uncertainty exists,

existing implementation has higher priority than inference.

---

# 156. Reference Implementation

The Landing Page is the canonical implementation of:

Motion.

Spacing.

Atmosphere.

Lighting.

Typography.

Responsive behavior.

Hover language.

Animation vocabulary.

Workspace pages inherit these systems.

They should never create competing implementations.

---

# 157. Engineering Responsibilities

Claude Code should:

Reuse.

Extend.

Compose.

Refactor.

Document.

It should avoid:

Inventing.

Guessing.

Reinterpreting.

Duplicating.

Every engineering decision should strengthen the existing design system rather than fragment it.

---

# 158. Implementation Rules

When implementing a feature,

Claude Code should never invent:

Colors.

Spacing.

Breakpoints.

Animation timing.

Shadows.

Blur values.

Typography hierarchy.

Hover behavior.

Responsive philosophy.

If an implementation already exists,

reuse it.

If it does not exist,

extend the shared system.

Never create isolated solutions.

---

# 159. Standard Feature Workflow

Every implementation should follow this sequence.

Read the Design Constitution.

↓

Read the Engineering Constitution.

↓

Identify existing architecture.

↓

Identify reusable components.

↓

Identify reusable tokens.

↓

Implement the feature.

↓

Verify responsiveness.

↓

Verify accessibility.

↓

Verify engineering checklist.

↓

Review consistency against the Landing Page.

Only after all stages are complete should implementation be considered ready.

---

# 160. Final Engineering Principle

The frontend should evolve exactly the same way the product evolves.

One shared system.

One shared visual language.

One shared interaction language.

One shared engineering philosophy.

Future growth should strengthen the existing foundation.

Never compete with it.

Every new feature should make the product feel more unified than before.

Not more complicated.

---

# Final Engineering Checklist

Every production-ready implementation must satisfy the following.

## Architecture

□ Uses AppShell.

□ Uses the shared Page Template.

□ Uses PageRail.

□ Uses the shared Brain.

---

## Design System

□ Uses shared tokens.

□ Uses shared typography.

□ Uses shared motion.

□ Uses shared spacing.

□ Uses shared atmosphere.

---

## Components

□ Reuses existing components.

□ Avoids duplication.

□ Uses semantic naming.

□ Contains no business logic.

---

## State

□ Uses shared application state.

□ Keeps intelligence in the backend.

□ Avoids duplicated state.

---

## Responsiveness

□ Preserves reading width.

□ Uses existing breakpoints.

□ Reflows layouts correctly.

□ Preserves interaction consistency.

---

## Accessibility

□ Keyboard accessible.

□ Proper focus management.

□ Semantic HTML.

□ Sufficient contrast.

□ Reduced motion support.

---

## Performance

□ Efficient rendering.

□ Progressive loading.

□ Stable layout.

□ No unnecessary assets.

---

## Code Quality

□ Architecture respected.

□ Documentation updated.

□ No dead code.

□ No hardcoded design values.

□ No page-specific engineering shortcuts.

---

An implementation that satisfies every requirement above should be considered consistent with the engineering philosophy of IIL and suitable for production.

---

# APPENDIX A

# Frontend Implementation Playbook

This appendix defines the standard engineering workflow for implementing any new feature inside IIL.

Unlike the previous sections, which describe architecture and engineering philosophy, this appendix describes the practical sequence every engineer (human or AI) should follow.

Following the same implementation process ensures that every contribution strengthens the design system rather than gradually fragmenting it.

---

# A.1 Before Writing Any Code

Before implementation begins, the engineer should understand the product before understanding the feature.

Always review the following documents in order.

1.

Design Constitution

↓

2.

Frontend Architecture & Engineering Constitution

↓

3.

Reference Implementation (Landing Page + AppShell)

↓

4.

Feature Specification

↓

5.

Backend Contract (if available)

Only after understanding the existing system should implementation begin.

---

# A.2 Understand the Feature

Before creating files,

answer the following questions.

What problem is the feature solving?

Which existing page owns the workflow?

Which reusable components already exist?

Which backend data does it require?

Which parts of the shared system should it inherit?

Implementation should begin only after these questions have clear answers.

---

# A.3 Search Before Creating

Before creating anything new,

search the project.

Look for:

Existing components.

Existing hooks.

Existing utilities.

Existing animations.

Existing tokens.

Existing patterns.

If an appropriate implementation already exists,

reuse it.

Avoid assuming a new solution is required.

---

# A.4 Build from the Top Down

Implementation should follow the architectural hierarchy.

Never begin by creating isolated components.

Instead:

Page

↓

Sections

↓

Patterns

↓

Layout Components

↓

Foundation Components

Only create new layers when existing ones genuinely cannot express the required interaction.

---

# A.5 Extend Before Duplicating

When a reusable system almost satisfies the new requirement,

extend it.

Do not duplicate it.

Avoid implementations such as:

Panel2

PanelNew

PanelV2

InboxPanel

ApprovalPanel

Instead,

strengthen the original implementation.

Future features should benefit from today's improvements.

---

# A.6 Respect the Shared Design System

Every implementation should consume:

Shared colors.

Shared spacing.

Shared typography.

Shared motion.

Shared shadows.

Shared blur.

Shared responsive behavior.

No feature should redefine these systems locally.

---

# A.7 Keep Intelligence in the Backend

Whenever implementation requires:

Classification.

Ranking.

AI reasoning.

Priority calculation.

Automation.

Filtering logic.

Workflow intelligence.

The frontend should request the result.

Not recreate the reasoning.

The frontend presents intelligence.

It does not generate it.

---

# A.8 Compose Small Systems

Prefer many small reusable systems over one large implementation.

Example:

Approval Page

↓

Review Surface

↓

Panel

↓

Table

↓

Buttons

↓

Dropdown

Rather than one enormous ApprovalComponent.

Composition improves reuse.

---

# A.9 Verify Responsiveness

After implementation,

verify behavior on:

Small laptop.

Large laptop.

Desktop monitor.

Ultrawide monitor.

Responsiveness should preserve:

Comfort.

Hierarchy.

Readability.

Never simply occupy additional space.

---

# A.10 Verify Motion

Every interaction should inherit the shared motion language.

Verify:

Hover.

Focus.

Selection.

Dropdown.

Transitions.

Loading.

Animation should feel identical to the Landing Page.

---

# A.11 Verify Accessibility

Confirm:

Keyboard navigation.

Focus visibility.

Semantic HTML.

Contrast.

Reduced motion.

Screen reader compatibility where appropriate.

Accessibility is verified before merging.

Not after deployment.

---

# A.12 Verify Architecture

Ask:

Did this feature strengthen the existing architecture?

Or did it bypass it?

If bypassing occurred,

the implementation should be reconsidered.

---

# A.13 Final Review

Before merging,

review the implementation against:

Design Constitution.

↓

Engineering Constitution.

↓

Landing Page.

↓

AppShell.

↓

Feature Specification.

The objective is not simply correctness.

The objective is consistency.

---

# APPENDIX B

# Claude Code Operational Guide

This appendix defines how Claude Code should approach every engineering task inside IIL.

These rules intentionally prioritize consistency over interpretation.

Claude Code should behave as an engineer extending an existing system.

Not as a designer creating a new one.

---

# B.1 Primary Objective

Claude Code's responsibility is:

Faithful implementation.

Not creative interpretation.

Whenever uncertainty exists,

prefer existing implementation over inference.

---

# B.2 Priority Order

When multiple sources provide guidance,

use the following priority.

1.

Existing implementation.

(Landing Page, AppShell, Workspace)

↓

2.

Engineering Constitution.

↓

3.

Design Constitution.

↓

4.

Feature Specification.

↓

5.

General engineering best practices.

Never reverse this order.

---

# B.3 Never Invent

Claude Code should never invent:

Spacing.

Motion.

Typography.

Breakpoints.

Hover behavior.

Elevation.

Shadows.

Blur.

Theme behavior.

Layout philosophy.

If the implementation already exists,

reuse it.

---

# B.4 Always Search First

Before creating:

Component.

Hook.

Utility.

Pattern.

Animation.

Layout.

Search the existing codebase.

Reuse whenever possible.

---

# B.5 Preserve the Design Language

Every implementation should visually belong to IIL.

A new page should feel as though it has always existed within the product.

Users should never perceive different implementation styles.

---

# B.6 Respect Component Ownership

Never move responsibilities between architectural layers unnecessarily.

Pages assemble.

Patterns organize.

Components present.

Hooks encapsulate behavior.

Contexts manage shared state.

Backend performs intelligence.

Maintain these boundaries.

---

# B.7 Respect Existing Motion

Motion should be inherited.

Not recreated.

Whenever animation is required,

search for an existing implementation before creating a new one.

---

# B.8 Respect Existing Responsiveness

Responsiveness should be inherited from:

Page Template.

PageRail.

Shared workspace layout.

Do not create independent responsive systems for individual pages.

---

# B.9 Avoid Technical Debt

Never leave behind:

Duplicate components.

Unused utilities.

Unused hooks.

Temporary implementations.

Commented production code.

Legacy replacements.

The repository should remain clean after every implementation.

---

# B.10 Improve the System

Whenever an improvement benefits multiple pages,

implement it once.

Do not repeat identical fixes across the application.

Strengthen the shared system.

Not individual pages.

---

# B.11 Implementation Success Criteria

A task is complete only when:

The feature works.

The architecture remains consistent.

The design system remains consistent.

Accessibility is preserved.

Performance is preserved.

The codebase is cleaner than before implementation.

---

# Closing Statement

The purpose of this Engineering Constitution is not merely to standardize code.

Its purpose is to preserve the identity of IIL as the product grows.

Every engineer contributing to the project inherits the responsibility of strengthening that identity rather than diluting it.

Good engineering should make future development easier than present development.

Every implementation should leave the frontend more unified, more understandable and more maintainable than it was before.

If this document is consistently followed, IIL should continue feeling like one carefully engineered product regardless of how many features, pages or contributors it gains over time.