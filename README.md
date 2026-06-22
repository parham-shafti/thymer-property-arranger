# Property Arranger

Property Arranger is a [Thymer](https://thymer.com) plugin for **multi-value properties**. It lets you put the values of a linked-record (relation) property into a custom order by dragging them, and adds a command to flip multi-value blocks between a horizontal wrapping row and a vertical stack.

Thymer renders multi-value properties in the order they're stored and never re-sorts them, but there's no built-in way to *change* that order or to lay the values out vertically. This plugin adds both.

![Dragging a linked-record value into a new position](assets/reorder-demo.gif)

## Features

- **Drag to reorder linked-record values.** Grab a record chip inside a multi-value relation property and drop it where you want it. A floating preview follows your cursor and a thin insertion line shows where it will land. Works in the open-record property panel **and** in the collection table view.
- **Toggle layout (stack / row).** A command flips every multi-value block between Thymer's native wrapping row and a single vertical column. Your choice is remembered.

## How to use

**Reordering** (linked-record / "Linked to" properties with two or more values):

1. Open a record, or view the collection as a table.
2. Press and drag one of the record chips in a multi-value relation property.
3. A ghost of the chip follows your cursor and a grey insertion line shows the drop position. Release to apply the new order. It's saved immediately.

A normal click on a chip still opens the linked record as usual — only an actual drag reorders.

**Layout:**

- Open the Command Palette (`Cmd+P` / `Ctrl+P`) and run **Toggle multi-value layout (stack / row)**. Every multi-value property block switches between a wrapping horizontal row and a vertical stack. Run it again to switch back; the setting persists across restarts.

![Toggling multi-value layout between a wrapping row and a vertical stack](assets/layout-toggle.gif)

## Installation

1. In Thymer, open the Command Palette (`Cmd+P` / `Ctrl+P`), run **Plugins**, and click **Create Plugin** under Global Plugins.
2. In the plugin's dialog, go to the code editor (click **Edit as Code** if you see the settings view).
3. In the **Custom Code** tab, replace the contents with [`plugin.js`](plugin.js).
4. In the **Configuration** tab, replace the contents with [`plugin.json`](plugin.json).
5. Click **Save**.

Don't enable Hot Reload — it's a development feature and can leave the plugin in a state where saved data stops persisting.

## How it works

- Reordering reads each record chip's linked GUID from the DOM, computes the new order from where you drop, and writes it back with the plugin API (`prop.set([...guids])`). Because Thymer stores and renders multi-value properties in array order, the new order sticks and re-renders correctly.
- The drop position is worked out with reading-order hit-testing (which line, then horizontal position within the line), so it behaves correctly even when chips wrap onto multiple lines — and in both the property panel and the table view, whose record/field are resolved from their respective DOM wrappers.
- The drag never physically moves chips mid-drag (that would reflow the wrapping grid and fight itself); it shows a floating ghost and an insertion line instead, then applies the change on drop.
- The layout toggle adds/removes a class on `<body>` and styles `.prop-multi-values` from there, so it flips instantly and remembers your choice in `localStorage`.

## License

[MIT](LICENSE)
