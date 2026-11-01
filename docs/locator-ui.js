/* Location-first workbench: original files, evidence, confidence and coverage. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    make = (tag, text, cls) => {
      const e = document.createElement(tag);
      if (text !== undefined) e.textContent = text;
      if (cls) e.className = cls;
      return e;
    };
  function button(text, fn, cls = "") {
    const e = make("button", text, "locator-button " + cls);
    e.type = "button";
    e.onclick = fn;
    return e;
  }
  document.body.classList.add("location-product");
  $(".brand small").textContent = "選取畫面，找到原始檔與行號。";
  const detail = $("#component-workspace"),
    shell = make("section", undefined, "locator-shell");
  detail.append(shell);
  const toolbar = make("div", undefined, "locator-toolbar"),
    search = make("input");
  search.type = "search";
  search.placeholder = "搜尋程式碼、函式名稱或檔名";
  search.setAttribute("aria-label", "搜尋全專案原始碼");
  const descendants = make("input");
  descendants.type = "checkbox";
  descendants.checked = true;
  const descendantLabel = make("label", "包含子元素");
  descendantLabel.prepend(descendants);
  const refresh = button("重新找元件關聯", () => run());
  toolbar.append(
    search,
    button("搜尋全專案", () => searchAll()),
    refresh,
    descendantLabel,
  );
  shell.append(toolbar);
  const status = make("p", "請先選擇元件。", "locator-status");
  status.setAttribute("role", "status");
  shell.append(status);
  const coverage = make("details", undefined, "locator-coverage");
  coverage.append(make("summary", "搜尋範圍與無法確認的部分"));
  const coverageBody = make("div");
  coverage.append(coverageBody);
  shell.append(coverage);
  const elementInfo = make("details", undefined, "locator-element-inspector");
  elementInfo.append(
    make("summary", "元素解析 · HTML 屬性／CSS／JavaScript"),
    $("#component-inspector"),
  );
  shell.append(elementInfo);
  const layout = make("div", undefined, "locator-layout"),
    resultsPanel = make("section", undefined, "locator-results"),
    sourcePanel = make("section", undefined, "locator-source");
  const filters = make("div", undefined, "locator-filters");
  const certainty = make("select");
  certainty.setAttribute("aria-label", "關聯確定程度");
  for (const [value, label] of [
    ["all", "全部關聯"],
    ["confirmed", "已確認"],
    ["possible", "可能相關"],
  ]) {
    const opt = make("option", label);
    opt.value = value;
    certainty.append(opt);
  }
  const kind = make("select");
  kind.setAttribute("aria-label", "程式碼類型");
  for (const [value, label] of [
    ["all", "所有類型"],
    ["html", "HTML／行內設定"],
    ["css", "CSS"],
    ["js", "JavaScript／TypeScript"],
    ["text", "文字搜尋"],
  ]) {
    const o = make("option", label);
    o.value = value;
    kind.append(o);
  }
  const counter = make("span");
  filters.append(certainty, kind, counter);
  const list = make("div", undefined, "locator-result-list");
  list.setAttribute("aria-label", "元件相關程式碼位置");
  resultsPanel.append(filters, list);
  const sourceTitle = make("h2", "選擇左側位置，查看原始碼"),
    sourceTools = make("div", undefined, "locator-source-tools"),
    sourceMeta = make("p"),
    sourceCode = make("pre", undefined, "locator-code");
  sourceCode.tabIndex = 0;
  sourceCode.setAttribute("aria-label", "原始檔案與行號");
  const copy = button("複製位置", async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(
        current.file + ":" + current.line + ":" + current.column,
      );
      sourceMeta.textContent = "已複製位置。";
    } catch {
      sourceMeta.textContent = current.file + ":" + current.line + ":" + current.column;
    }
  });
  const download = button("下載原始檔", () => {
    if (!current) return;
    const raw = window.LocatorIndex.source(current.file);
    if (raw === undefined) return;
    const url = URL.createObjectURL(
      new Blob([raw], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = current.file.split("/").pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const trace = button("繼續追查此符號", () => {
    if (current?.id && !current.id.startsWith("search:")) run([current.id]);
  });
  const full = button("查看完整原始檔", () => {
    if (!current) return;
    const raw = window.LocatorIndex.source(current.file);
    const textarea = make("textarea");
    textarea.readOnly = true;
    textarea.value = raw;
    textarea.setAttribute("aria-label", "完整原始檔內容");
    sourceCode.replaceChildren(textarea);
    textarea.focus();
    textarea.setSelectionRange(current.start, current.end);
    textarea.scrollTop = Math.max(0, current.line - 8) * 20;
  });
  sourceTools.append(copy, trace, full, download);
  sourcePanel.append(sourceTitle, sourceMeta, sourceTools, sourceCode);
  layout.append(resultsPanel, sourcePanel);
  shell.append(layout);
  const names = {
    html: "HTML 開啟標籤",
    "inline-event": "HTML 事件屬性",
    "inline-style": "HTML 行內樣式",
    css: "CSS 規則",
    "css-declaration": "CSS 宣告",
    keyframes: "CSS 動畫定義",
    "css-import": "CSS 匯入",
    function: "函式定義",
    binding: "變數定義",
    parameter: "參數位置",
    reference: "符號引用",
    import: "模組匯入",
    export: "模組匯出",
    selector: "DOM 選擇器",
    event: "事件綁定",
    write: "屬性寫入",
    call: "函式呼叫",
    literal: "字面線索",
    jsx: "JSX 元件線索",
    text: "文字命中",
  };
  let result = null,
    current = null,
    request = 0,
    limit = 100,
    globalMode = false;
  function context() {
    return window.PageWorkbench.locatorContext();
  }
  function show(record) {
    current = record;
    sourceTitle.textContent = record.file + ":" + record.line + ":" + record.column;
    sourceMeta.textContent =
      (names[record.type] || record.type) +
      " · " +
      (record.certainty === "confirmed" ? "已確認" : "可能相關") +
      " · " +
      record.reasons.join("；") +
      (record.conditions?.length
        ? " · 條件：" + record.conditions.join(" → ") + "（不代表目前生效）"
        : "");
    trace.disabled = record.id.startsWith("search:");
    const raw = window.LocatorIndex.source(record.file);
    if (raw === undefined) {
      sourceCode.textContent = "目前快照沒有這份來源，請重新選擇資料夾。";
      return;
    }
    const lines = raw.split("\n"),
      start = Math.max(0, record.line - 9),
      end = Math.min(
        lines.length,
        Math.max(
          record.line + 10,
          Math.min(record.endLine || record.line, record.line + 180),
        ),
      );
    sourceCode.replaceChildren();
    let offset = 0;
    const starts = lines.map((line) => {
      const n = offset;
      offset += line.length + 1;
      return n;
    });
    for (let i = start; i < end; i++) {
      const row = make("span", undefined, "locator-code-line"),
        number = make("span", String(i + 1), "locator-line-number"),
        text = make("span");
      row.append(number, text);
      const a = Math.max(0, record.start - starts[i]),
        b = Math.min(lines[i].length, record.end - starts[i]);
      if (b > a) {
        row.classList.add("is-target");
        const paint = (value) =>
          window.SourceCodeView.paint(
            value,
            /html?$/.test(record.file.split(".").pop()) ||
              record.file === context()?.report.source_label
              ? "html"
              : /\.(css|scss|less)$/i.test(record.file)
                ? "css"
                : "js",
          );
        const mark = make("mark");
        mark.append(paint(lines[i].slice(a, b)));
        text.append(paint(lines[i].slice(0, a)), mark, paint(lines[i].slice(b)));
      } else
        text.append(
          window.SourceCodeView.paint(
            lines[i] || " ",
            /html?$/.test(record.file.split(".").pop()) ||
              record.file === context()?.report.source_label
              ? "html"
              : /\.(css|scss|less)$/i.test(record.file)
                ? "css"
                : "js",
          ),
        );
      sourceCode.append(row);
    }
    if (end < lines.length)
      sourceCode.append(
        make(
          "span",
          "… 顯示此位置附近原始碼；可查看／下載完整原始檔。",
          "locator-code-note",
        ),
      );
    sourceCode.scrollTop = 0;
    if (matchMedia("(max-width:1000px)").matches)
      sourcePanel.scrollIntoView({ block: "nearest" });
    for (const b of list.querySelectorAll("button"))
      b.classList.toggle("selected", b.dataset.record === record.id);
  }
  function category(record) {
    return ["html", "inline-event", "inline-style"].includes(record.type)
      ? "html"
      : ["css", "css-declaration", "keyframes", "css-import"].includes(record.type)
        ? "css"
        : record.type === "text"
          ? "text"
          : "js";
  }
  function draw() {
    list.replaceChildren();
    if (!result) return;
    const filtered = result.results.filter(
      (r) =>
        (certainty.value === "all" || r.certainty === certainty.value) &&
        (kind.value === "all" || category(r) === kind.value),
    );
    counter.textContent = filtered.length + " 個位置";
    for (const r of filtered.slice(0, limit)) {
      const row = button("", () => show(r), "locator-result " + r.certainty);
      row.dataset.record = r.id;
      row.append(
        make(
          "span",
          r.certainty === "confirmed" ? "已確認" : "可能相關",
          "locator-confidence",
        ),
        make("strong", r.file + ":" + r.line + ":" + r.column),
        make("span", (names[r.type] || r.type) + (r.name ? " · " + r.name : "")),
        make("small", r.reasons.join("；")),
      );
      const raw = window.LocatorIndex.source(r.file);
      if (raw !== undefined)
        row.append(
          make(
            "code",
            raw.slice(r.start, Math.min(r.end, r.start + 180)).replace(/\s+/g, " "),
          ),
        );
      row.classList.toggle("selected", current?.id === r.id);
      list.append(row);
    }
    if (filtered.length > limit)
      list.append(
        button("再顯示 100 個位置", () => {
          limit += 100;
          draw();
        }),
      );
    if (!filtered.length)
      list.append(
        make(
          "p",
          "這個篩選範圍沒有已找到的位置。可切換篩選，或查看搜尋缺口；沒有結果不代表沒有關聯。",
        ),
      );
  }
  function renderCoverage(data) {
    coverageBody.replaceChildren();
    coverageBody.append(
      make(
        "p",
        (data.scope || "全專案文字查找") +
          "；已索引 " +
          (data.coverage?.files ?? data.sourceCount ?? 0) +
          " 個文字檔、" +
          (data.coverage?.records ?? 0) +
          " 個語法位置。",
      ),
    );
    const issues = data.gaps || [];
    coverage.querySelector("summary").textContent =
      "搜尋範圍與無法確認的部分 · " + issues.length + " 項";
    coverageBody.append(
      make(
        "p",
        "已確認表示來源位置、靜態符號或選擇器對應有依據，不等於執行時一定生效。動態產生的 DOM、框架、事件委派、別名與外部套件可能無法完整連結。搜尋以這次選取的快照為準。",
      ),
    );
    for (const issue of issues.slice(0, 150))
      coverageBody.append(
        make(
          "p",
          issue.file + (issue.line ? ":" + issue.line : "") + " · " + issue.reason,
        ),
      );
    if (issues.length > 150)
      coverageBody.append(make("p", "缺口僅先列出前 150 項；完整清單可下載。"));
    coverageBody.append(
      button("下載完整查找結果 JSON", () => {
        const out = { ...data, results: data.results?.map(({ ...r }) => r) };
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "component-locations.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }),
    );
  }
  async function run(seedIDs = []) {
    const ctx = context();
    if (!ctx) {
      status.textContent = "請先開啟一個 HTML 頁面並選取元件；也可以使用全專案文字搜尋。";
      return;
    }
    const id = ++request;
    globalMode = false;
    status.textContent = window.LocatorIndex.state().message;
    limit = 100;
    current = null;
    sourceTitle.textContent = "正在追查原始位置…";
    sourceCode.textContent = "";
    refresh.disabled = true;
    try {
      const data = await window.LocatorIndex.locate(ctx, descendants.checked, seedIDs);
      if (
        id !== request ||
        context()?.report.id !== ctx.report.id ||
        context()?.node.id !== ctx.node.id
      )
        return;
      result = data;
      status.textContent =
        "找到 " +
        data.results.filter((r) => r.certainty === "confirmed").length +
        " 個已確認位置、" +
        data.results.filter((r) => r.certainty === "possible").length +
        " 個可能相關位置。" +
        (seedIDs.length
          ? "目前由指定符號繼續追查。"
          : "目前元件：" +
            ctx.node.tag +
            (ctx.node.attrs.id ? " #" + ctx.node.attrs.id : ""));
      renderCoverage(data);
      draw();
      if (data.results.length)
        show(
          data.results.find((r) => r.id === seedIDs[0]) ||
            data.results.find(
              (r) =>
                r.type === "html" &&
                r.file === ctx.report.source_label &&
                r.start === ctx.node.location?.start,
            ) ||
            data.results[0],
        );
      else sourceTitle.textContent = "未找到可確認的位置，請查看搜尋缺口。";
    } catch (e) {
      if (id === request) status.textContent = e.message;
    } finally {
      if (id === request) refresh.disabled = false;
    }
  }
  function searchAll() {
    ++request;
    globalMode = true;
    limit = 100;
    current = null;
    const query = search.value.trim();
    if (!query) {
      status.textContent = "請輸入程式碼文字、函式名稱或檔名。";
      return;
    }
    const hit = window.LocatorIndex.search(query);
    result = {
      results: hit.results,
      scope: "全專案原始文字（包含註解／範例，不推定元件關聯）",
      gaps: window.LocatorIndex.stats()?.gaps || [],
      coverage: window.LocatorIndex.stats()?.coverage,
      sourceCount: window.LocatorIndex.count(),
    };
    status.textContent =
      "文字命中 " +
      hit.total +
      " 處" +
      (hit.total > 500 ? "；先列出 500 處，請縮小關鍵字範圍。" : "") +
      "。";
    draw();
    if (hit.results.length) show(hit.results[0]);
    else sourceTitle.textContent = "沒有文字命中。";
    renderCoverage(result);
  }
  certainty.onchange = kind.onchange = () => {
    limit = 100;
    draw();
  };
  descendants.onchange = () => run();
  search.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchAll();
    }
  };
  window.addEventListener("analyzer:source", (event) => {
    if (!document.body.classList.contains("component-mode")) return;
    const ctx = context(),
      value = event.detail;
    if (!ctx || value.analysisId !== ctx.report.id) return;
    const file = ctx.report.files.find((f) => f.label === value.label);
    let path = file?.inline
      ? ctx.report.source_label
      : file?.label || ctx.report.source_label;
    const raw = window.LocatorIndex.source(path);
    if (raw === undefined) return;
    let base = 0;
    if (file?.inline) {
      const owner = ctx.report.nodes.find((n) => n.id === file.node);
      if (!owner?.location) {
        status.textContent = "這個內嵌來源無法確認原始位置，請從關聯清單查找。";
        return;
      }
      base = owner.location.end;
    }
    const part = file?.inline ? file.source : raw,
      lines = part.split("\n");
    let offset = 0;
    for (let i = 0; i < Math.min(lines.length, value.line || 1) - 1; i++)
      offset += lines[i].length + 1;
    let start = base + offset,
      end = start + (lines[(value.line || 1) - 1]?.length || 1);
    if (value.kind === "html" && ctx.node.location) {
      start = ctx.node.location.start;
      end = ctx.node.location.end;
    }
    const prefix = raw.slice(0, start),
      line = prefix.split("\n").length,
      column = start - (prefix.lastIndexOf("\n") + 1) + 1;
    show({
      id: "search:" + path + ":" + start,
      file: path,
      type: value.kind === "css" ? "css" : value.kind === "js" ? "reference" : "html",
      start,
      end,
      line,
      column,
      endLine: line,
      certainty: value.kind === "css" ? "possible" : "confirmed",
      reasons: [
        value.kind === "css"
          ? "舊樣式面板的來源提示；精確 CSS 位置請以關聯清單的 AST 結果為準"
          : "元素解析面板的原始來源位置",
      ],
    });
  });
  window.addEventListener("analyzer:component", () => run());
  window.addEventListener("locator:state", (event) => {
    if (event.detail.phase === "empty") {
      ++request;
      result = null;
      current = null;
      list.replaceChildren();
      sourceCode.replaceChildren();
      sourceTitle.textContent = "請選擇元件或搜尋新的專案快照。";
      sourceMeta.textContent = "";
      refresh.disabled = false;
    }
    if (event.detail.phase === "building") status.textContent = event.detail.message;
    else if (event.detail.phase === "error") status.textContent = event.detail.message;
    updateSelection();
  });
  function openSearch() {
    const ctx = context();
    if (ctx) {
      document.querySelector(".node-preview-actions .canvas-button").click();
    } else {
      detail.hidden = false;
      document.body.classList.add("component-mode");
      detail.querySelector("h1").textContent = "全專案原始碼查找";
    }
    ++request;
    globalMode = true;
    refresh.disabled = false;
    search.focus();
    status.textContent = window.LocatorIndex.state().message + " 輸入文字查找原始位置。";
  }
  const launch = button("查找", openSearch, "canvas-button locator-launch");
  launch.setAttribute("aria-label", "全專案程式碼查找");
  $(".canvas-nav").append(launch);
  const updateNavigation = () => {
    const locating = document.body.classList.contains("component-mode");
    launch.setAttribute("aria-pressed", String(locating));
    for (const item of document.querySelectorAll(
      ".canvas-nav .canvas-button:not(.locator-launch)",
    ))
      item.setAttribute(
        "aria-pressed",
        String(!locating && item.classList.contains("active")),
      );
  };
  new MutationObserver(updateNavigation).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  updateNavigation();
  const summary = make("div", undefined, "locator-selection-summary");
  const selectedTitle = make("strong", "尚未選取元件"),
    selectedLocation = make("p", "載入頁面後，點選預覽或 HTML 結構。");
  summary.append(
    selectedTitle,
    selectedLocation,
    button("尋找相關程式碼", () => {
      if (context())
        document.querySelector(".node-preview-actions .canvas-button").click();
    }),
  );
  $("#inspector-node .flow-node-content").append(summary);
  function updateSelection() {
    const ctx = context();
    selectedTitle.textContent = ctx
      ? "<" + ctx.node.tag + ">" + (ctx.node.attrs.id ? " #" + ctx.node.attrs.id : "")
      : "尚未選取元件";
    selectedLocation.textContent = ctx
      ? ctx.report.source_label +
        (ctx.node.location ? ":" + ctx.node.location.line : " · 原始位置尚未確認")
      : "載入頁面後，點選預覽或 HTML 結構。";
  }
  new MutationObserver(updateSelection).observe($("#selected-node"), {
    childList: true,
    subtree: true,
  });
  updateSelection();
})();
