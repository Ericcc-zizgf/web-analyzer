/* Reading scope is separate from source evidence. Hidden content is counted, never deleted. */
window.AnalysisScope = (() => {
  let project = null,
    pages = [],
    catalog = new Map(),
    usage = new Map(),
    mode = "overview",
    currentPage = "",
    active = new Set();
  try {
    const saved = localStorage.getItem("web-analyzer:reading-mode");
    if (["overview", "trace", "detail"].includes(saved)) mode = saved;
  } catch {}
  const config = () =>
    ({
      overview: { name: "概覽", nodes: 8, rules: 8 },
      trace: { name: "追查", nodes: 16, rules: 20 },
      detail: { name: "詳細", nodes: 40, rules: 70 },
    })[mode];
  function emit(type = "analysis:scope") {
    window.dispatchEvent(new CustomEvent(type));
  }
  function setProject(report, profiles) {
    project = report;
    pages = profiles;
    catalog = new Map();
    usage = new Map();
    currentPage = "";
    active = new Set();
    const files = new Map(report.files.map((f) => [f.path, f])),
      out = new Map();
    for (const link of report.links || []) {
      if (link.kind === "頁面連結" || !link.target) continue;
      if (!out.has(link.from)) out.set(link.from, []);
      out.get(link.from).push(link.target);
    }
    for (const page of pages) {
      const seen = new Set(),
        queue = [page.path];
      for (let i = 0; i < queue.length; i++)
        for (const path of out.get(queue[i]) || []) {
          if (seen.has(path)) continue;
          const file = files.get(path);
          if (
            !file ||
            ![
              "css",
              "scss",
              "sass",
              "less",
              "js",
              "mjs",
              "cjs",
              "jsx",
              "ts",
              "tsx",
            ].includes(file.kind)
          )
            continue;
          seen.add(path);
          queue.push(path);
        }
      catalog.set(page.path, [...seen]);
      for (const path of seen) {
        if (!usage.has(path)) usage.set(path, new Set());
        usage.get(path).add(page.path);
      }
    }
    emit("analysis:project");
  }
  function setPage(report) {
    currentPage = report.source_label;
    active = new Set([
      currentPage,
      ...(catalog.get(currentPage) || []),
      ...report.files.filter((f) => f.loaded).map((f) => f.label),
    ]);
    emit();
  }
  function setMode(value) {
    if (!["overview", "trace", "detail"].includes(value)) return;
    mode = value;
    try {
      localStorage.setItem("web-analyzer:reading-mode", mode);
    } catch {}
    emit();
  }
  const isLibrary = (n) =>
    /(?:^|\/)(?:node_modules|vendor|vendors|dist|build)\/|(?:^|\/)(?:jquery|bootstrap|react(?:-dom)?|vue|lodash)(?:[.\/-]|$)|\.min\.[cm]?js$/i.test(
      n.file || "",
    );
  function graph(
    input,
    { event = "", focus = "", libraries = false, possible = false } = {},
  ) {
    const allowed = input.nodes.filter(
      (n) =>
        (!active.size || active.has(n.file) || n.file === "HTML 事件屬性") &&
        (libraries || !isLibrary(n)),
    );
    const ids = new Set(allowed.map((n) => n.id));
    let edges = input.edges.filter(
      (e) =>
        ids.has(e.from) &&
        ids.has(e.to) &&
        (possible || e.certainty !== "possible"),
    );
    let wanted = new Set(ids);
    if (event && ids.has(event)) {
      wanted = new Set([event]);
      const queue = [event];
      for (let i = 0; i < queue.length; i++)
        for (const e of edges)
          if (e.from === queue[i] && !wanted.has(e.to)) {
            wanted.add(e.to);
            queue.push(e.to);
          }
      const ancestors = [event];
      for (let i = 0; i < ancestors.length; i++)
        for (const e of edges)
          if (e.to === ancestors[i] && !wanted.has(e.from)) {
            const n = allowed.find((n) => n.id === e.from);
            if (n && ["bindings", "events", "selectors"].includes(n.kind)) {
              wanted.add(e.from);
              ancestors.push(e.from);
            }
          }
    }
    if (focus && wanted.has(focus)) {
      const near = new Set([focus]);
      for (const e of edges)
        if (e.from === focus || e.to === focus) {
          near.add(e.from);
          near.add(e.to);
        }
      wanted = new Set([...wanted].filter((id) => near.has(id)));
    }
    const nodes = allowed.filter((n) => wanted.has(n.id));
    if(focus)nodes.sort((a,b)=>Number(b.id===focus)-Number(a.id===focus));
    edges = edges.filter((e) => wanted.has(e.from) && wanted.has(e.to));
    return {
      ...input,
      nodes,
      edges,
      hiddenNodes: input.nodes.length - nodes.length,
      hiddenEdges: input.edges.length - edges.length,
    };
  }
  return {
    setProject,
    setPage,
    setMode,
    config,
    graph,
    isLibrary,
    mode: () => mode,
    page: () => currentPage,
    project: () => project,
    pages: () => pages,
    resources: (path) => catalog.get(path) || [],
    users: (path) => [...(usage.get(path) || [])],
    shared: (path) => (usage.get(path)?.size || 0) > 1,
  };
})();
