# Frontend Implementation Playbook

Version: 1.0

---

# Purpose

This document defines the implementation philosophy for IIL.

The Design Constitution defines the vision.

The Frontend Engineering Constitution defines the engineering standards.

The Frontend Implementation Reference defines the implementation details.

This Playbook defines **how those documents should be interpreted during implementation.**

Its purpose is to ensure every implementation strengthens the existing product instead of merely reproducing screenshots.

---

# Implementation Hierarchy

Whenever multiple sources appear to disagree, implementation should always follow this order.

1. Existing Landing Page implementation
2. Design Constitution
3. Frontend Engineering Constitution
4. Frontend Implementation Reference
5. Claude Design handoff
6. Existing Sprint implementation

The Landing Page is the primary implementation reference.

Claude Design mockups are visual communication tools.

They are not engineering specifications.

---

# Primary Objective

The objective is **not** to reproduce screenshots.

The objective is to build a frontend that feels like a natural continuation of the Landing Page.

Every new page should appear as though it has always belonged to the product.

---

# Build Systems, Not Screens

Never recreate layouts from screenshots.

Instead, identify the underlying systems responsible for those layouts.

Examples include:

- PageRail
- AppShell
- Atmosphere
- Motion
- Typography
- Spacing
- Shared Surfaces
- Navigation

Always reuse the existing system before introducing a new implementation.

---

# Landing Page Is Canonical

Whenever uncertainty exists, inspect the Landing Page implementation.

The Landing Page defines:

- Motion
- Responsiveness
- Visual rhythm
- Typography
- Atmosphere
- Spacing
- Premium feel
- Interaction language

Workspace pages inherit these qualities.

They do not redefine them.

---

# Claude Design Is Intent

The Claude Design mockups communicate:

- Layout
- Information hierarchy
- Workflow
- User experience

They do **not** define:

- Exact spacing
- Motion
- Responsive behavior
- Component implementation
- Animation
- Engineering structure

Those come from the Landing Page.

---

# Never Copy Mock Data

Names, emails, companies, dates, messages and text shown inside design mockups are illustrative only.

They should never appear inside the product.

Generate realistic placeholder data based on the application's domain model.

Treat design content as examples, not application data.

---

# Extend Before Rebuilding

Before creating a new implementation, ask:

Can Landing already do this?

Can AppShell already do this?

Can an existing component be extended?

Can an existing pattern be reused?

Only create something new when the existing system genuinely cannot express the required behavior.

---

# Reuse Good Systems, Replace Bad Ones

Do not preserve a component simply because it already exists.

Reuse components that already align with the Landing design language.

Replace legacy implementations that conflict with the current design system.

Strengthen the shared system instead of patching outdated implementations.

---

# Motion Is Product Language

Motion is a core part of the product identity.

Every page should inherit the same motion philosophy as the Landing Page.

Examples include:

- Smooth page transitions
- Shared spring animations
- Hover refinement
- Layout animations
- Expanding panels
- Simultaneous movement of surrounding content

Motion should feel calm, deliberate and premium.

Never static.

---

# Responsiveness Is Recomposition

Responsiveness is not shrinking layouts.

It is intelligently reorganizing layouts while preserving hierarchy.

As screen size changes:

- Sections may stack.
- Columns may collapse.
- Spacing may adapt.

The experience should remain equally premium on every screen size.

---

# Preserve Shared Rhythm

Never invent spacing.

Never invent typography.

Never invent visual hierarchy.

Always inherit the rhythm established by the Landing Page.

Whitespace is part of the design language.

---

# Build One Foundation First

Implementation should follow this order.

1. Shared workspace foundation
2. Shared components
3. Dashboard
4. Inbox
5. Actions
6. Opportunities
7. Approvals
8. Settings

Do not build multiple pages before validating the foundation.

---

# Validate Every Page

Before moving to the next page, verify:

- Feels like a continuation of the Landing Page.
- Reuses existing systems.
- Motion matches the Landing language.
- Responsive behavior matches the Landing philosophy.
- Dark and Light themes feel equally polished.
- No copied mockup content exists.
- No new visual language has been introduced.
- Shared components have been reused wherever possible.

Only after all checks pass should implementation continue.

---

# Creativity During Implementation

Creativity is encouraged only when extending the existing design language.

If an interaction is unspecified:

- Study similar Landing interactions.
- Extend that behavior naturally.
- Do not invent unrelated interaction styles.

The goal is consistency, not novelty.

---

# Engineering Mindset

When implementing a page, think in this order:

Product

↓

Systems

↓

Components

↓

Layout

↓

Content

Never reverse this order.

The product is built from systems.

Not from screenshots.

---

# Definition of Success

Sprint 1 is complete only when:

- Every page feels like part of the same product.
- The Landing Page and Workspace feel seamlessly connected.
- Shared systems are strengthened.
- Legacy implementations are eliminated.
- The implementation follows the Design Constitution, Frontend Engineering Constitution and Frontend Implementation Reference without introducing competing ideas.

The objective is not to recreate designs.

The objective is to engineer a coherent product.