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
      edges = [],
      edgeMap = new Map();
    for (const e of index.edges) {
      if (!outgoing.has(e.from)) outgoing.set(e.from, []);
      outgoing.get(e.from).push(e);
    }
    function evidence(records, reason, certainty) {
      return records.filter(Boolean).map((r) => ({ ...r, certainty, reasons: [reason] }));
    }
    function add(from, to, label, certainty = "confirmed", via = [], proof = []) {
      if (!from || !to) return;
      const key = from.id + ":" + to.id,
        old = edgeMap.get(key);
      const items = evidence(proof, label, certainty);
      if (old) {
        if (label.includes("呼叫") && !old.label.includes("呼叫")) {
          old.label = label;
          old.evidence = items;
        } else
          for (const item of items)
            if (!old.evidence.some((r) => r.id === item.id)) old.evidence.push(item);
        if (certainty === "confirmed") old.certainty = certainty;
        for (const item of via)
          if (!old.via.some((r) => r.file === item.file && r.line === item.line))
            old.via.push(item);
        return;
      }
      const edge = { from: from.id, to: to.id, label, certainty, via, evidence: items };
      edges.push(edge);
      edgeMap.set(key, edge);
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
              [],
              node.type === "event"
                ? [node]
                : [...related.values()].filter(
                    (r) =>
                      r.type === "reference" &&
                      r.owner === node.id &&
                      (outgoing.get(r.id) || []).some((e) => e.to === target.id),
                  ),
            );
        }
      const queue = [
          {
            id: node.id,
            called: false,
            uncertain: node.certainty === "possible",
            via: [],
            proof: [],
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
          const reexports =
            target.type === "import"
              ? (outgoing.get(target.id) || [])
                  .filter((e) => e.reason === "經過的轉匯出位置")
                  .map((e) => related.get(e.to))
                  .filter(Boolean)
              : [];
          const proof = [
            "call",
            "event",
            "inline-event",
            "reference",
            "import",
            "export",
            "selector",
          ].includes(target.type)
            ? [...step.proof, target, ...reexports]
            : step.proof;
          const via = ["import", "export"].includes(target.type)
            ? [
                ...step.via,
                ...reexports.map((r) => ({
                  file: r.file,
                  line: r.line,
                  column: r.column,
                })),
                { file: target.file, line: target.line, column: target.column },
              ]
            : step.via;
          if (nodeIDs.has(target.id)) {
            if (target.type === "binding") {
              if (node.type === "binding" && target.id !== node.id)
                add(
                  target,
                  node,
                  "元件變數參照",
                  uncertain ? "possible" : "confirmed",
                  via,
                  proof,
                );
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
            const preferred = proof.filter(
              (r) =>
                r.type !== "reference" ||
                !proof.some((p) => ["call", "event"].includes(p.type)),
            );
            add(
              node,
              target,
              label,
              uncertain ? "possible" : "confirmed",
              via,
              node.type === "event"
                ? [node, ...preferred]
                : preferred.length
                  ? preferred
                  : [node],
            );
            continue;
          }
          if (
            ["call", "reference", "import", "export", "binding", "selector"].includes(
              target.type,
            )
          )
            queue.push({ id: target.id, called, uncertain, via, proof });
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
            add(n, event, "取得元件並登記事件", event.certainty, [], [event]);
    for (const fn of nodes)
      if (
        fn.type === "function" &&
        fn.owner &&
        nodeIDs.has(fn.owner) &&
        !edges.some((e) => e.to === fn.id)
      )
        add(related.get(fn.owner), fn, "內部函式（未確認呼叫）", "possible", [], [fn]);
    for (const event of nodes)
      if (event.type === "inline-event") {
        const called = /^\s*(?:return\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(
          event.value || "",
        );
        if (called)
          for (const fn of nodes)
            if (fn.type === "function" && fn.name === called[1])
              add(
                event,
                fn,
                "行內事件的同名函式（待確認全域綁定）",
                "possible",
                [],
                [event],
              );
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
  // Derive a view without deleting the complete graph or duplicating shared functions.
  function view(graph, expanded = new Set(), all = false, limit = 40) {
    const map = new Map(graph.nodes.map((n) => [n.id, n])),
      incoming = new Map(),
      outgoing = new Map();
    for (const e of graph.edges) {
      if (!map.has(e.from) || !map.has(e.to)) continue;
      if (!incoming.has(e.to)) incoming.set(e.to, []);
      incoming.get(e.to).push(e);
      if (!outgoing.has(e.from)) outgoing.set(e.from, []);
      outgoing.get(e.from).push(e);
    }
    const wanted = new Set(
      graph.nodes.filter((n) => n.type !== "function").map((n) => n.id),
    );
    for (const n of graph.nodes)
      if (n.type === "function") {
        const ins = incoming.get(n.id) || [];
        if (
          ins.some((e) => ["event", "inline-event"].includes(map.get(e.from)?.type)) ||
          !ins.some((e) => map.get(e.from)?.type === "function" && e.from !== n.id)
        )
          wanted.add(n.id);
      }
    if (!wanted.size && graph.nodes.length) wanted.add(graph.nodes[0].id);
    const queue = [...wanted];
    for (let i = 0; i < queue.length; i++)
      if (all || expanded.has(queue[i]))
        for (const e of outgoing.get(queue[i]) || [])
          if (!wanted.has(e.to)) {
            wanted.add(e.to);
            queue.push(e.to);
          }
    if (all) for (const n of graph.nodes) wanted.add(n.id);
    const candidates = graph.nodes.filter((n) => wanted.has(n.id)),
      nodes = candidates.slice(0, limit),
      ids = new Set(nodes.map((n) => n.id));
    return {
      nodes,
      edges: graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
      hidden: graph.nodes.length - nodes.length,
      remaining: candidates.length - nodes.length,
      incoming,
      outgoing,
    };
  }
  const api = { project, view };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.FunctionFlow = api;
})(globalThis);
