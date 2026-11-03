/* Editable visual routes. Analysis relationships and evidence are never changed. */
(function (scope) {
  "use strict";
  const PREFIX = "web-analyzer:layout:v1:";
  const finite = (n) => Number.isFinite(n) && Math.abs(n) <= 1000000;
  const point = (p) => p && finite(p.x) && finite(p.y);
  const clamp = (n) => Math.max(0, Math.min(1, n));
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++)
      h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36);
  }
  function load(storage, key) {
    try {
      const raw = JSON.parse(storage.getItem(PREFIX + key));
      if (raw?.version !== 1) return { version: 1, nodes: {}, routes: {} };
      const nodes = {},
        routes = {};
      for (const [id, p] of Object.entries(raw.nodes || {}))
        if (point(p)) nodes[id] = { x: p.x, y: p.y };
      for (const [id, r] of Object.entries(raw.routes || {})) {
        if (!r || typeof r !== "object") continue;
        const route = {
          style: r.style === "orthogonal" ? "orthogonal" : "curve",
        };
        for (const end of ["from", "to"])
          if (
            r[end] &&
            ["left", "right", "top", "bottom"].includes(r[end].side) &&
            finite(r[end].t)
          )
            route[end] = { side: r[end].side, t: clamp(r[end].t) };
        if (point(r.via)) route.via = { x: r.via.x, y: r.via.y };
        routes[id] = route;
      }
      return { version: 1, nodes, routes };
    } catch {
      return { version: 1, nodes: {}, routes: {} };
    }
  }
  function anchor(box, value, side) {
    const a = value || { side, t: Math.min(0.9, 25 / box.height) };
    const horizontal = a.side === "top" || a.side === "bottom";
    return {
      x:
        box.x +
        (horizontal ? box.width * a.t : a.side === "right" ? box.width : 0),
      y:
        box.y +
        (horizontal
          ? a.side === "bottom"
            ? box.height
            : 0
          : box.height * a.t),
      dx: a.side === "right" ? 1 : a.side === "left" ? -1 : 0,
      dy: a.side === "bottom" ? 1 : a.side === "top" ? -1 : 0,
    };
  }
  function nearest(box, p) {
    const x = clamp((p.x - box.x) / box.width),
      y = clamp((p.y - box.y) / box.height);
    return [
      { side: "left", t: y, d: Math.abs(p.x - box.x) },
      { side: "right", t: y, d: Math.abs(p.x - box.x - box.width) },
      { side: "top", t: x, d: Math.abs(p.y - box.y) },
      { side: "bottom", t: x, d: Math.abs(p.y - box.y - box.height) },
    ]
      .sort((a, b) => a.d - b.d)
      .map(({ side, t }) => ({ side, t }))[0];
  }
  function route(aBox, bBox, saved = {}, self = false) {
    const a = anchor(aBox, saved.from, "right"),
      b = anchor(bBox, saved.to, "left");
    const via = saved.via || {
      x: (a.x + b.x) / 2,
      y: self ? Math.max(12, aBox.y - 45) : (a.y + b.y) / 2,
    };
    let d;
    if (saved.style === "orthogonal") {
      const out = { x: a.x + a.dx * 28, y: a.y + a.dy * 28 },
        end = { x: b.x + b.dx * 28, y: b.y + b.dy * 28 };
      d = `M${a.x},${a.y} L${out.x},${out.y} L${via.x},${out.y} L${via.x},${via.y} L${end.x},${via.y} L${end.x},${end.y} L${b.x},${b.y}`;
    } else {
      const bend = Math.max(
        35,
        Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) / 3),
      );
      const tangent = a.x <= b.x ? 1 : -1;
      d = `M${a.x},${a.y} C${a.x + a.dx * bend},${a.y + a.dy * bend} ${via.x - (tangent * bend) / 2},${via.y} ${via.x},${via.y} C${via.x + (tangent * bend) / 2},${via.y} ${b.x + b.dx * bend},${b.y + b.dy * bend} ${b.x},${b.y}`;
    }
    return { d, from: a, to: b, via };
  }
  class Editor {
    constructor(world, toolbar, key, redraw) {
      this.world = world;
      this.redraw = redraw;
      this.editing = false;
      this.connections = [];
      this.layer = document.createElement("div");
      this.layer.className = "wire-edit-layer";
      this.controls = document.createElement("div");
      this.controls.className = "wire-toolbar";
      this.toggle = document.createElement("button");
      this.toggle.type = "button";
      this.toggle.textContent = "調整連線";
      this.toggle.setAttribute("aria-pressed", "false");
      this.select = document.createElement("select");
      this.select.setAttribute("aria-label", "選擇要調整的連線");
      this.style = document.createElement("select");
      this.style.setAttribute("aria-label", "所選連線的線型");
      this.style.innerHTML =
        '<option value="curve">曲線</option><option value="orthogonal">直角線</option>';
      this.reset = document.createElement("button");
      this.reset.type = "button";
      this.reset.textContent = "還原這條線";
      this.status = document.createElement("span");
      this.status.className = "wire-save-status";
      this.status.setAttribute("role", "status");
      this.controls.append(
        this.toggle,
        this.select,
        this.style,
        this.reset,
        this.status,
      );
      toolbar.append(this.controls);
      this.toggle.onclick = () => {
        this.editing = !this.editing;
        this.toggle.setAttribute("aria-pressed", String(this.editing));
        this.sync(this.connections);
      };
      this.select.onchange = () => {
        this.selected = this.select.value;
        this.sync(this.connections);
      };
      this.style.onchange = () => {
        if (!this.selected) return;
        this.record(this.selected).style = this.style.value;
        this.save();
        this.redraw();
      };
      this.reset.onclick = () => {
        delete this.state.routes[this.selected];
        this.save();
        this.redraw();
      };
      this.setScope(key);
    }
    setScope(key) {
      this.key = key;
      let storage;
      try {
        storage = scope.localStorage;
      } catch {}
      this.state = load(storage, key);
      this.selected = null;
      this.status.textContent = "配置儲存在此瀏覽器";
    }
    record(id) {
      return (this.state.routes[id] ||= { style: "curve" });
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
      this.state = { version: 1, nodes: {}, routes: {} };
      this.save();
      this.redraw();
    }
    sync(connections) {
      this.connections = connections;
      if (!connections.some((c) => c.id === this.selected))
        this.selected = connections[0]?.id;
      const signature = JSON.stringify(connections.map((c) => [c.id, c.label]));
      if (this.signature !== signature) {
        this.select.replaceChildren(
          ...connections.map((c) => {
            const o = document.createElement("option");
            o.value = c.id;
            o.textContent = c.label;
            return o;
          }),
        );
        this.signature = signature;
      }
      this.select.value = this.selected || "";
      this.style.value = this.state.routes[this.selected]?.style || "curve";
      for (const control of [this.select, this.style, this.reset])
        control.hidden = !this.editing;
      this.toggle.disabled = !connections.length;
      this.layer.hidden = !this.editing;
      if (!this.layer.isConnected) this.world.append(this.layer);
      const wanted = new Set();
      for (const c of connections) {
        const geometry = route(c.a, c.b, this.state.routes[c.id], c.self);
        for (const end of ["from", "via", "to"]) {
          if (end !== "via" && c.id !== this.selected) continue;
          const key = JSON.stringify([c.id, end]);
          wanted.add(key);
          let handle = [...this.layer.children].find(
            (h) => h.dataset.key === key,
          );
          if (!handle) {
            handle = document.createElement("button");
            handle.type = "button";
            handle.className = "wire-handle wire-handle-" + end;
            handle.dataset.key = key;
            this.layer.append(handle);
            this.bind(handle, c.id, end);
          }
          handle.dataset.edge = c.id;
          handle.dataset.end = end;
          handle.classList.toggle("is-selected", c.id === this.selected);
          handle.setAttribute(
            "aria-label",
            c.label +
              "：" +
              { from: "起點", to: "終點", via: "轉折點" }[end] +
              "，拖曳或用方向鍵調整；Delete 還原",
          );
          handle.title = handle.getAttribute("aria-label");
          handle.style.left = geometry[end].x + "px";
          handle.style.top = geometry[end].y + "px";
        }
      }
      for (const h of [...this.layer.children])
        if (!wanted.has(h.dataset.key)) h.remove();
    }
    bind(handle, id, end) {
      const update = (p) => {
        const c = this.connections.find((c) => c.id === id);
        if (!c) return;
        const r = this.record(id);
        r[end] =
          end === "via"
            ? { x: Math.max(0, p.x), y: Math.max(0, p.y) }
            : nearest(end === "from" ? c.a : c.b, p);
        this.redraw();
      };
      handle.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        this.selected = id;
        handle.setPointerCapture(e.pointerId);
        this.sync(this.connections);
        handle.onpointermove = (ev) => {
          const rect = this.world.getBoundingClientRect(),
            scale = rect.width / this.world.offsetWidth;
          update({
            x: (ev.clientX - rect.left) / scale,
            y: (ev.clientY - rect.top) / scale,
          });
        };
        handle.onpointerup = handle.onpointercancel = () => {
          handle.onpointermove = null;
          this.save();
        };
      };
      handle.onkeydown = (e) => {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          delete this.record(id)[end];
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
        this.selected = id;
        const c = this.connections.find((c) => c.id === id),
          p = route(c.a, c.b, this.state.routes[id], c.self)[end],
          step = e.shiftKey ? 20 : 5;
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
  const api = { hash, load, anchor, nearest, route, Editor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.WireLayout = api;
})(globalThis);
