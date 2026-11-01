/* Static component relationships. Edges express binding, calls and containment, not execution order. */
(function (scope) {
  "use strict";
  function build(report, results, matches) {
    const nodes = [],
      edges = [],
      warnings = [],
      seen = new Map();
    let omitted = 0;
    const add = (key, data) => {
      if (seen.has(key)) return seen.get(key);
      if (nodes.length >= 180) {
        omitted++;
        return null;
      }
      const value = { id: key, ...data };
      nodes.push(value);
      seen.set(key, value);
      return value;
    };
    const link = (a, b, label) => {
      if (
        a &&
        b &&
        a.id !== b.id &&
        !edges.some((e) => e.from === a.id && e.to === b.id && e.label === label)
      )
        edges.push({ from: a.id, to: b.id, label });
    };
    for (const event of report.inline_events || []) {
      if (!matches(null, event.target_node)) continue;
      add("inline:" + event.target_node + ":" + event.event, {
        kind: "events",
        title: "on" + event.event,
        source: event.code,
        file: "HTML 事件屬性",
        line: event.line,
        note: "內嵌事件；字串中的函式呼叫尚未連結",
      });
    }
    for (const file of report.files.filter((f) => f.kind === "js")) {
      const parsed = results.find((r) => r.id === file.id);
      if (!file.loaded || !parsed || parsed.error) {
        warnings.push(
          file.label + "：" + (file.error || parsed?.error || "尚未完成語法解析"),
        );
        continue;
      }
      if (parsed.truncated?.length || parsed.dependenciesTruncated)
        warnings.push(file.label + "：部分語法項目超過分析上限");
      const functions = parsed.functions || [],
        calls = parsed.calls || [];
      const owner = (item) =>
        functions
          .filter((f) => f.start <= item.start && f.end >= item.end && f !== item)
          .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
      const itemNode = (kind, item) =>
        add(file.id + ":" + kind + ":" + item.start, {
          kind,
          title:
            kind === "bindings"
              ? "變數 " + item.name
              : kind === "functions"
                ? item.name + "(" + item.params.join(", ") + ")"
                : kind === "events"
                  ? item.event + " → " + (item.target || item.receiver)
                  : kind === "calls"
                    ? item.name + "()"
                    : kind === "selectors"
                      ? item.method + " " + item.selector
                      : (item.api || kind) +
                        (item.key ? " · " + item.key : "") +
                        (item.url ? " " + item.url : ""),
          source:
            (kind === "bindings" ? (item.declarationKind || "const") + " " : "") +
            file.source.slice(item.start, item.end),
          file: file.label,
          line: item.line,
          endLine: item.endLine,
          note:
            kind === "calls" && item.resolvedStart === undefined
              ? "呼叫目標未確認（可能為匯入、動態或外部函式）"
              : "",
        });
      const selected = (item) =>
        (item.relatedTargets || [item.target || item.selector]).some((s) => matches(s));
      const bound = new Set();
      const includeDependencies = (item) => {
        for (const start of item.dependencyStarts || []) {
          const binding = (parsed.bindings || []).find((b) => b.start === start);
          if (!binding || bound.has(binding)) continue;
          bound.add(binding);
          link(
            itemNode("bindings", binding),
            itemNode(item.kind || "functions", item),
            "使用變數",
          );
          includeDependencies({ ...binding, kind: "bindings" });
        }
      };
      const active = new Set(),
        queue = [];
      const includeFunction = (fn, from, label) => {
        if (!fn) return;
        const node = itemNode("functions", fn);
        link(from, node, label);
        if (!active.has(fn)) {
          active.add(fn);
          queue.push(fn);
        }
      };
      for (const event of parsed.events || [])
        if (selected(event)) {
          const n = itemNode("events", event);
          includeDependencies({ ...event, kind: "events" });
          const fn = functions.find(
            (f) =>
              f.start === event.resolvedHandlerStart ||
              (event.resolvedHandlerStart === undefined &&
                f.start === event.handlerStart &&
                f.end === event.handlerEnd),
          );
          if (fn) includeFunction(fn, n, "事件回呼");
          else if (n) n.note = "事件回呼目標尚未確認";
        }
      for (const fn of functions) if (selected(fn)) includeFunction(fn, null, "");
      for (let i = 0; i < queue.length; i++) {
        const fn = queue[i],
          parent = itemNode("functions", fn);
        includeDependencies({ ...fn, kind: "functions" });
        for (const call of calls)
          if (owner(call) === fn) {
            const n = itemNode("calls", call);
            link(parent, n, "呼叫");
            includeFunction(
              functions.find((f) => f.start === call.resolvedStart),
              n,
              "函式定義",
            );
          }
      }
      for (const kind of ["selectors", "network", "writes", "storage", "timers"])
        for (const item of parsed[kind] || []) {
          const fn = owner(item);
          if (selected(item) || active.has(fn)) {
            includeDependencies({ ...item, kind });
            link(
              fn && active.has(fn) ? itemNode("functions", fn) : null,
              itemNode(kind, item),
              "函式內包含",
            );
          }
        }
    }
    if (omitted)
      warnings.push("流程圖達 180 個節點上限，另有項目未顯示。請縮小至子元件分析。");
    return { nodes, edges, warnings };
  }
  const api = { build };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.ComponentFlow = api;
})(globalThis);
