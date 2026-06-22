# Changelog

## v1.0.0 — 2026-06-22

- Drag to reorder the values of a multi-value linked-record (relation) property into a custom order, in both the open-record property panel and the collection table view.
- A floating chip preview follows the cursor while dragging, with a thin grey insertion line showing where the value will drop.
- Reading-order hit-testing so the drop position is correct even when chips wrap onto multiple lines.
- Command "Toggle multi-value layout (stack / row)" that flips every multi-value block between Thymer's native wrapping row and a vertical stack; the choice persists.
- A normal click on a chip still opens the linked record — only a deliberate drag reorders.
