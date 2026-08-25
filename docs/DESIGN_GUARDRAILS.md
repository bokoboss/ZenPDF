# ZenPDF Design Guardrails

## Status

The current ZenPDF visual design is an intentional product asset and is the visual baseline for modernization work.

Technical refactoring must preserve the application's existing premium, calm, minimal character unless a future change is explicitly approved as a design change.

## Preserve by default

The following characteristics are considered part of ZenPDF's identity:

- Warm off-white / stone visual palette
- Restrained monochrome hierarchy rather than bright application chrome
- Lightweight typography and generous whitespace
- Large rounded surfaces and controls
- Soft borders, subtle shadows, blur, and restrained depth
- Minimal iconography with thin strokes
- Calm motion and transition behavior
- High whitespace-to-control ratio
- Simple language and low visual noise
- The current upload-page presentation and brand treatment
- The overall premium, quiet, uncluttered feel

## Modernization rule

A technical change should be treated as **visual-neutral by default**.

Changes to the PDF engine, worker architecture, dependency loading, state management, test infrastructure, performance, security, or build system should not alter layout, spacing, typography, colors, shape language, motion, or hierarchy unless the visual change is necessary to fix a usability or accessibility defect.

## UX improvements are allowed without redesign

The visual system may be extended when needed for:

- Keyboard accessibility
- Touch-device interactions
- Visible focus states
- Error and recovery states
- Long-running operation feedback
- Large-document performance states
- Selection clarity
- Destructive-action confirmation
- Output-page numbering and document provenance

New UI should reuse the existing visual vocabulary instead of introducing a second design system.

## Review requirement

Any pull request that intentionally changes the visible UI should include:

1. A short explanation of the UX problem being solved.
2. Before/after screenshots at representative desktop and mobile widths.
3. Confirmation that the change preserves the established ZenPDF visual language.
4. A note if spacing, typography, colors, radii, shadows, or motion were intentionally changed.

## Non-goal

Modernization is **not** an invitation to make ZenPDF look like a generic dashboard, admin panel, component-library demo, or crowded all-in-one PDF website.
