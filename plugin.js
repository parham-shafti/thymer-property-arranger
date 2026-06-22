/**
 * Property Arranger — workspace-wide App Plugin
 * ---------------------------------------------
 * Two features for multi-value property fields:
 *
 *   1. Drag-to-reorder linked-record (relation) values.
 *      Grab a record chip inside a `.prop-multi-values` block and drop it
 *      to set a custom order. The new order is written via prop.set([...guids]),
 *      stored as kv = ["record", g1, g2, ...] and rendered in that exact order
 *      (the renderer never sorts — it uses slice(1)). Record-type only.
 *
 *   2. Command "Toggle multi-value layout (stack / row)".
 *      Flips every `.prop-multi-values` block between the native wrapping
 *      horizontal row and a vertical stack. Remembered in localStorage.
 *
 * No `export` keyword — Thymer's Custom Code editor cannot apply it.
 * All state lives in class fields (onUnload can run without onLoad).
 *
 * NOTE on hit-testing: `.prop-multi-values` is `display:inline-flex; flex-wrap:wrap`,
 * so chips lay out as a 2D grid that wraps to multiple lines. Drag insertion uses
 * reading-order (line, then x) hit-testing — a single-axis test silently fails the
 * moment chips wrap, which they do as soon as a relation has more than a couple of
 * values.
 *
 * Verified selectors (Thymer 1.0.16, web/desktop, 2026-06):
 *   - container ............ span.prop-multi-values
 *   - record chip .......... span.prop-status.prop-status-record (direct child)
 *   - chip -> linked guid .. chip.querySelector('[data-guid]')
 *   - property row ......... .id-prop-row[data-field-id]
 *   - owning record guid ... row.closest('.panel')
 *                              .querySelector('.panel-heading[data-banner-drop]')
 *                              (data-is-collection === "true" => collection panel, skip)
 */
class Plugin extends AppPlugin {
  _styleEl = null;
  _cmd = null;
  _drag = null;
  _stacked = false;
  _PREF = "thymer-mvprops-stack";
  _onDown = null;
  _onMove = null;
  _onUp = null;
  _onCancel = null;
  _DRAG_THRESHOLD = 5;

  onLoad() {
    // Drag-reorder is the core feature — wire it FIRST and unconditionally so a
    // failure in any later step can't kill it.
    this._onDown = (e) => this._down(e);
    this._onMove = (e) => this._move(e);
    this._onUp = (e) => this._up(e);
    this._onCancel = () => this._cancel();
    document.addEventListener("pointerdown", this._onDown, true);
    document.addEventListener("pointermove", this._onMove, true);
    document.addEventListener("pointerup", this._onUp, true);
    document.addEventListener("pointercancel", this._onCancel, true);

    try { this._injectStyle(); } catch (e) { console.error("[mvprops] style", e); }
    try {
      this._stacked = this._readPref();
      document.body.classList.toggle("mvprops-stack", this._stacked);
    } catch (e) { console.error("[mvprops] pref", e); }

    try {
      this._cmd = this.ui.addCommandPaletteCommand({
        label: "Toggle multi-value layout (stack / row)",
        icon: "ti-layout-rows",
        onSelected: () => this._toggleStack(),
      });
    } catch (e) { console.error("[mvprops] addCommandPaletteCommand failed", e); }
  }

  onUnload() {
    if (this._onDown) document.removeEventListener("pointerdown", this._onDown, true);
    if (this._onMove) document.removeEventListener("pointermove", this._onMove, true);
    if (this._onUp) document.removeEventListener("pointerup", this._onUp, true);
    if (this._onCancel) document.removeEventListener("pointercancel", this._onCancel, true);
    this._endDrag();
    if (this._cmd && this._cmd.remove) this._cmd.remove();
    if (this._styleEl) this._styleEl.remove();
    document.body.classList.remove("mvprops-stack");
    this._drag = null;
  }

  /* ---------- layout toggle ---------- */

  _readPref() {
    try { return localStorage.getItem(this._PREF) === "1"; } catch (_) { return false; }
  }

  _toggleStack() {
    this._stacked = !document.body.classList.contains("mvprops-stack");
    document.body.classList.toggle("mvprops-stack", this._stacked);
    try { localStorage.setItem(this._PREF, this._stacked ? "1" : "0"); } catch (_) {}
  }

  _injectStyle() {
    const css = [
      // stack mode: only override the two axis properties; native keeps gap etc.
      "body.mvprops-stack .prop-multi-values{flex-direction:column;align-items:flex-start;}",
      // drag affordances (record chips only)
      ".prop-multi-values>.prop-status-record{cursor:grab;}",
      ".prop-multi-values>.prop-status-record.mvprops-dragging{opacity:.35;cursor:grabbing;}",
      // floating clone that follows the cursor while dragging
      ".mvprops-ghost{position:fixed!important;margin:0!important;pointer-events:none;z-index:2147483646;opacity:.95;box-shadow:0 6px 18px rgba(0,0,0,.35);transform:rotate(-2deg);border-radius:5px;}",
      // insertion line showing where the chip will land
      ".mvprops-drop-indicator{position:fixed;z-index:2147483647;pointer-events:none;background:#b8b8b8;border-radius:2px;box-shadow:0 0 3px rgba(0,0,0,.3);}",
    ].join("\n");
    const el = document.createElement("style");
    el.id = "mvprops-style";
    el.textContent = css;
    document.head.appendChild(el);
    this._styleEl = el;
  }

  /* ---------- drag-to-reorder (record multi-value only) ---------- */

  _chips(container) {
    return Array.prototype.filter.call(
      container.children,
      (c) => c.classList && c.classList.contains("prop-status-record")
    );
  }

  _guidOf(chip) {
    const l = chip.querySelector("[data-guid]");
    return l && l.getAttribute("data-guid");
  }

  // Resolve which record + field a multi-value block belongs to. Works in both the
  // open-record property panel and the collection table view.
  _context(container) {
    // Property panel: .id-prop-row[data-field-id] inside a .panel whose heading
    // carries the record guid (collection panels are skipped).
    const row = container.closest(".id-prop-row");
    if (row) {
      const panel = row.closest(".panel");
      const heading = panel && panel.querySelector(".panel-heading[data-banner-drop]");
      if (heading && heading.getAttribute("data-is-collection") !== "true") {
        return { recGuid: heading.getAttribute("data-banner-drop"), fieldId: row.getAttribute("data-field-id") };
      }
      return null;
    }
    // Table view: .table-view-cell[data-field-id] inside .table-view-row[data-guid].
    const cell = container.closest(".table-view-cell[data-field-id]");
    if (cell) {
      const trow = cell.closest(".table-view-row[data-guid]");
      if (trow) return { recGuid: trow.getAttribute("data-guid"), fieldId: cell.getAttribute("data-field-id") };
    }
    return null;
  }

  _down(e) {
    if (e.button !== 0 || !e.target || !e.target.closest) return;
    const chip = e.target.closest(".prop-status-record");
    if (!chip) return;
    const container = chip.parentElement;
    if (!container || !container.classList.contains("prop-multi-values")) return;
    const ctx = this._context(container);
    if (!ctx) return;
    const { recGuid, fieldId } = ctx;
    const draggedGuid = this._guidOf(chip);
    if (!recGuid || !fieldId || !draggedGuid) return;
    if (this._chips(container).length < 2) return;

    this._drag = {
      chip, container, recGuid, fieldId, draggedGuid,
      startX: e.clientX, startY: e.clientY,
      pid: e.pointerId, engaged: false,
    };
  }

  // We deliberately do NOT physically reorder chips during the drag: the container
  // is `flex-wrap: wrap`, so moving a chip reflows the grid, which would change the
  // hit-test mid-drag and oscillate across line boundaries. Instead we show a floating
  // ghost + an insertion line, and compute the final slot from the pointer on drop.
  _move(e) {
    const d = this._drag;
    if (!d || e.pointerId !== d.pid) return;
    if (!d.engaged) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < this._DRAG_THRESHOLD) return;
      this._beginDrag(d, e);
    }
    e.preventDefault();
    e.stopPropagation();
    if (d.ghost) {
      d.ghost.style.left = e.clientX - d.offX + "px";
      d.ghost.style.top = e.clientY - d.offY + "px";
    }
    const info = this._slotInfo(d, e.clientX, e.clientY);
    this._positionIndicator(d, info);
  }

  _up(e) {
    const d = this._drag;
    this._drag = null;
    if (!d) return;
    this._endDrag(d);
    if (e.pointerId !== d.pid || !d.engaged) return;
    e.preventDefault();
    e.stopPropagation();

    // swallow the click that fires right after the drag (so the link doesn't open)
    const kill = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      document.removeEventListener("click", kill, true);
    };
    document.addEventListener("click", kill, true);
    setTimeout(() => document.removeEventListener("click", kill, true), 350);

    // Current order (reflow-free — chips were never moved).
    const guids = this._chips(d.container).map((c) => this._guidOf(c));
    if (guids.some((g) => !g) || guids.length < 2) return;
    const { slot } = this._slotInfo(d, e.clientX, e.clientY);
    const rest = guids.filter((g) => g !== d.draggedGuid);
    rest.splice(slot, 0, d.draggedGuid);
    if (rest.join("|") !== guids.join("|")) this._write(d.recGuid, d.fieldId, rest);
  }

  _cancel() {
    const d = this._drag;
    this._drag = null;
    this._endDrag(d);
  }

  // Target slot = number of non-dragged chips that sit before the pointer in reading
  // order (line first via top/bottom, then x within the line). Reflow-free.
  _slotInfo(d, px, py) {
    const nonDragged = this._chips(d.container).filter((c) => c !== d.chip);
    let slot = 0;
    for (const c of nonDragged) {
      const r = c.getBoundingClientRect();
      const before = py > r.bottom ? true : py < r.top ? false : px > r.left + r.width / 2;
      if (before) slot++;
    }
    return { nonDragged, slot };
  }

  _beginDrag(d, e) {
    d.engaged = true;
    d.chip.classList.add("mvprops-dragging");
    const r = d.chip.getBoundingClientRect();
    const ghost = d.chip.cloneNode(true);
    ghost.classList.remove("mvprops-dragging");
    ghost.classList.add("mvprops-ghost");
    ghost.style.left = r.left + "px";
    ghost.style.top = r.top + "px";
    ghost.style.width = r.width + "px";
    ghost.style.height = r.height + "px";
    document.body.appendChild(ghost);
    d.ghost = ghost;
    d.offX = e.clientX - r.left;
    d.offY = e.clientY - r.top;
    const ind = document.createElement("div");
    ind.className = "mvprops-drop-indicator";
    document.body.appendChild(ind);
    d.indicator = ind;
  }

  _positionIndicator(d, info) {
    const ind = d.indicator;
    if (!ind || !info.nonDragged.length) return;
    const atEnd = info.slot >= info.nonDragged.length;
    const ref = atEnd ? info.nonDragged[info.nonDragged.length - 1] : info.nonDragged[info.slot];
    const r = ref.getBoundingClientRect();
    if (document.body.classList.contains("mvprops-stack")) {
      ind.style.left = r.left + "px";
      ind.style.width = r.width + "px";
      ind.style.height = "1px";
      ind.style.top = (atEnd ? r.bottom : r.top) - 1 + "px";
    } else {
      ind.style.top = r.top + "px";
      ind.style.height = r.height + "px";
      ind.style.width = "1px";
      ind.style.left = (atEnd ? r.right : r.left) - 1 + "px";
    }
  }

  _endDrag(d = this._drag) {
    if (!d) return;
    if (d.chip) d.chip.classList.remove("mvprops-dragging");
    if (d.ghost) { d.ghost.remove(); d.ghost = null; }
    if (d.indicator) { d.indicator.remove(); d.indicator = null; }
  }

  _write(recGuid, fieldId, guids) {
    try {
      const rec = this.data.getRecord(recGuid);
      if (!rec) return;
      const prop = rec.getAllProperties().find((p) => p.guid === fieldId);
      if (prop) prop.set(guids);
    } catch (err) {
      console.error("[mvprops] reorder write failed", err);
    }
  }
}
