# LinB Kanban 0.4.0 validation

Date: 2026-09-15.

## Automated checks

- Added coverage for caret-based formatting, list continuation, native HTTP previews, safe metadata parsing, request deduplication/concurrency, offline fallback, image errors, and keyboard-area resizing with listener cleanup.
- Chinese/English UI tests cover native commands and rendered editors. A Chinese board with an untitled card and a link parses and serializes byte-identically after switching to English; existing user content is preserved.
- Browser inspection covered desktop, 768 px tablet, 390 px phone, and 320 px narrow layouts, including light/dark and English. The mobile input radius measured 8 px despite simulated 50 px native radius tokens, with no horizontal editor overflow. Formatting buttons measured 44 px in mobile mode. Browser interaction verified task insertion, Enter continuation, and native undo of formatting.

- Reproduced the ordinary-note blank pane with a host fixture that ignores nested view transitions during file loading, matching the installed Obsidian implementation. The board view no longer accepts arbitrary `.md` files by extension. Stale board-state recovery and automatic routing defer transitions until after the file-load event turn; recovery is cancelled on file change, close or unload. Four assertions failed before the fix, and all pass afterward. These checks do not write note contents.

- Six view-routing regressions cover late leaf restoration, activation/layout changes without file-open, sync replacing an open note, stale read caches, an update during an in-flight read, and queued-event cancellation on unload. Four reproductions failed before this correction. Routing is event-driven and coalesced; all cases preserve file contents.

- Checkbox CSS now reserves a text gutter and positions each box at the center of the first line height. Wrapped lines retain text indentation; the native checkbox size and colors are preserved. This CSS correction has not received full Obsidian visual acceptance.

- Fixed the upgrade regression where unsupported historical file types disappeared from the explorer and normal board picker. Historical extensions are registered again; opening is read-only and explicit edits preserve JSON format. Export creates a separate Markdown copy.

- TypeScript checking and all 91 automated tests passed.
- Markdown round trips preserve columns/wall layout, global and per-column order, all card colors, empty columns, text, checked tasks, attachments and unknown metadata.
- Body text is stored once. Source body edits are parsed; stale editors cannot overwrite or delete an externally edited body. Damaged markers and unsupported structural edits are refused without writes.
- Compiled-plugin host tests cover automatic routing of received Markdown and restored tabs, ordinary-note isolation, file-switch races, unload behavior, creation/export paths, and non-destructive legacy import.
- Existing tests cover atomic saves, concurrent changes, deletion undo, simulated mouse/touch movement, edge scrolling, selected-line task conversion, attachments, vault image reuse, focus and scroll preservation.
- Plugin and preview builds passed. The runtime bundle imports Obsidian only, without Node.js or Electron dependencies.
- Installation directory, manifest ID, view name, stylesheet selectors and new storage paths use LinB Kanban naming. Historical identifiers remain in file-format compatibility and preview-data migration code/tests.

## Limits

Tests use a simulated Obsidian host and DOM/pointer geometry. Physical iPad/iPhone keyboard and touch validation, full native Obsidian acceptance, and Android device tests have not been completed. Browser pane and mobile-style simulations do not replace those checks. Live previews are not guaranteed for all platforms or login-only pages. Third-party themes and desktop pop-out windows have not been exhaustively tested.

Sharing a Markdown board does not embed image or attachment bytes. Referenced files must accompany it at the same vault-relative paths. External attachment renames are not automatically reconciled with hidden metadata. Source editing outside card-body blocks is not supported; these edits are detected and protected from silent replacement.

## Distribution

The local ZIP contains the `linb-kanban/` installation folder. A separate generated demo vault and a standalone Markdown sample are provided. The GitHub release contains the three installation files and an optional installation ZIP. The Community listing is public. Its separate version check may lag the GitHub release; version 0.3.4 or newer is recommended for the ordinary-note view fix.
