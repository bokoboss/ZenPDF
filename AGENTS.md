# ZenPDF Agent Instructions

These instructions apply to automated coding agents and contributors working in this repository.

## Product identity

ZenPDF is a calm, premium, privacy-first PDF workspace. The existing visual design is an intentional product asset.

**Do not redesign the application as part of technical modernization.**

Before making visible UI changes, read `docs/DESIGN_GUARDRAILS.md`.

## Visual baseline

Preserve by default:

- warm off-white / stone palette
- current typography hierarchy
- generous whitespace
- large rounded surfaces and controls
- subtle borders, shadows, blur, and depth
- restrained thin-stroke iconography
- calm motion and transitions
- simple low-noise information hierarchy
- current upload-page brand treatment
- the overall premium, quiet appearance

Infrastructure refactors should be visual-neutral unless a UI change is necessary to fix a specific usability or accessibility defect.

Do not replace the design with a generic dashboard, admin layout, dense toolbar system, or unrelated component-library styling.

## Architecture direction

Modernization should move toward:

- local npm dependencies rather than runtime CDN dependencies
- typed TypeScript module workers rather than stringified worker source
- explicit worker request/response contracts
- safe task/session lifecycle handling
- deterministic cleanup of Object URLs and worker resources
- fixture-backed regression tests for PDF behavior
- large-document performance that keeps the main UI responsive
- keyboard and touch accessibility using the existing visual language

Do not add server-side document upload/storage unless explicitly requested.

## Privacy and secrets

ZenPDF core functionality requires no API key.

Never place secrets in:

- Vite `define`
- browser environment variables
- frontend source
- committed configuration

Document contents should remain local to the user's browser unless a future requirement explicitly changes the privacy model.

## Required validation

For every implementation change, run at minimum:

```bash
npm run typecheck
npm run build
```

When fixture tests are available, run the relevant PDF regression suite as well.

A passing build does not prove PDF correctness. Output PDFs should be parsed and verified for page count/order/rotation as appropriate.

## UI changes

If a task intentionally changes visible UI:

1. State the UX defect or requirement being solved.
2. Reuse the existing ZenPDF visual vocabulary.
3. Validate desktop and narrow/mobile behavior.
4. Provide before/after screenshots when the environment supports them.
5. Confirm that unrelated spacing, typography, palette, radii, shadows, and motion were not changed.

## Engineering priorities

When choosing between work items, prioritize in this order unless the task says otherwise:

1. Data/document correctness
2. Privacy and resource safety
3. Recoverability and error handling
4. Performance/responsiveness
5. Accessibility and interaction quality
6. New PDF features

Avoid broad rewrites when a bounded refactor can preserve proven behavior.

## Scope references

- Modernization roadmap: `docs/ROADMAP.md`
- Design constraints: `docs/DESIGN_GUARDRAILS.md`
- Regression coverage: `docs/TEST_MATRIX.md`
- Security/privacy boundary: `SECURITY.md`
