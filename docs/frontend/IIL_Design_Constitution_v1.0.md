# IIL (Inbox Intelligence Layer)
# Frontend Design Constitution
# Sprint 1 (Locked)

---

# 1. Product Philosophy

IIL is not an email client.

It is an AI assistant that quietly reduces work.

Every design decision should reduce user effort, not increase interaction.

The product should feel:

- Calm
- Premium
- Intelligent
- Predictable
- Invisible

The user should leave the product faster than they entered it.

Never design for engagement.
Design for completion.

---

# 2. Overall Visual Identity

Minimal.

Atmospheric.

Premium.

Never flashy.

The interface should feel like expensive industrial equipment, not social media.

Use restraint instead of decoration.

Whitespace is intentional.

Motion is subtle.

Gold is meaningful.

---

# 3. Color Philosophy

Dark Mode

Near-black canvas.

Soft elevated surfaces.

No harsh contrast.

Light Mode

Warm off-white (#f7f5f0)

Never pure white.

Warm shadows.

Warm neutrals.

Both themes must feel like the same room under different lighting.

---

# 4. Gold Usage Rules

Gold is reserved.

Gold is never decorative.

Gold communicates importance.

Importance is one of two independent attention axes, not the only one.

The other is urgency — carried by coral/red, never gold.

A mail can be urgent, important, both, or neither; the two never merge into
one tier. Gold answers "does this matter more than most mail," and never
answers "is this due soon" — that question is coral's alone. See the
Engineering Constitution's attention model for the full mechanics.

Allowed:

- Brand identity
- Important page titles
- Primary intelligence
- Important metrics
- Critical insights

Never use gold:

- Tables
- Settings
- Dropdowns
- Buttons
- Navigation
- Decorative borders
- Cards

If everything is gold,

nothing is.

---

# 5. Typography

Large headlines.

Comfortable spacing.

Readable hierarchy.

No oversized paragraphs.

No walls of text.

Section titles should explain purpose.

Labels should use normal human language.

Avoid technical wording.

---

# 6. Motion Philosophy

Motion should reassure.

Not entertain.

Animations should communicate:

- continuity
- completion
- state change

Never animate simply because something can move.

No bouncy interactions.

No playful motion.

Everything eases naturally.

---

# 7. Shared Layout

Every application page shares the same shell.

Top Navigation

Left Sidebar

Content Surface

Same spacing.

Same margins.

Same visual rhythm.

The application should feel like one continuous workspace.

---

# 8. Navigation

Top Navigation

Contains:

- Logo
- Product name
- Theme switch
- Profile

DEFERRED — V1.1: the interactive profile menu (Connected Gmail / Theme /
Account) described here has not shipped. V1.0 renders the identity avatar as
a static element. This is a scoped, intentional deferral, not an oversight —
build it against a real account surface when one exists, rather than faking
one now.

Sidebar contains navigation, plus the user's own Quick Access shortcuts.

Quick Access is a deliberate V1.0 feature, not a violation of "navigation
only": every mail-management view (Starred, Snoozed, Drafts, Scheduled,
Sent, Archive, Trash, Spam) can be pinned into the sidebar or left in an
"Available" list, from Settings. Pinned order is user-controlled and is the
order the sidebar renders in. This is navigation the user has configured —
still orientation, never a widget, search box or setting rendered in place.

No branding.

No duplicated controls.

Active page uses floating pill indicator.

---

# 9. Tables

Tables are the primary interaction component.

Tables receive borders.

Dropdowns do not.

Rows separate information.

Inputs should feel embedded into the table.

Avoid boxed interfaces whenever possible.

---

# 10. Forms

Prefer:

Dropdowns

Tables

Simple toggles

Sliders

Avoid:

Checkbox grids

Large forms

Multiple nested cards

Overwhelming configuration pages

---

# 11. Copywriting

Use human language.

Examples:

How I Help

Inbox Cleanup

Settings

Avoid:

Automation Settings

Noise Processing

Rule Engine

Configuration

Every sentence should sound like the assistant explaining itself.

---

# 12. Information Density

Compact.

Never cramped.

Never sparse.

Each section should feel self-contained.

Whitespace separates thoughts.

Not decorations.

---

# 13. Intelligence First

Show conclusions.

Hide computation.

The interface should surface:

What matters.

Not why fifty algorithms decided it.

---

# 14. Dashboard Philosophy

The dashboard is a briefing.

Not analytics.

The user should understand their day in seconds.

---

# 15. Inbox Philosophy

Inbox is for awareness.

Not work.

Reading happens here.

Working happens elsewhere.

---

# 16. Actions Philosophy

Actions exist to complete work.

No unnecessary context.

Focus on execution.

---

# 17. Opportunities Philosophy

Opportunities surface possible value.

Nothing urgent.

Nothing demanding.

The assistant suggests.

The user decides.

---

# 18. Approvals Philosophy

Approvals are the trust surface.

Everything here has already been reviewed.

The user only makes the final decision.

The review surface is intentionally distraction-free.

The document is the focus.

No banners.

No celebration.

Approval quietly promotes the next item.

---

# 19. Settings Philosophy

The page is called Settings — plain human language, not "Configuration" or
"Automation Settings" (§11). The word "Tuning" appeared in early planning and
never shipped; Settings is the V1.0 name and is not scheduled to change.

Settings teaches IIL how to behave.

Not how to configure software.

The page should feel like teaching an assistant.

Not filling enterprise forms.

---

# 20. Settings Structure

Order (locked, V1.0):

1.
How I Behaves Today

Short permanent orientation.

2.
How I Help

Table.

Rows:

Reply Drafting

Archiving

Labeling

Follow-ups

Reply Tone

Default:

Draft for approval

Neutral tone

3.
Quick Access

Table.

Two columns: which mail views (Starred, Snoozed, Drafts, Scheduled, Sent,
Archive, Trash, Spam) are pinned into the sidebar, and which are Available.
Same left/right-arrow transfer affordance as Priorities below — deliberately
the one shared interaction pattern, not two.

Order within the pinned column is user-controlled and is the order the
sidebar renders in.

Default:

Starred and Sent pinned. Everything else Available.

This section is navigation configuration, not automation — it does not
affect what IIL does with mail, only how the user reaches it. Placed here,
between How I Help and Inbox Cleanup, because it is still a "how I want this
to work" preference and Settings is where every such preference lives.

4.
Inbox Cleanup

Table.

Categories include:

Promotions

Newsletters

Marketing

Banking

etc.

Dropdown values:

Keep

Archive

Spam

Delete

Default:

Keep

5.
Priorities

Two-column layout.

Left:

High Priority

Right:

Lower Priority

Categories move between columns.

Never numeric.

No drag-and-drop.

Simple directional arrow affordance.

Default:

All categories equal.

Placed after Inbox Cleanup, not before it — a deliberate V1.0 ordering
decision, kept intentionally rather than reshuffled to match an earlier
draft of this structure. Both remain automation-adjacent preferences shown
before Advanced; their relative order does not change what either section
does.

6.
Advanced

Collapsed by default.

Contains:

Priority Weight sliders

Beta Features toggle

Reset to defaults

Delete Account

Advanced settings remain visually quieter than every section above.

---

# 21. Priority System

Normal users think in categories.

Power users think in weights.

Normal UI:

High Priority

Lower Priority

Backend:

Maps categories to numeric weights.

Advanced exposes actual weight sliders.

Default weight:

5

for every category.

---

# 22. Defaults

Automation

Draft for approval.

Reply Tone

Neutral.

Inbox Cleanup

Keep.

Quick Access

Starred and Sent pinned.

Priority Weights

5.

Priority Categories

Equal importance.

Beta Features

Off.

Advanced

Collapsed.

---

# 23. Destructive Actions

Delete Account

Placed last.

Visually quiet.

Never highlighted.

Reset to defaults

Visible.

Not prominent.

Requires confirmation.

Delete Account requires explicit confirmation flow.

---

# 24. Light Mode Rule

Never redesign.

Only invert.

Hierarchy

Spacing

Layout

Typography

Motion

remain identical.

Dark and Light should feel like identical products under different lighting.

---

# 25. Consistency Rule

Whenever introducing a new page ask:

Does this feel like it belongs inside IIL?

Not:

Does this page look nice?

Consistency beats originality.

Always.

---

# 26. Implementation Rule

If implementation forces compromise:

1. Preserve interaction.

2. Preserve hierarchy.

3. Preserve spacing.

Only then sacrifice visuals.

Never sacrifice clarity for prettier UI.

---

# 27. Ultimate Goal

Users should eventually trust IIL enough that interacting with it becomes almost invisible.

The highest compliment is not:

"This UI is beautiful."

It is:

"I forgot I was using an email client."