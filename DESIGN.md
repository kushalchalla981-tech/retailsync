# Design System: RetailSync

Hallmark redesign (full, app scope), theme **Broadside**, colourway `bill`. Tokens live in `frontend/src/tokens.css`; base rules in `frontend/src/base.css`; component rules in `frontend/src/index.css`. Tailwind colour and font names map onto those tokens (`frontend/tailwind.config.js`); no literal colour exists outside the token block.

## World

A printer's sale bill: grained buff stock, near-black ink, condensed wood-type capitals, one vermilion. Loud through tall capitals and heavy rules, never through drawn ornament. It suits a retail chain's flash sale and makes the one fact the demo proves, that the last unit sells once, read like a notice.

## Type

- **Six Caps** (display): the hero lines, prices, big figures. Each display line is fitted to its column (`FitLine`) and never wraps.
- **Bevan** (slab): the wordmark, section heads, dialog heads.
- **Archivo Narrow** 400/500/600: everything read, labels, tables, figures in tabular numerals.

## Colour

Paper `--color-paper`, wells `--color-paper-2/3`, ink `--color-ink`, muted `--color-muted`, rule `--color-rule`, and one accent `--color-accent` (vermilion). The accent marks failure, the last unit and the one vermilion display line, nothing else. The live ledger is an ink band with buff type. Services are named in words (PostgreSQL, Kafka, OpenSearch), never colour-coded.

## Surfaces and controls

Square corners, no shadows. Rules at one point (hair, `--color-rule` or ink) or five points (ink, over a section). Frames are a 3px ink border with an inset keyline. Buttons: the filled ink block (primary, one per view) and the framed block (secondary), 44px, Archivo Narrow 600 capitals, all eight states. Inputs: square, 44px, 1px ink border.

## Motion

Printed, so still. The only animation is `lock-pulse`, reserved for a buyer waiting on a row lock in the race, and it stops under `prefers-reduced-motion`.
