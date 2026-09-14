# LinB Kanban 0.2.5 validation

Date: 2026-09-14.

## Automated checks

- TypeScript type checking passed.
- Vault image selection is tested through the compiled plugin entry: name/path search and thumbnails, close-before-selection ordering, original-path reuse without binary writes, duplicate prevention, reload, reference removal preserving the source, cancellation, empty/deleted images and view-unload cleanup.
- Card-color selection and persistence are covered by the existing create/edit/reopen interaction test.
- For the local preview theme values, normal text, secondary text and links on the six tinted surfaces meet 4.5:1: minimum 4.60:1 in light mode and 5.84:1 in dark mode. Third-party theme values may differ.
- All 52 tests passed: 3 Markdown helpers, 14 model, 6 repository, 20 interface and 9 compiled-plugin integration tests.
- Plugin and local preview builds passed. The plugin bundle only imports Obsidian; no Node.js or Electron runtime APIs are included.
- The native `copy-plus` icon was verified in a local Obsidian application distribution. The ribbon callback enters the creation flow.
- The stable plugin ID, view type, `.moss` schema and storage paths are retained from earlier Moss Wall releases.

Coverage includes atomic saves, ordering and cross-column moves, conflict handling, deletion recovery, malformed-file protection, attachment imports, reloads, Markdown exports, simulated touch gestures, focus restoration and scroll preservation. New regressions cover mouse movement up/down and across columns, empty-column and gap placement, wall sorting, edge scrolling and cancellation, selected-line task conversion, checked-state persistence and safe interception of native Markdown checkbox handlers.

## Limits

Integration tests use a minimal simulated Obsidian host. Pointer tests use simulated events and layout geometry. No real-device iOS or Android verification or full Obsidian visual acceptance is claimed. Third-party themes and desktop pop-out windows have not been exhaustively tested.

## Distribution

The public GitHub release provides `main.js`, `manifest.json` and `styles.css` separately. The optional ZIP uses the `moss-wall/` folder for compatibility with existing installations. Community-directory acceptance is a separate step from publishing a GitHub release.
