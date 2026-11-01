/* One cancellable original-source index for the complete readable folder snapshot. */
window.LocatorIndex = (() => {
  const scriptURL = document.currentScript.src;
  let pagePath = null;
  let worker = null,
    serial = 0,
    seq = 0,
    files = new Map(),
    project = null,
    metadata = null,
    ready = Promise.resolve(),
    state = { phase: "empty", message: "請先選擇專案資料夾，或載入示範。" };
  const pending = new Map();
  function notify() {
    window.dispatchEvent(new CustomEvent("locator:state", { detail: state }));
  }
  function clear() {
    serial++;
    worker?.terminate();
    worker = null;
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("已取消或切換專案"));
    }
    pending.clear();
    files = new Map();
    pagePath = null;
    project = null;
    metadata = null;
    ready = Promise.resolve();
    state = { phase: "empty", message: "來源索引已清除。" };
    notify();
  }
  function call(type, data) {
    if (!worker) return Promise.reject(Error("位置索引尚未建立"));
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          pending.delete(id);
          reject(Error("位置索引逾時，請縮小專案範圍後重試。"));
          if (type === "build") {
            worker?.terminate();
            worker = null;
            state = { phase: "error", message: "位置索引逾時，並未完成全部檔案。" };
            notify();
          }
        },
        type === "build" ? 120000 : 30000,
      );
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, type, ...data });
    });
  }
  function start() {
    const generation = serial;
    state = { phase: "building", message: "正在建立原始碼位置與符號索引…" };
    notify();
    const url = new URL("locator-worker.js", scriptURL);
    url.search = new URL(scriptURL).search;
    worker = new Worker(url);
    worker.onmessage = (event) => {
      if (generation !== serial) return;
      const item = pending.get(event.data.id);
      if (!item) return;
      if (event.data.progress) {
        const p = event.data.progress;
        state = {
          phase: "building",
          message: `位置索引 ${p.done} / ${p.total} · ${p.path}`,
        };
        notify();
        return;
      }
      clearTimeout(item.timer);
      pending.delete(event.data.id);
      event.data.error
        ? item.reject(Error(event.data.error))
        : item.resolve(event.data.result);
    };
    worker.onerror = () => {
      if (generation !== serial) return;
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(Error("原始碼索引 Worker 無法啟動"));
      }
      pending.clear();
      state = {
        phase: "error",
        message: "原始碼索引 Worker 無法啟動，請透過 HTTP 開啟。",
      };
      notify();
    };
    ready = call("build", {
      files: [...files].map(([path, source]) => ({
        path,
        source,
        kind: path === pagePath ? "html" : undefined,
      })),
    })
      .then((result) => {
        if (generation !== serial) throw Error("來源已切換");
        metadata = result;
        state = {
          phase: "ready",
          message: `已索引 ${result.coverage.files} 個文字檔、${result.coverage.records} 個位置；${result.gaps.length} 項解析限制／缺口。`,
        };
        notify();
        return result;
      })
      .catch((e) => {
        if (generation === serial) {
          state = { phase: "error", message: e.message };
          notify();
        }
        throw e;
      });
    ready.catch(() => {});
  }
  function setProject(sources, report) {
    clear();
    project = report;
    files = new Map([...sources].filter(([, source]) => typeof source === "string"));
    start();
  }
  function setPage(report) {
    // Browser reports retain exact marker offsets. Backends may only map unique unchanged start tags.
    const tokens = window.SourceUtils.htmlTags(report.html);
    for (const node of report.nodes)
      if (!node.location) {
        const candidates = tokens.filter(
          (t) =>
            t.name === node.tag &&
            Object.entries(t.attrs).every(
              ([k, v]) => String(node.attrs[k] ?? "") === v,
            ) &&
            Object.keys(t.attrs).length === Object.keys(node.attrs).length,
        );
        if (candidates.length === 1)
          node.location = {
            start: candidates[0].start,
            end: candidates[0].end,
            line: candidates[0].line,
            kind: "unique-original-opening-tag",
          };
      }
    if (report.project && project) return;
    clear();
    pagePath = report.source_label;
    files.set(report.source_label, report.html);
    for (const f of report.files)
      if (f.loaded && !f.inline && typeof f.source === "string")
        files.set(f.label, f.source);
    start();
  }
  function active(report) {
    const set = new Set([report.source_label]);
    for (const f of report.files)
      if (f.loaded && !f.inline && !(f.kind === "css" && f.dependency)) set.add(f.label);
    // Expand only literal CSS imports. Other files stay possible, even when selectors happen to match.
    let changed = true;
    for (let pass = 0; changed && pass < 20; pass++) {
      changed = false;
      for (const path of [...set])
        if (/\.css$/i.test(path)) {
          for (const item of window.SourceUtils.cssImports(files.get(path) || "")) {
            try {
              const u = new URL(item.reference, "https://project.invalid/" + path);
              const target = decodeURIComponent(u.pathname).replace(/^\//, "");
              if (
                u.origin === "https://project.invalid" &&
                files.has(target) &&
                !set.has(target)
              ) {
                set.add(target);
                changed = true;
              }
            } catch {}
          }
        }
    }
    return [...set];
  }
  function match(element, selector) {
    try {
      return Boolean(
        element && (element.matches(selector) || element.querySelector(selector)),
      );
    } catch {
      return false;
    }
  }
  async function locate(context, includeChildren = true, seedIDs = []) {
    const generation = serial;
    await ready;
    if (generation !== serial) throw Error("來源已切換");
    if (!metadata) throw Error("位置索引尚未完成");
    const { report, node, descendants, element } = context;
    const targets = includeChildren ? descendants : [node],
      tokens = new Set();
    for (const n of targets) {
      if (n.attrs.id) tokens.add(n.attrs.id);
      for (const c of String(n.attrs.class || "").split(/\s+/)) if (c) tokens.add(c);
    }
    const selection = {
      file: report.source_label,
      htmlStarts: targets.flatMap((n) => (n.location ? [n.location.start] : [])),
      activeFiles: active(report),
      tokens: [...tokens],
      cssMatches: [],
      cssPossibleMatches: [],
      cssAncestorMatches: [],
      eventAncestorMatches: [],
      selectorMatches: [],
      seedIDs,
    };
    const ancestors = [];
    for (let p = element?.parentElement; p; p = p.parentElement) ancestors.push(p);
    for (const r of metadata.records) {
      if (r.type === "css") {
        if (
          includeChildren
            ? match(element, r.selector)
            : (() => {
                try {
                  return element?.matches(r.selector);
                } catch {
                  return false;
                }
              })()
        )
          selection.cssMatches.push(r.id);
        else {
          const base = r.selector
            .replace(/::[\w-]+(?:\([^)]*\))?/g, "")
            .replace(
              /:(?:hover|active|focus-visible|focus-within|focus|visited|checked|disabled|enabled|target)\b/g,
              "",
            );
          try {
            if (ancestors.some((p) => p.matches(r.selector)))
              selection.cssAncestorMatches.push(r.id);
          } catch {}
          if (
            base !== r.selector &&
            (includeChildren
              ? match(element, base)
              : (() => {
                  try {
                    return element?.matches(base);
                  } catch {
                    return false;
                  }
                })())
          )
            selection.cssPossibleMatches.push(r.id);
        }
      } else if (r.selector) {
        let selector = r.selector.value;
        if (r.selector.kind === "id") selector = "#" + CSS.escape(selector);
        else if (r.selector.kind === "classes")
          selector = selector
            .split(/\s+/)
            .filter(Boolean)
            .map((c) => "." + CSS.escape(c))
            .join("");
        let matched = false;
        try {
          matched = includeChildren
            ? match(element, selector)
            : Boolean(element?.matches(selector));
        } catch {}
        if (matched) selection.selectorMatches.push(r.id);
        else if (r.type === "event") {
          try {
            if (ancestors.some((p) => p.matches(selector)))
              selection.eventAncestorMatches.push(r.id);
          } catch {}
        }
      }
    }
    const result = await call("query", { selection });
    if (generation !== serial) throw Error("來源已切換");
    const fallbackFiles = new Set(
      metadata.gaps
        .filter((g) => /未建立語法|單檔元件|解析失敗|截斷|未索引/.test(g.reason))
        .map((g) => g.file),
    );
    let fallbackCount = 0,
      fallbackCapped = false;
    for (const [file, source] of files)
      if (fallbackFiles.has(file)) {
        const lines = [0];
        for (let i = 0; i < source.length; i++) if (source[i] === "\n") lines.push(i + 1);
        for (const token of [...tokens].slice(0, 50)) {
          let at = 0;
          while ((at = source.indexOf(token, at)) >= 0) {
            const start = at;
            at += Math.max(1, token.length);
            if (/[\w-]/.test(source[start - 1] || "") || /[\w-]/.test(source[at] || ""))
              continue;
            if (fallbackCount++ >= 500) {
              fallbackCapped = true;
              break;
            }
            let lo = 0,
              hi = lines.length;
            while (lo + 1 < hi) {
              const m = (lo + hi) >> 1;
              if (lines[m] <= start) lo = m;
              else hi = m;
            }
            result.results.push({
              id: "search:" + file + ":" + start,
              file,
              type: "text",
              name: token,
              start,
              end: at,
              line: lo + 1,
              column: start - lines[lo] + 1,
              endLine: lo + 1,
              certainty: "possible",
              reasons: ["未完整解析檔案中的同名文字，可能包含註解或範例；不推定框架關聯"],
            });
          }
          if (fallbackCapped) break;
        }
        if (fallbackCapped) break;
      }
    if (fallbackCapped || tokens.size > 50)
      result.gaps.push({
        file: "文字補查",
        reason:
          "同名文字補查最多 50 個元件名稱、500 個位置；請縮小元件範圍或使用全專案搜尋",
      });
    for (const f of project?.files || [])
      if (!files.has(f.path))
        result.gaps.push({
          file: f.path,
          reason:
            "未建立文字索引：" +
            (f.diagnostics?.join("；") || "非文字檔或無法讀取，只保留檔名與大小"),
        });
    const skipped = project?.skipped || [];
    result.gaps = [
      ...result.gaps,
      ...skipped.map((f) => ({ file: f.path, reason: "未讀取：" + f.reason })),
    ];
    for (const f of report.files)
      if (!f.loaded)
        result.gaps.push({
          file: f.label,
          reason: "本頁資源未取得：" + (f.error || "來源未載入"),
        });
    if (!node.location)
      result.gaps.unshift({
        file: report.source_label,
        reason:
          "目前元素無法唯一對應原始開啟標籤（可能由 HTML 解析器補建）；不提供猜測的 HTML 行號",
      });
    result.sourceCount = files.size;
    result.scope = report.project
      ? "整個已選取資料夾的可讀取文字檔"
      : "此頁 HTML 與已取得的附加檔案";
    return result;
  }
  function search(text) {
    const term = text.trim();
    if (!term) return { results: [], total: 0 };
    let total = 0;
    const results = [];
    for (const [file, source] of files) {
      if (file.includes(term)) {
        total++;
        if (results.length < 500)
          results.push({
            id: "search:" + file + ":file",
            file,
            type: "text",
            name: term,
            start: 0,
            end: 0,
            line: 1,
            column: 1,
            endLine: 1,
            certainty: "possible",
            reasons: ["檔名符合；開啟此檔案第 1 行，不代表元件關聯"],
          });
      }
      let offset = 0;
      const lines = [0];
      for (let i = 0; i < source.length; i++) if (source[i] === "\n") lines.push(i + 1);
      while ((offset = source.indexOf(term, offset)) >= 0) {
        total++;
        if (results.length < 500) {
          let lo = 0,
            hi = lines.length;
          while (lo + 1 < hi) {
            const m = (lo + hi) >> 1;
            if (lines[m] <= offset) lo = m;
            else hi = m;
          }
          results.push({
            id: "search:" + file + ":" + offset,
            file,
            type: "text",
            name: term,
            start: offset,
            end: offset + term.length,
            line: lo + 1,
            column: offset - lines[lo] + 1,
            endLine: lo + term.split("\n").length,
            certainty: "possible",
            reasons: ["原始文字命中，可能包含註解或範例；未確認與元件有關"],
          });
        }
        offset += Math.max(1, term.length);
      }
    }
    return { results, total };
  }
  return {
    clear,
    setProject,
    setPage,
    locate,
    search,
    source: (path) => files.get(path),
    state: () => state,
    stats: () => metadata,
    count: () => files.size,
    project: () => project,
  };
})();
