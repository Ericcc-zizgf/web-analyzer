/* Preview-only CSS changes, grouped history and source-bound local drafts. */
window.CSSSession = (() => {
  let doc = null,
    observer = null,
    baseline = new Map(),
    current = new Map(),
    undo = [],
    redo = [],
    comparing = false,
    key = "",
    message = "",
    timer = 0;
  const safeStyle = (s) => !/[{}]|url\s*\(|@import/i.test(s || "");
  const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++)
      h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36);
  };
  const nodes = () => [
    ...(doc?.querySelectorAll("[data-web-analyzer-node]") || []),
  ];
  const snapshot = () =>
    new Map(
      nodes().map((e) => [e.dataset.webAnalyzerNode, e.getAttribute("style")]),
    );
  const equal = (a, b) =>
    a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
  function notify(kind) {
    window.dispatchEvent(
      new CustomEvent("css-session:change", { detail: { kind } }),
    );
  }
  function observe() {
    observer?.observe(doc.documentElement, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["style"],
      subtree: true,
    });
  }
  function apply(state) {
    observer?.disconnect();
    for (const e of nodes()) {
      const v = state.get(e.dataset.webAnalyzerNode);
      if (v == null) e.removeAttribute("style");
      else e.setAttribute("style", v);
    }
    observe();
  }
  function persist() {
    if (!key) return;
    try {
      const changes = [...current]
        .filter(([id, v]) => v !== baseline.get(id))
        .map(([id, style]) => ({ id, style, original: baseline.get(id) }));
      if (changes.length)
        localStorage.setItem(key, JSON.stringify({ version: 1, changes }));
      else localStorage.removeItem(key);
      message = changes.length
        ? "草稿已儲存在此瀏覽器"
        : "目前沒有未匯出的修改";
    } catch {
      message = "瀏覽器無法儲存草稿，請先匯出 CSS";
    }
  }
  function capture() {
    if (comparing || !doc) return;
    const next = snapshot();
    if (equal(next, current)) return;
    const changed = [...next]
        .filter(([id, v]) => v !== current.get(id))
        .map(([id]) => id),
      now = Date.now(),
      last = undo.at(-1);
    const caption = changed
      .map((id) => {
        const e = nodes().find((n) => n.dataset.webAnalyzerNode === id);
        return e ? e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") : id;
      })
      .join("、");
    if (last && now - last.time < 650 && last.ids.join() === changed.join()) {
      last.after = next;
      last.time = now;
    } else {
      undo.push({
        before: new Map(current),
        after: next,
        ids: changed,
        time: now,
        label: "調整 " + caption,
      });
      if (undo.length > 100) undo.shift();
    }
    current = next;
    redo = [];
    clearTimeout(timer);
    timer = setTimeout(() => {
      persist();
      notify("save");
    }, 350);
    notify("edit");
  }
  function attach(nextDoc, report) {
    if (doc === nextDoc) return;
    if (doc) {
      capture();
      persist();
    }
    clearTimeout(timer);
    observer?.disconnect();
    observer = null;
    doc = nextDoc;
    baseline = snapshot();
    current = new Map(baseline);
    undo = [];
    redo = [];
    comparing = false;
    key =
      "web-analyzer:css-draft:v1:" +
      hash(
        JSON.stringify([
          report.source_label,
          report.files.map((f) => [f.kind, f.label, f.source || ""]),
          report.nodes.map((n) => [n.tag, n.attrs]),
        ]),
      );
    message = "目前沒有未匯出的修改";
    try {
      const raw = JSON.parse(localStorage.getItem(key));
      if (raw?.version === 1 && Array.isArray(raw.changes)) {
        const restored = new Map(baseline);
        for (const c of raw.changes)
          if (
            baseline.has(c.id) &&
            baseline.get(c.id) === c.original &&
            (c.style === null ||
              (typeof c.style === "string" && safeStyle(c.style)))
          )
            restored.set(c.id, c.style);
        if (!equal(restored, baseline)) {
          apply(restored);
          current = restored;
          undo.push({
            before: new Map(baseline),
            after: new Map(current),
            ids: [],
            time: 0,
            label: "恢復上次的 CSS 草稿",
          });
          message = "已恢復此來源的 CSS 草稿";
        }
      }
    } catch {
      message = "草稿無法讀取，使用原始設定";
    }
    doc.addEventListener("keydown", (e) => {
      if (
        !(e.ctrlKey || e.metaKey) ||
        e.altKey ||
        e.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? forward() : back();
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        forward();
      }
    });
    observer = new MutationObserver(capture);
    observe();
    notify("attach");
  }
  function back() {
    capture();
    if (comparing) return;
    const action = undo.pop();
    if (!action) return;
    redo.push(action);
    current = new Map(action.before);
    apply(current);
    persist();
    notify("history");
  }
  function forward() {
    capture();
    if (comparing) return;
    const action = redo.pop();
    if (!action) return;
    undo.push(action);
    current = new Map(action.after);
    apply(current);
    persist();
    notify("history");
  }
  function compare() {
    capture();
    comparing = !comparing;
    apply(comparing ? baseline : current);
    notify("compare");
  }
  function reset() {
    capture();
    if (comparing) {
      comparing = false;
      apply(current);
    }
    const before = new Map(current);
    if (equal(before, baseline)) return;
    current = new Map(baseline);
    undo.push({
      before,
      after: new Map(current),
      ids: [],
      time: 0,
      label: "還原所有 CSS 修改",
    });
    redo = [];
    apply(current);
    persist();
    notify("history");
  }
  function selector(e) {
    if (
      e.id &&
      doc.querySelectorAll("#" + doc.defaultView.CSS.escape(e.id)).length === 1
    )
      return "#" + doc.defaultView.CSS.escape(e.id);
    const parts = [];
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      const tag = n.tagName.toLowerCase();
      const siblings = n.parentElement
        ? [...n.parentElement.children].filter((x) => x.tagName === n.tagName)
        : [n];
      parts.unshift(tag + ":nth-of-type(" + (siblings.indexOf(n) + 1) + ")");
    }
    return parts.join(" > ");
  }
  function changes() {
    const result = [];
    for (const [id, after] of current) {
      const before = baseline.get(id);
      if (before === after) continue;
      const e = nodes().find((n) => n.dataset.webAnalyzerNode === id);
      if (!e) continue;
      const a = doc.createElement("div").style,
        b = doc.createElement("div").style;
      a.cssText = before || "";
      b.cssText = after || "";
      const props = new Set([
        ...Array.from({ length: a.length }, (_, i) => a[i]),
        ...Array.from({ length: b.length }, (_, i) => b[i]),
      ]);
      const delta = [];
      for (const p of props)
        if (
          a.getPropertyValue(p) !== b.getPropertyValue(p) ||
          a.getPropertyPriority(p) !== b.getPropertyPriority(p)
        )
          delta.push({
            property: p,
            before: a.getPropertyValue(p) || "原始樣式表／預設",
            after: b.getPropertyValue(p) || "移除行內覆寫",
            priority: b.getPropertyPriority(p),
            removed: !b.getPropertyValue(p),
          });
      if (delta.length)
        result.push({ selector: selector(e), properties: delta });
    }
    return result;
  }
  function exportCSS() {
    capture();
    const text = changes()
      .map(
        (c) =>
          c.selector +
          " {\n" +
          c.properties
            .map((p) =>
              p.removed
                ? "  /* " +
                  p.property +
                  ": 已移除行內設定；請同步移除原始行內屬性。 */"
                : "  " +
                  p.property +
                  ": " +
                  p.after +
                  (p.priority ? " !" + p.priority : "") +
                  ";",
            )
            .join("\n") +
          "\n}",
      )
      .join("\n\n");
    const blob = new Blob(
        [
          "/* 網頁分析器：本次預覽 CSS 修改；套用前請確認選擇器範圍。 */\n" +
            text +
            "\n",
        ],
        { type: "text/css;charset=utf-8" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "preview-changes.css";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const target = e.target;
    if (target.closest('input,textarea,select,[contenteditable="true"]'))
      return;
    if (e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? forward() : back();
    } else if (e.key.toLowerCase() === "y") {
      e.preventDefault();
      forward();
    }
  });
  window.addEventListener("pagehide", () => {
    capture();
    persist();
  });
  return {
    attach,
    undo: back,
    redo: forward,
    compare,
    reset,
    exportCSS,
    changes,
    isModified(e, property) {
      const id = e.dataset.webAnalyzerNode;
      const before = doc.createElement("div").style,
        after = doc.createElement("div").style;
      before.cssText = baseline.get(id) || "";
      after.cssText = current.get(id) || "";
      return (
        before.getPropertyValue(property) !==
          after.getPropertyValue(property) ||
        before.getPropertyPriority(property) !==
          after.getPropertyPriority(property)
      );
    },
    originalStyle: (e) =>
      baseline.has(e.dataset.webAnalyzerNode)
        ? baseline.get(e.dataset.webAnalyzerNode)
        : e.getAttribute("style") || null,
    state: () => ({
      undo: undo.length,
      redo: redo.length,
      comparing,
      message,
      history: undo
        .slice(-15)
        .reverse()
        .map((a) => a.label),
      count: changes().length,
    }),
    flush: capture,
  };
})();
