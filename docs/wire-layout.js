/* Grid-based visual wiring; source relationships are kept intact. */
(function (scope) {
  "use strict";
  const PREFIX = "web-analyzer:layout:v1:",
    GRID = 20;
  const finite = (n) => Number.isFinite(n) && Math.abs(n) <= 1000000;
  const point = (p) => p && finite(p.x) && finite(p.y);
  const snap = (n) => Math.max(0, Math.round(n / GRID) * GRID);
  const snapped = (p) => ({ x: snap(p.x), y: snap(p.y) });
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const clamp = (n) => Math.max(0, Math.min(1, n));
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++)
      h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36);
  }
  function empty() {
    return { version: 2, nodes: {}, routes: {} };
  }
  function load(storage, key) {
    const state = empty();
    try {
      const raw = JSON.parse(storage.getItem(PREFIX + key));
      if (![1, 2].includes(raw?.version)) return state;
      for (const [id, p] of Object.entries(raw.nodes || {}))
        if (point(p)) state.nodes[id] = { x: p.x, y: p.y };
      for (const [id, r] of Object.entries(raw.routes || {})) {
        if (!r || typeof r !== "object") continue;
        const next = { waypoints: [] };
        for (const end of ["from", "to"])
          if (
            r[end] &&
            ["left", "right", "top", "bottom"].includes(r[end].side) &&
            finite(r[end].t)
          )
            next[end] = { side: r[end].side, t: clamp(r[end].t) };
        // v1's automatic midpoint is intentionally discarded: only user-created joints remain.
        if (raw.version === 2 && Array.isArray(r.waypoints))
          next.waypoints = r.waypoints.filter(point).slice(0, 200).map(snapped);
        state.routes[id] = next;
      }
    } catch {}
    return state;
  }
  function sides(a, b, self) {
    if (self) return ["right", "top"];
    if (b.x >= a.x + a.width) return ["right", "left"];
    if (a.x >= b.x + b.width) return ["left", "right"];
    return b.y >= a.y ? ["bottom", "top"] : ["top", "bottom"];
  }
  function anchor(box, value, side) {
    const v = value || { side, t: 0.5 },
      horizontal = ["top", "bottom"].includes(v.side);
    const along = (start, size) =>
      Math.max(
        Math.ceil(start / GRID) * GRID,
        Math.min(
          Math.floor((start + size) / GRID) * GRID,
          snap(start + size * v.t),
        ),
      );
    return {
      x: horizontal
        ? along(box.x, box.width)
        : v.side === "right"
          ? Math.ceil((box.x + box.width) / GRID) * GRID
          : Math.floor(box.x / GRID) * GRID,
      y: horizontal
        ? v.side === "bottom"
          ? Math.ceil((box.y + box.height) / GRID) * GRID
          : Math.floor(box.y / GRID) * GRID
        : along(box.y, box.height),
      dx: v.side === "right" ? 1 : v.side === "left" ? -1 : 0,
      dy: v.side === "bottom" ? 1 : v.side === "top" ? -1 : 0,
    };
  }
  function nearest(box, p) {
    const side = [
      ["left", Math.abs(p.x - box.x)],
      ["right", Math.abs(p.x - box.x - box.width)],
      ["top", Math.abs(p.y - box.y)],
      ["bottom", Math.abs(p.y - box.y - box.height)],
    ].sort((a, b) => a[1] - b[1])[0][0];
    return {
      side,
      t: clamp(
        ["top", "bottom"].includes(side)
          ? (snap(p.x) - box.x) / box.width
          : (snap(p.y) - box.y) / box.height,
      ),
    };
  }
  function route(aBox, bBox, saved = {}, self = false) {
    const defaults = sides(aBox, bBox, self),
      a = anchor(aBox, saved.from, defaults[0]),
      b = anchor(bBox, saved.to, defaults[1]);
    const waypoints = (saved.waypoints || []).map(snapped),
      points = [{ x: a.x, y: a.y }],
      segments = [];
    const push = (p, leg) => {
      const last = points.at(-1);
      if (!same(last, p)) {
        segments.push({ a: last, b: p, leg });
        points.push(p);
      }
    };
    const stops = [...waypoints, b];
    for (let i = 0; i < stops.length; i++) {
      const start = points.at(-1),
        end = stops[i];
      if (start.x !== end.x && start.y !== end.y) {
        if (!waypoints.length) {
          if (self) {
            const right = snap(aBox.x + aBox.width) + GRID * 2,
              top = Math.max(0, Math.floor(aBox.y / GRID) * GRID - GRID * 2);
            push({ x: right, y: start.y }, i);
            push({ x: right, y: top }, i);
            push({ x: end.x, y: top }, i);
          } else if (a.dx && b.dx) {
            const x = snap((a.x + b.x) / 2);
            push({ x, y: start.y }, i);
            push({ x, y: end.y }, i);
          } else if (a.dy && b.dy) {
            const y = snap((a.y + b.y) / 2);
            push({ x: start.x, y }, i);
            push({ x: end.x, y }, i);
          } else
            push(a.dx ? { x: end.x, y: start.y } : { x: start.x, y: end.y }, i);
        } else {
          // The last leg enters the destination perpendicular to its side.
          const horizontal =
            i === stops.length - 1
              ? !!b.dy
              : i === 0
                ? !!a.dx
                : segments.at(-1)?.a.y === start.y;
          push(
            horizontal ? { x: end.x, y: start.y } : { x: start.x, y: end.y },
            i,
          );
        }
      }
      push({ x: end.x, y: end.y }, i);
    }
    return {
      d: points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" "),
      from: a,
      to: b,
      points,
      segments,
      waypoints,
    };
  }
  function distance(p, segment) {
    const a = segment.a,
      b = segment.b,
      x = Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), p.x)),
      y = Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), p.y));
    return Math.hypot(p.x - x, p.y - y);
  }
  class Editor {
    constructor(world, toolbar, key, redraw) {
      this.world = world;
      this.redraw = redraw;
      this.connections = [];
      this.handles = new Map();
      this.layer = document.createElement("div");
      this.layer.className = "wire-edit-layer";
      this.hitSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      this.hitSvg.classList.add("wire-hit-layer");
      this.layer.append(this.hitSvg);
      this.hits = new Map();
      this.controls = document.createElement("div");
      this.controls.className = "wire-toolbar";
      const button = (text, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.onclick = fn;
        this.controls.append(b);
        return b;
      };
      this.label = document.createElement("span");
      this.label.className = "wire-selection-label";
      this.controls.append(this.label);
      this.drawButton = button("逐點重畫", () => this.startDrawing());
      this.finishButton = button("完成接線", () => this.finishDrawing());
      this.cancelButton = button("取消", () => {
        this.draft = null;
        this.redraw();
      });
      this.evidence = button("查看程式碼依據", () =>
        this.connections.find((c) => c.id === this.selected)?.evidence?.(),
      );
      this.reset = button("還原這條線", () => {
        delete this.state.routes[this.selected];
        this.draft = null;
        this.save();
        this.redraw();
      });
      this.status = document.createElement("span");
      this.status.className = "wire-save-status";
      this.status.setAttribute("role", "status");
      this.controls.append(this.status);
      toolbar.append(this.controls);
      this.setScope(key);
      world.addEventListener("click", (e) => {
        if (e.target.closest("button,input,select,textarea,a,.wire-hit"))
          return;
        if (this.draft) {
          e.stopPropagation();
          this.addDraft(this.coordinates(e));
        } else if (!e.target.closest(".flow-node,.component-flow-node"))
          this.deselect();
      });
      world.addEventListener("pointermove", (e) => {
        if (this.draft) {
          this.preview = this.coordinates(e);
          this.redraw();
        }
      });
      world.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          if (this.draft) {
            this.draft = null;
            this.redraw();
          } else this.deselect();
        }
        if (e.key === "Enter" && this.draft) {
          e.preventDefault();
          this.finishDrawing();
        }
        if ((e.key === "Backspace" || e.key === "Delete") && this.draft) {
          e.preventDefault();
          this.draft.waypoints.pop();
          this.redraw();
        }
      });
    }
    setScope(key) {
      this.key = key;
      let storage;
      try {
        storage = scope.localStorage;
      } catch {}
      this.state = load(storage, key);
      this.selected = null;
      this.draft = null;
      this.status.textContent = "點線選取 · 雙擊線新增轉折 · 20 px 格點";
    }
    record(id) {
      return (this.state.routes[id] ||= { waypoints: [] });
    }
    save() {
      try {
        scope.localStorage.setItem(
          PREFIX + this.key,
          JSON.stringify(this.state),
        );
        this.status.textContent = "已自動儲存";
      } catch {
        this.status.textContent = "無法儲存，關閉後配置會遺失";
      }
    }
    saveNodes(nodes) {
      for (const n of nodes) this.state.nodes[n.id] = { x: n.x, y: n.y };
      this.save();
    }
    clear() {
      this.state = empty();
      this.draft = null;
      this.selected = null;
      this.save();
      this.redraw();
    }
    coordinates(e) {
      const r = this.world.getBoundingClientRect(),
        s = r.width / this.world.offsetWidth;
      return snapped({
        x: (e.clientX - r.left) / s,
        y: (e.clientY - r.top) / s,
      });
    }
    select(id) {
      if (this.draft && this.selected !== id) this.draft = null;
      this.selected = id;
      this.sync(this.connections);
    }
    deselect() {
      if (!this.selected) return;
      this.selected = null;
      this.draft = null;
      this.sync(this.connections);
    }
    addDraft(p) {
      if (!this.draft) return;
      const pts = this.draft.waypoints;
      if (pts.length < 200 && (!pts.length || !same(pts.at(-1), p)))
        pts.push(p);
      this.preview = null;
      this.redraw();
    }
    startDrawing() {
      if (!this.selected) return;
      this.draft = { ...this.record(this.selected), waypoints: [] };
      this.preview = null;
      this.world.tabIndex = -1;
      this.world.focus({ preventScroll: true });
      this.redraw();
    }
    finishDrawing() {
      if (!this.draft) return;
      this.state.routes[this.selected] = {
        ...this.draft,
        waypoints: this.draft.waypoints.map(snapped),
      };
      this.draft = null;
      this.preview = null;
      this.save();
      this.redraw();
    }
    geometry(c) {
      const state =
        this.draft && c.id === this.selected
          ? {
              ...this.draft,
              waypoints: [
                ...this.draft.waypoints,
                ...(this.preview ? [this.preview] : []),
              ],
            }
          : this.state.routes[c.id];
      return route(c.a, c.b, state, c.self);
    }
    addWaypoint(c, p) {
      const r = this.record(c.id),
        g = route(c.a, c.b, r, c.self),
        segment = [...g.segments].sort(
          (a, b) => distance(p, a) - distance(p, b),
        )[0];
      if (!segment) return;
      if (r.waypoints.some((w) => same(w, p))) return;
      r.waypoints.splice(segment.leg, 0, snapped(p));
      this.selected = c.id;
      this.save();
      this.redraw();
    }
    sync(connections) {
      this.connections = connections;
      if (!connections.some((c) => c.id === this.selected)) {
        this.selected = null;
        this.draft = null;
      }
      if (!this.layer.isConnected) this.world.append(this.layer);
      const selected = connections.find((c) => c.id === this.selected);
      this.label.textContent = selected ? selected.label : "點擊連線以調整";
      this.evidence.hidden = !selected?.evidence || !!this.draft;
      for (const b of [this.drawButton, this.reset])
        b.hidden = !selected || !!this.draft;
      for (const b of [this.finishButton, this.cancelButton])
        b.hidden = !this.draft;
      if (this.draft)
        this.status.textContent =
          "點格點逐點接線 · 點終點或 Enter 完成 · Esc 取消";
      if (!this.draft && this.status.textContent.startsWith("點格點"))
        this.status.textContent = "點線選取 · 雙擊線新增轉折 · 20 px 格點";
      this.world.classList.toggle("is-wiring", !!this.draft);
      const wantedHits = new Set(),
        wantedHandles = new Set();
      for (const c of connections) {
        wantedHits.add(c.id);
        let hit = this.hits.get(c.id);
        if (!hit) {
          hit = document.createElementNS(this.hitSvg.namespaceURI, "path");
          hit.classList.add("wire-hit");
          hit.setAttribute("tabindex", "0");
          hit.setAttribute("role", "button");
          hit.onclick = (e) => {
            e.stopPropagation();
            if (this.draft) this.addDraft(this.coordinates(e));
            else this.select(c.id);
          };
          hit.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!this.draft)
              this.addWaypoint(
                this.connections.find((x) => x.id === c.id),
                this.coordinates(e),
              );
          };
          hit.onkeydown = (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              if (this.draft) this.finishDrawing();
              else this.select(c.id);
            }
          };
          this.hitSvg.append(hit);
          this.hits.set(c.id, hit);
        }
        const g = this.geometry(c);
        if (c.path) {
          c.path.setAttribute("d", g.d);
          c.path.classList.toggle("wire-selected-path", c.id === this.selected);
        }
        hit.setAttribute("d", g.d);
        hit.classList.toggle("is-selected", c.id === this.selected);
        hit.setAttribute("aria-label", "選取連線：" + c.label);
        hit.dataset.edge = c.id;
        if (c.id !== this.selected) continue;
        const values = [
          ["from", g.from],
          ...g.waypoints.map((p, i) => ["point-" + i, p]),
          ["to", g.to],
        ];
        for (const [end, p] of values) {
          // Preview bends are never handles; only points explicitly placed by the user are shown.
          if (this.draft && end.startsWith("point-")) continue;
          const key = JSON.stringify([c.id, end]);
          wantedHandles.add(key);
          let h = this.handles.get(key);
          if (!h) {
            h = document.createElement("button");
            h.type = "button";
            h.className =
              "wire-handle " +
              (end.startsWith("point-")
                ? "wire-handle-joint"
                : "wire-handle-end");
            h.dataset.end = end;
            h.dataset.edge = c.id;
            this.layer.append(h);
            this.handles.set(key, h);
            this.bind(h, c.id, end);
          }
          h.style.left = p.x + "px";
          h.style.top = p.y + "px";
          h.setAttribute(
            "aria-label",
            c.label +
              "：" +
              (end === "from" ? "起點" : end === "to" ? "終點" : "自訂轉折點") +
              "；方向鍵沿格點移動，Delete 刪除轉折",
          );
        }
      }
      for (const [id, h] of this.hits)
        if (!wantedHits.has(id)) {
          h.remove();
          this.hits.delete(id);
        }
      for (const [key, h] of this.handles)
        if (!wantedHandles.has(key)) {
          h.remove();
          this.handles.delete(key);
        }
    }
    bind(handle, id, end) {
      const update = (p) => {
        const c = this.connections.find((c) => c.id === id);
        if (!c) return;
        const r = this.record(id);
        if (end.startsWith("point-"))
          r.waypoints[Number(end.slice(6))] = snapped(p);
        else r[end] = nearest(end === "from" ? c.a : c.b, p);
        this.redraw();
      };
      handle.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.draft) {
          if (end === "to") this.finishDrawing();
          return;
        }
        handle.setPointerCapture(e.pointerId);
        let moved = false;
        handle.onpointermove = (ev) => {
          moved = true;
          update(this.coordinates(ev));
        };
        handle.onpointerup = handle.onpointercancel = () => {
          handle.onpointermove = null;
          if (moved) this.save();
        };
      };
      handle.onclick = (e) => e.stopPropagation();
      handle.onkeydown = (e) => {
        if (e.key === "Escape") {
          this.deselect();
          return;
        }
        if (["Delete", "Backspace"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          if (end.startsWith("point-"))
            this.record(id).waypoints.splice(Number(end.slice(6)), 1);
          else delete this.record(id)[end];
          this.save();
          this.redraw();
          return;
        }
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        const c = this.connections.find((c) => c.id === id),
          g = this.geometry(c),
          p = end.startsWith("point-")
            ? g.waypoints[Number(end.slice(6))]
            : g[end],
          step = e.shiftKey ? GRID * 5 : GRID;
        update({
          x:
            p.x +
            (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0),
          y:
            p.y +
            (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0),
        });
        this.save();
      };
    }
  }
  const api = {
    GRID,
    snap,
    snapped,
    hash,
    load,
    anchor,
    nearest,
    route,
    Editor,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.WireLayout = api;
})(globalThis);
