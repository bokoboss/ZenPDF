# ZenPDF UX Audit — Preserve the Design

## Audit rule

The current ZenPDF visual design is a protected product asset.

This audit identifies interaction/usability defects that can be fixed **without replacing the current design language**. It is not a redesign brief.

Priority definitions:

- **P0** — correctness/safety blocker
- **P1** — high-value usability/accessibility defect
- **P2** — meaningful refinement
- **P3** — optional polish

## What should remain unchanged

Keep the existing:

- warm stone/off-white palette,
- Outfit-led typographic character,
- generous whitespace,
- rounded cards and pill controls,
- restrained shadows and borders,
- thin iconography,
- calm transitions,
- low-density premium presentation,
- upload-page composition,
- overall 3-step visual identity unless a future UX decision explicitly proves a better flow while preserving the same character.

## Findings

### P1 — Page numbering is ambiguous after merge/reorder

Current page cards display `page.pageIndex + 1`, which is the original source-page index.

After combining files, users can see repeated sequences such as:

```text
File A: 1 2 3
File B: 1 2 3
```

This does not communicate output position after pages are reordered.

Recommended future treatment:

- primary badge = output position,
- optional subtle provenance = source file + source page when needed.

Example:

```text
6
Report B · p.3
```

Constraint: preserve the existing badge styling; this is an information-semantic change, not a restyle.

### P1 — Touch access to per-page actions needs explicit qualification

Per-page rotate/remove actions are visually revealed by hover/focus. Touch users do not have hover.

The page itself can be selected by touch and the sticky toolbar provides selected-page Rotate/Delete, which reduces the severity, but the behavior should be deliberately tested on narrow/touch viewports.

Preferred solution order:

1. retain tap-to-select + sticky selection actions,
2. ensure the selected state clearly exposes all necessary actions,
3. only add a compact context action if a real touch gap remains.

Do not permanently expose noisy controls on every card unless testing proves it necessary.

### P1 — Keyboard semantics are incomplete on icon-only controls

Several editor controls rely on icons/title rather than explicit accessible names, including back, undo/redo, zoom, and add-file controls.

Add `aria-label` attributes without changing visible styling.

Keyboard drag/reorder should also be qualified end-to-end rather than assumed from dnd-kit configuration.

### P1 — Re-selecting the same file should work everywhere

The Documents-stage file input was hardened to clear its value after selection.

The Editor-stage hidden add-file input should follow the same rule so selecting the same local file again is reliable.

This is behavior-only and requires no visual change.

### P1 — Error recovery is currently global/toast-oriented

Malformed PDF errors currently surface as a toast while the failed file can remain visually in a processing-like state.

Future Phase 1 error-state work should attach recoverable status to the affected file/task:

- failed file remains identifiable,
- user can remove or retry it,
- unrelated documents remain usable,
- error language uses stable domain errors rather than raw library text.

Keep the existing card visual vocabulary; do not introduce a generic enterprise error panel.

### P2 — Destructive-action confidence

Deleting selected pages is immediate and undoable.

Because Undo exists, a confirmation modal for every delete would likely add friction. Preferred behavior:

- retain immediate delete,
- ensure Undo remains obvious and reliable,
- consider confirmation only for destructive actions that cannot be undone.

### P2 — Selection feedback could communicate count more explicitly

The drag overlay shows group count, but the sticky toolbar does not prominently state `N selected`.

A compact selected-count treatment may help large-document workflows, provided it fits the existing quiet toolbar and does not add visual density.

### P2 — Editor toolbar density on narrow screens needs qualification

The sticky toolbar uses wrapping and hides some text labels below `sm`, which is directionally correct.

Qualification should verify:

- Save/Download remains reachable,
- no controls overlap,
- sticky toolbar does not consume excessive viewport height,
- touch targets remain usable,
- horizontal overflow does not occur.

Do not replace the toolbar with a generic mobile bottom navigation without a demonstrated need.

### P2 — Shift-range behavior is mouse-keyboard centric

Shift-select is useful on desktop but unavailable on touch.

This is acceptable if Select All / individual selection / multi-selection remain efficient. Do not add a complex range-selection mode unless field use shows a real need.

### P2 — Download naming is timestamp-based only

Current generated filenames such as `ZenPDF_Merged_<timestamp>.pdf` are safe but not informative.

A future refinement could derive a sanitized base name from the first source document or allow a filename edit at download time.

This is a convenience enhancement, not a Phase 1 requirement.

### P3 — Shortcut discoverability

Undo/redo keyboard shortcuts exist but are not disclosed.

Possible low-noise treatment later:

- tooltip shortcut hints,
- help popover,
- command legend.

Avoid persistent shortcut labels that make the interface busier.

## Recommended implementation order

### Before / during Phase 1

- add missing accessible names,
- normalize same-file re-selection in Editor,
- introduce per-file/task error semantics as part of typed worker errors,
- run keyboard/touch regression tests.

### Phase 2

- validate toolbar behavior with large documents,
- ensure virtualization/lazy rendering preserves keyboard and touch navigation.

### Phase 3

- clarify output position vs source-page provenance,
- selected-count refinement,
- download naming refinement,
- optional shortcut discoverability.

## Acceptance principle

A UX fix is successful only if it improves a specific interaction defect **and ZenPDF still looks immediately like ZenPDF**.
