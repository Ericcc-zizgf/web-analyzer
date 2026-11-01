/* Collapse references into whole functions. No individual statements become graph nodes. */
(function (scope) {
  "use strict";
  function project(index, result) {
    const related = new Map(result.results.map((r) => [r.id, r]));
    const nodes = result.results.filter(
      (r) =>
        r.type === "function" ||
        r.type === "event" ||
        r.type === "inline-event" ||
        (r.type === "binding" && r.domBinding),
    );
    for (const r of result.results)
      if (
        r.type === "selector" &&
        !nodes.some(
          (n) =>
            n.type === "binding" &&
            n.file === r.file &&
            n.start <= r.start &&
            n.end >= r.end,
        )
      ) {
        if (
          result.results.some(
            (n) =>
              n.type === "event" &&
              n.file === r.file &&
              n.start <= r.start &&
              n.end >= r.end,
          )
        )
          nodes.push(r);
      }
    const nodeIDs = new Set(nodes.map((n) => n.id)),
      outgoing = new Map(),
      edges = [];
    for (const e of index.edges) {
      if (!outgoing.has(e.from)) outgoing.set(e.from, []);
      outgoing.get(e.from).push(e);
    }
    function add(from, to, label, certainty = "confirmed", via = []) {
      if (!from || !to) return;
      const old = edges.find((e) => e.from === from.id && e.to === to.id);
      if (old) {
        if (label.includes("呼叫")) old.label = label;
        if (certainty === "confirmed") old.certainty = certainty;
        return;
      }
      edges.push({ from: from.id, to: to.id, label, certainty, via });
    }
    for (const node of nodes) {
      if (node.type === "function" || node.type === "event")
        for (const e of outgoing.get(node.id) || []) {
          const target = related.get(e.to);
          if (target?.type === "binding" && target.domBinding)
            add(
              target,
              node,
              node.type === "event" ? "登記事件" : "使用元件變數",
              node.certainty,
            );
        }
      const queue = [
          {
            id: node.id,
            called: false,
            uncertain: node.certainty === "possible",
            via: [],
          },
        ],
        seen = new Set();
      for (let i = 0; i < queue.length; i++) {
        const step = queue[i],
          key = step.id + ":" + step.called;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const e of outgoing.get(step.id) || []) {
          if (!related.has(e.to) || e.reason === "此位置所屬函式") continue;
          const target = related.get(e.to),
            called = step.called || /靜態函式|命名空間/.test(e.reason),
            uncertain =
              step.uncertain ||
              e.certainty === "possible" ||
              target.certainty === "possible";
          const via = ["import", "export"].includes(target.type)
            ? [
                ...step.via,
                { file: target.file, line: target.line, column: target.column },
              ]
            : step.via;
          if (nodeIDs.has(target.id)) {
            if (target.type === "binding") {
              if (node.type === "binding" && target.id !== node.id)
                add(target, node, "元件變數參照", uncertain ? "possible" : "confirmed");
              continue;
            }
            if (target.id === node.id && !called) continue;
            const label =
              target.id === node.id
                ? "遞迴呼叫"
                : node.type === "event"
                  ? "事件處理函式"
                  : target.type === "event"
                    ? "登記事件"
                    : called
                      ? target.file !== node.file
                        ? "跨檔案呼叫"
                        : "呼叫"
                      : "函式引用";
            add(node, target, label, uncertain ? "possible" : "confirmed", via);
            continue;
          }
          if (
            ["call", "reference", "import", "export", "binding", "selector"].includes(
              target.type,
            )
          )
            queue.push({ id: target.id, called, uncertain, via });
        }
      }
    }
    for (const n of nodes)
      if (n.type === "selector")
        for (const event of nodes)
          if (
            event.type === "event" &&
            event.file === n.file &&
            event.start <= n.start &&
            event.end >= n.end
          )
            add(n, event, "取得元件並登記事件", event.certainty);
    for (const fn of nodes)
      if (
        fn.type === "function" &&
        fn.owner &&
        nodeIDs.has(fn.owner) &&
        !edges.some((e) => e.to === fn.id)
      )
        add(related.get(fn.owner), fn, "內部函式（未確認呼叫）", fn.certainty);
    for (const event of nodes)
      if (event.type === "inline-event") {
        const called = /^\s*(?:return\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(
          event.value || "",
        );
        if (called)
          for (const fn of nodes)
            if (fn.type === "function" && fn.name === called[1])
              add(event, fn, "行內事件的同名函式（待確認全域綁定）", "possible");
      }
    const columns = new Map(),
      walk = [];
    for (const n of nodes)
      if (n.type !== "function") {
        columns.set(n.id, ["event", "inline-event"].includes(n.type) ? 1 : 0);
        walk.push(n.id);
      }
    for (let i = 0; i < walk.length; i++)
      for (const edge of edges.filter((e) => e.from === walk[i]))
        if (!columns.has(edge.to)) {
          columns.set(
            edge.to,
            Math.min(8, Math.max(2, (columns.get(edge.from) || 0) + 1)),
          );
          walk.push(edge.to);
        }
    for (const n of nodes) n.column = columns.get(n.id) ?? 2;
    const order = { binding: 0, selector: 0, event: 1, "inline-event": 1, function: 2 };
    nodes.sort(
      (a, b) =>
        order[a.type] - order[b.type] ||
        a.file.localeCompare(b.file) ||
        a.start - b.start,
    );
    const visible = result.results.filter(
      (r) =>
        ![
          "parameter",
          "reference",
          "literal",
          "call",
          "write",
          "import",
          "export",
          "jsx",
          "text",
        ].includes(r.type) &&
        !(r.type === "binding" && !r.domBinding) &&
        r.type !== "selector",
    );
    return {
      nodes,
      edges,
      results: visible,
      detailCount: result.results.length - visible.length,
    };
  }
  const api = { project };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.FunctionFlow = api;
})(globalThis);
