# LinB Kanban 0.3.0 validation

Date: 2026-09-14.

## Automated checks

- TypeScript checking and all 64 automated tests passed.
- Markdown round trips preserve columns/wall layout, global and per-column order, all card colors, empty columns, text, checked tasks, attachments and unknown metadata.
- Body text is stored once. Source body edits are parsed; stale editors cannot overwrite or delete an externally edited body. Damaged markers and unsupported structural edits are refused without writes.
- Compiled-plugin host tests cover automatic routing of received Markdown and restored tabs, ordinary-note isolation, file-switch races, unload behavior, creation/export paths, and non-destructive legacy import.
- Existing tests cover atomic saves, concurrent changes, deletion undo, simulated mouse/touch movement, edge scrolling, selected-line task conversion, attachments, vault image reuse, focus and scroll preservation.
- Plugin and preview builds passed. The runtime bundle imports Obsidian only, without Node.js or Electron dependencies.
- Installation directory, manifest ID, view name, stylesheet selectors and new storage paths use LinB Kanban naming. Historical identifiers exist only in read-only import and preview-data migration compatibility code/tests.

## Limits

Tests use a simulated Obsidian host and DOM/pointer geometry. Full Obsidian visual acceptance and physical iOS/Android device tests have not been completed. Third-party themes and desktop pop-out windows have not been exhaustively tested.

Sharing a Markdown board does not embed image or attachment bytes. Referenced files must accompany it at the same vault-relative paths. External attachment renames are not automatically reconciled with hidden metadata. Source editing outside card-body blocks is not supported; these edits are detected and protected from silent replacement.

## Distribution

The local ZIP contains the `linb-kanban/` installation folder. A separate generated demo vault and a standalone Markdown sample are provided. No public GitHub repository, release, or Community-directory submission has been made.
