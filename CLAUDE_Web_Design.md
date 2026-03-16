# CLAUDE.md — Web Design + Frontend Execution Rules

This file defines the non-negotiable standards for designing and building frontend experiences for this project.
Use it as the first source of truth before generating layouts, UI systems, components, screenshots, or production-facing frontend code.

---

# 1. Purpose

The goal is to ensure every frontend deliverable is:

- visually intentional
- brand-consistent
- reference-accurate when a mockup is provided
- robust enough for real product implementation
- easy to audit, refine, and extend

This file should guide:

- landing pages
- dashboards
- investor portals
- borrower portals
- admin tools
- reusable components
- prototypes and high-fidelity static mockups

---

# 2. Always Do First

- Invoke the **frontend-design** skill before writing any frontend code in a new session.
- Read this `CLAUDE.md` file before making layout or styling decisions.
- Review the project’s existing structure before creating new files, sections, or components.
- Check whether the task is:
  - reference matching
  - brand extension
  - greenfield design
  - UI refinement
  - responsive implementation
- If a reference image exists, match the reference first before improving anything.
- If no reference exists, design from first principles using the standards below.

---

# 3. Design Modes

## A. Reference Match Mode
Use when a screenshot, Figma export, or mockup is provided.

Rules:
- Match layout, spacing, hierarchy, proportions, typography scale, and color relationships as closely as possible.
- Do not invent extra sections, cards, buttons, badges, or decorative graphics not present in the reference.
- Do not “improve” the design unless explicitly requested.
- Reproduce the visual rhythm before optimizing implementation details.
- After building, screenshot the result and compare carefully against the reference.

## B. Brand Extension Mode
Use when there is no fixed reference, but an existing product or site style should be extended.

Rules:
- Reuse existing color logic, spacing rhythm, radius system, and card language.
- Match the tone of the platform: institutional, premium, modern, minimal, or technical as appropriate.
- Do not create disconnected visual styles between pages.

## C. Greenfield Mode
Use when there is no reference and no established UI.

Rules:
- Build from a cohesive system, not one-off styling.
- Define visual primitives before expanding:
  - color palette
  - type scale
  - spacing scale
  - card system
  - button styles
  - form controls
  - shadow system
  - state styles
- Default to high-trust, high-clarity product design.

---

# 4. Local Server Rules

- Always serve designs on `localhost`.
- Never review or screenshot a `file:///` URL.
- Start the dev server from the project root.
- If a server already exists, do not start a second instance.
- If the project includes a `serve` or `dev` script, use it.
- Prefer stable preview URLs:
  - `http://localhost:3000`
  - `http://localhost:5173`
  - `http://localhost:8080`

If a simple static project needs previewing, a local node server is acceptable.

---

# 5. Screenshot Workflow

- Always screenshot from `localhost`.
- Compare implementation screenshots against the reference when applicable.
- Use screenshot review as a required QA step, not an optional one.
- After each major pass, check:
  - spacing
  - typography
  - colors
  - alignment
  - card/container widths
  - line-heights
  - border treatments
  - shadow softness
  - icon size consistency
  - responsive behavior

When reviewing screenshots, inspect:
- heading size and weight
- body text line length
- section spacing
- card padding
- button height
- border radius
- visual contrast
- whitespace balance
- vertical rhythm

Do not stop after the first acceptable screenshot. Refine until the screen looks deliberate.

---

# 6. Output Defaults

Unless the task says otherwise:

- use a single `index.html` for static mockups
- keep styles inline or in one local stylesheet for simple deliverables
- use Tailwind for fast iteration when appropriate
- default to mobile-first responsive structure
- keep JavaScript minimal unless interaction is required
- prefer clean semantic HTML
- prefer reusable components when building app views

If using Tailwind in a lightweight prototype, CDN usage is acceptable for mockups.
If building production UI, use the project’s actual Tailwind pipeline.

---

# 7. Brand Asset Rules

Always inspect any available brand assets before designing.

Check for:
- logos
- icon sets
- color palette tokens
- illustrations
- typography guidance
- screenshots of existing product views

Rules:
- If real brand assets exist, use them.
- Do not use placeholder graphics if real assets are available.
- If a logo exists, honor its spacing and prominence.
- If colors are defined, use exact values.
- If multiple brands exist in the repo, confirm which one the page belongs to before styling.

---

# 8. Visual System Standards

## Color
- Never default blindly to stock Tailwind blue/indigo palettes.
- Define a project palette with intent.
- Use neutrals with purpose: background, surface, border, muted text, elevated layers.
- Accent colors should communicate brand or action, not random decoration.
- Keep strong contrast for important actions and data.
- Use status colors consistently:
  - success
  - warning
  - danger
  - info

## Typography
- Use one primary text family unless the brand explicitly supports two.
- Create a clear type scale:
  - display
  - h1
  - h2
  - h3
  - body
  - label
  - caption
- Use weight changes deliberately.
- Avoid oversized headings with weak hierarchy beneath them.
- Optimize for readability first.

## Spacing
- Use an intentional spacing system.
- Keep section spacing consistent.
- Card padding should be generous enough to feel premium.
- Use tighter spacing only in dense data or dashboard contexts.
- Avoid random inconsistent gap values.

## Radius
- Define a radius system and use it consistently.
- Example:
  - small: chips, inputs
  - medium: buttons, cards
  - large: hero containers, major panels

## Shadows
- Never rely on flat default shadows only.
- Use layered and subtle shadows.
- Shadows should reflect elevation and depth, not gimmicks.
- Soft colored shadows are acceptable when brand-appropriate.

## Borders
- Borders should support structure, not create clutter.
- Use low-contrast borders for surfaces.
- Combine borders and shadows carefully.

## Depth
- Surfaces should have a clear hierarchy:
  - base background
  - raised surface
  - emphasized panel
  - modal / floating layer

---

# 9. Layout Standards

- Design around a clear content width.
- Use consistent max-width containers.
- Prefer strong grid logic over arbitrary placement.
- Hero sections should establish hierarchy immediately.
- Dashboards should emphasize:
  - status
  - actions
  - summaries
  - recent activity
  - key metrics
- Avoid crowded layouts with too many equal-priority items.

For marketing pages:
- strong hero
- trust section
- feature logic
- proof or stats
- CTA structure
- footer clarity

For product dashboards:
- persistent navigation
- clear header context
- action area
- summary cards
- detailed tables or workflows
- status indicators
- empty states

---

# 10. Component Standards

Every design system should define and reuse:

- buttons
- inputs
- selects
- textareas
- tables
- cards
- tabs
- badges
- modals
- dropdowns
- navigation
- tooltips
- toasts
- timeline/status elements

For each component, consider:
- default state
- hover state
- focus-visible state
- active state
- disabled state
- loading state
- error state

Do not leave state styling undefined.

---

# 11. Interaction Standards

- Every interactive element must have clear hover and focus states.
- Keyboard accessibility must be preserved.
- Focus rings should be visible and styled intentionally.
- Avoid overly flashy animation.
- Prefer subtle motion:
  - hover lift
  - opacity shift
  - shadow change
  - transform on small distances
- Motion should support clarity, not distract from it.

---

# 12. Form Design Standards

For borrower, investor, compliance, and underwriting workflows, forms must be:

- easy to scan
- chunked into sections
- logically progressive
- explicit about required fields
- resilient to long inputs and document states

Rules:
- use labels, not placeholder-only inputs
- display validation messages inline
- preserve values on error
- support autosave or draft states where useful
- show upload progress for documents
- show section completion status for multi-step forms

For high-friction flows:
- use progress bars or step indicators
- make next actions obvious
- reduce cognitive overload with grouping

---

# 13. Data-Dense UI Standards

For dashboards, tables, and operational workflows:

- prioritize readability over decoration
- highlight key metrics first
- use muted text for secondary data
- align numbers consistently
- use tabular data layouts with strong row separation
- support filters, sorting, and status chips where relevant
- avoid overusing bright colors on data surfaces

Metrics cards should include:
- label
- value
- context
- delta or status if relevant

Tables should consider:
- sticky headers
- truncation strategy
- empty states
- loading states
- responsive overflow behavior

---

# 14. Realtime + Workflow Resilience Standards

For applications with asynchronous processing, the frontend must clearly communicate system state.

Examples:
- pending verification
- upload processing
- underwriting review pending
- distribution posted
- payout failed
- event retry in progress

Rules:
- show status timelines when workflows span multiple steps
- use non-blocking refresh patterns for live updates
- distinguish between:
  - pending
  - processing
  - completed
  - failed
  - needs attention
- never leave users guessing what happened

Good UX patterns:
- activity feed
- job status banner
- retry button
- audit/event timeline
- notification center
- last updated timestamp

---

# 15. Accessibility Standards

Every UI must aim for production-usable accessibility.

Minimum expectations:
- semantic HTML
- keyboard navigability
- visible focus state
- proper button/link usage
- form labels and descriptions
- sufficient color contrast
- readable text sizes
- alt text for meaningful images
- no color-only meaning

Do not ship “beautiful but unusable” UI.

---

# 16. Anti-Generic Guardrails

Do not produce UI that looks like an unedited template dump.

Avoid:
- default Tailwind indigo/blue everywhere
- generic SaaS hero copy blocks with no structure
- flat surfaces with weak hierarchy
- equal-weight cards everywhere
- inconsistent icon sizes
- random gradients with no brand reason
- shallow spacing decisions
- low-trust fintech aesthetics

Instead:
- define a mood
- define system rules
- repeat patterns consistently
- make every surface feel intentional

---

# 17. Hard Rules

- Do not add sections not requested when matching a reference.
- Do not remove sections that are functionally necessary.
- Do not stop after one acceptable pass if obvious visual mismatches remain.
- Do not use `transition-all` unless absolutely necessary.
- Do not rely on default framework colors as final design decisions.
- Do not mix multiple visual languages in one screen.
- Do not create disconnected experiences between marketing and app UI.
- Do not use placeholder images in final mockups if branded alternatives exist.

---

# 18. Design QA Checklist

Before considering a screen finished, verify:

## Visual
- Does it look deliberate?
- Does it match the reference or brand direction?
- Are spacing and hierarchy consistent?
- Is the typography balanced?
- Is the color usage intentional?
- Do the shadows, borders, and layers make sense?

## Functional
- Are actions obvious?
- Are workflow states visible?
- Are forms understandable?
- Are error and empty states covered?
- Is the screen responsive?

## System
- Are components reused consistently?
- Are state styles defined?
- Does this fit the broader product design system?
- Would this be easy to extend without redesigning everything?

---

# 19. Recommended Default Stack

For robust product design work, prefer:

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui where appropriate
- local design tokens
- structured component system
- icon library with consistent stroke/size
- event-driven status updates for workflow-heavy screens

For static concept pages:
- semantic HTML
- Tailwind or lightweight CSS
- minimal JS
- local preview server

---

# 20. Final Principle

The job is not just to make the page “look good.”
The job is to create an interface that is:

- faithful when fidelity is required
- elegant when creative direction is open
- scalable when the platform grows
- trustworthy when money, documents, and workflows are involved
- resilient when asynchronous systems are in play

Design for real use, not just screenshots.
