/* HTML structure workbench. Uploaded code is data and is never executed. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    make = (tag, text, cls) => {
      const e = document.createElement(tag);
      if (text !== undefined) e.textContent = text;
      if (cls) e.className = cls;
      return e;
    };
  let report = null,
    selected = null,
    nodes = new Map(),
    expanded = new Set(),
    mode = "html",
    view = "preview",
    controller = null,
    serial = 0,
    sourceText = "",
    sourceKind = "html",
    snippetRequest = 0;
  const browserOnly = document.body.dataset.runtime === "browser";
  const session = browserOnly
    ? Promise.resolve("")
    : fetch("/api/session")
        .then((r) => {
          if (!r.ok) throw Error("無法連線至本機服務");
          return r.json();
        })
        .then((x) => x.token);
  session.catch(() => {});
  const button = (text, fn) => {
    const b = make("button", text);
    b.type = "button";
    b.onclick = fn;
    return b;
  };
  function status(text, error = false) {
    $("#status").textContent = text;
    $("#status").classList.toggle("error", error);
  }
  function label(n) {
    return n
      ? "<" +
          n.tag +
          ">" +
          (n.attrs.id ? " #" + n.attrs.id : "") +
          (n.attrs.class
            ? " ." + n.attrs.class.trim().split(/\s+/).join(".")
            : "")
      : "";
  }
  function setMode(next) {
    mode = next;
    for (const b of document.querySelectorAll("[data-mode]")) {
      b.classList.toggle("active", b.dataset.mode === mode);
      b.setAttribute("aria-selected", String(b.dataset.mode === mode));
    }
    for (const key of ["html", "file", "url"])
      $("#input-" + key).hidden = key !== mode;
  }
  function showView(next) {
    view = next;
    $("#preview-view").hidden = next !== "preview";
    $("#source-view").hidden = next !== "source";
    for (const b of document.querySelectorAll("[data-view]"))
      b.classList.toggle("active", b.dataset.view === next);
  }
  function previewElement() {
    try {
      return $("#preview").contentDocument?.querySelector(
        '[data-web-analyzer-node="' + selected + '"]',
      );
    } catch {
      return null;
    }
  }
  function mapLocations() {
    const tags = SourceUtils.htmlTags(report.html || "");
    const byTag = new Map();
    for (const t of tags) {
      if (!byTag.has(t.name)) byTag.set(t.name, []);
      byTag.get(t.name).push(t);
    }
    for (const n of report.nodes) {
      if (n.location) continue;
      const matches = (byTag.get(n.tag) || []).filter(
        (t) =>
          Object.keys(t.attrs).length === Object.keys(n.attrs).length &&
          Object.entries(t.attrs).every(
            ([k, v]) => String(n.attrs[k] ?? "") === v,
          ),
      );
      if (matches.length === 1)
        n.location = {
          start: matches[0].start,
          end: matches[0].end,
          line: matches[0].line,
        };
    }
  }
  function renderTree() {
    const tree = $("#tree");
    tree.replaceChildren();
    if (!report) return;
    const query = $("#tree-search").value.trim().toLowerCase(),
      visible = new Set();
    if (query)
      for (const n of report.nodes)
        if (
          (
            n.tag +
            " " +
            Object.values(n.attrs).join(" ") +
            " " +
            (n.text || "")
          )
            .toLowerCase()
            .includes(query)
        ) {
          for (let p = n; p && !visible.has(p.id); p = nodes.get(p.parent))
            visible.add(p.id);
        }
    const roots = report.nodes.filter((n) => !n.parent || !nodes.has(n.parent)),
      stack = [...roots].reverse();
    while (stack.length) {
      const n = stack.pop();
      if (query && !visible.has(n.id)) continue;
      const row = make("div", undefined, "tree-row");
      row.style.paddingLeft = Math.min(n.depth || 0, 16) * 14 + "px";
      row.classList.toggle("is-selected", selected === n.id);
      const open = expanded.has(n.id) || !!query,
        toggle = n.children.length
          ? button(open ? "⌄" : "›", () => {
              if (expanded.has(n.id)) expanded.delete(n.id);
              else expanded.add(n.id);
              renderTree();
            })
          : make("span", "·", "tree-leaf");
      toggle.classList.add("tree-toggle");
      if (n.children.length) {
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", (open ? "收合" : "展開") + label(n));
        toggle.disabled = !!query;
      }
      const item = button(label(n), () => selectNode(n.id));
      item.className = "tree-item" + (selected === n.id ? " selected" : "");
      item.dataset.node = n.id;
      item.setAttribute("aria-pressed", String(selected === n.id));
      item.title = label(n) + " " + (n.text || "");
      row.append(toggle, item);
      tree.append(row);
      if (open)
        for (const id of [...n.children].reverse()) {
          const child = nodes.get(id);
          if (child) stack.push(child);
        }
    }
    if (!tree.children.length)
      tree.append(make("p", "沒有符合的元素。", "muted"));
    $("#tree-total").textContent =
      (query ? visible.size + "／" : "") + report.nodes.length + " 個元素";
  }
  function markSelection(scrollPreview = false) {
    const doc = $("#preview").contentDocument;
    if (!doc) return;
    for (const e of doc.querySelectorAll("[data-analyzer-selected]"))
      e.removeAttribute("data-analyzer-selected");
    const target = previewElement();
    if (target) {
      target.setAttribute("data-analyzer-selected", "");
      if (
        scrollPreview &&
        !["html", "head", "body"].includes(target.tagName.toLowerCase())
      )
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    const path = [];
    for (let n = nodes.get(selected); n; n = nodes.get(n.parent))
      path.unshift(n);
    const crumbs = $("#selection-path");
    crumbs.replaceChildren();
    for (const [i, n] of path.entries()) {
      if (i) crumbs.append(make("span", "›"));
      const b = button(label(n), () => selectNode(n.id));
      b.setAttribute("aria-current", n.id === selected ? "true" : "false");
      crumbs.append(b);
    }
  }
  function renderInspector() {
    const box = $("#inspect-content");
    box.replaceChildren();
    const n = nodes.get(selected);
    $("#selected-node").textContent = n ? label(n) : "尚未選取元素";
    if (!n) {
      box.append(make("p", "點選預覽或 HTML 結構中的元素。", "muted"));
      return;
    }
    const definitions = {
      html: "文件的根元素。",
      head: "文件中繼資料與資源設定。",
      body: "頁面主要內容。",
      main: "主要內容區域。",
      nav: "導覽連結區域。",
      section: "有主題的內容區塊。",
      article: "可獨立閱讀的內容。",
      button: "按鈕元素。",
      a: "連結元素。",
      form: "表單內容的組織容器。",
      input: "輸入欄位。",
      div: "一般區塊容器。",
      span: "行內文字或內容容器。",
    };
    box.append(
      make(
        "p",
        definitions[n.tag] || "HTML 元素。可查看屬性、文字與上下層結構。",
        "info-box",
      ),
    );
    const dl = make("dl", undefined, "attributes");
    for (const [k, v] of Object.entries(n.attrs))
      dl.append(make("dt", k), make("dd", String(v)));
    box.append(
      make("h3", "HTML 屬性"),
      dl.children.length ? dl : make("p", "沒有明確指定屬性。", "muted"),
    );
    if (n.text)
      box.append(make("h3", "直接文字"), make("p", n.text, "element-text"));
    const line = n.location?.line || n.line;
    box.append(
      make(
        "p",
        n.children.length +
          " 個直接子元素" +
          (line
            ? " · " +
              (n.location ? "原始開啟標籤" : "解析位置約") +
              "第 " +
              line +
              " 行"
            : ""),
        "muted",
      ),
    );
    const actions = make("div", undefined, "node-buttons");
    if (n.parent && nodes.has(n.parent))
      actions.append(button("選取父元素", () => selectNode(n.parent)));
    actions.append(
      button("查看原始 HTML", () => openSource("html")),
      button("查看元素片段", () => openSource("node")),
    );
    box.append(actions);
    if (n.children.length) {
      const d = make("details");
      d.append(make("summary", "直接子元素 · " + n.children.length));
      for (const id of n.children) {
        const child = nodes.get(id);
        if (child) d.append(button(label(child), () => selectNode(id)));
      }
      box.append(d);
    }
  }
  function selectNode(id, fromPreview = false) {
    if (!nodes.has(id)) return;
    selected = id;
    $("#tree-search").value = "";
    for (let n = nodes.get(id); n?.parent; n = nodes.get(n.parent))
      expanded.add(n.parent);
    renderTree();
    markSelection(!fromPreview);
    renderInspector();
    if (view === "source") openSource(sourceKind);
    requestAnimationFrame(() => {
      const active = $("#tree").querySelector(".tree-item.selected");
      if (!active) return;
      const a = active.getBoundingClientRect(),
        t = $("#tree").getBoundingClientRect();
      $("#tree").scrollTop += a.top - t.top - t.height / 2 + a.height / 2;
      active.classList.add("selection-arrived");
      if (fromPreview && matchMedia("(max-width:800px)").matches)
        $("#html-tree-card").scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
    });
  }
  function renderSource() {
    const pre = $("#source-code");
    pre.replaceChildren();
    const range = sourceKind === "html" ? nodes.get(selected)?.location : null;
    let offset = 0;
    for (const [i, text] of sourceText.split("\n").entries()) {
      const row = make("span", undefined, "original-source-line");
      row.append(make("span", String(i + 1), "original-line-number"));
      const start = Math.max(0, (range?.start ?? 0) - offset),
        end = Math.min(text.length, (range?.end ?? 0) - offset);
      if (range && end > start) {
        row.classList.add("target-line");
        const mark = make("mark");
        mark.append(SourceCodeView.paint(text.slice(start, end), "html"));
        row.append(
          SourceCodeView.paint(text.slice(0, start), "html"),
          mark,
          SourceCodeView.paint(text.slice(end), "html"),
        );
      } else row.append(SourceCodeView.paint(text, "html"));
      row.append(document.createTextNode("\n"));
      pre.append(row);
      offset += text.length + 1;
    }
    const target = pre.querySelector(".target-line");
    pre.scrollTop = target ? target.offsetTop - pre.offsetTop - 50 : 0;
  }
  async function openSource(kind = "html") {
    if (!report) return;
    const request = ++snippetRequest,
      id = selected,
      current = report;
    sourceKind = kind;
    showView("source");
    if (kind === "html") {
      sourceText = report.html;
      $("#source-meta").textContent =
        "原始 HTML · 高亮所選元素的開啟標籤；無法唯一對應時不猜測位置。";
      renderSource();
      return;
    }
    $("#source-meta").textContent = "正在讀取元素片段…";
    try {
      const path = "/api/analysis/" + report.id + "/node/" + selected,
        result =
          report.project || browserOnly
            ? await StaticAnalyzer.route(path)
            : await requestAPI(path);
      if (request !== snippetRequest || report !== current || selected !== id)
        return;
      sourceText = result.source;
      $("#source-meta").textContent =
        "瀏覽器解析後的元素片段，行號與原檔不同。" +
        (result.truncated ? "內容已截取。" : "");
      renderSource();
    } catch (e) {
      if (request === snippetRequest) status(e.message, true);
    }
  }
  async function requestAPI(path, options = {}) {
    const token = await session;
    const response = await fetch(path, {
      ...options,
      headers: { ...options.headers, "X-Analyzer-Token": token },
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "讀取失敗");
    return data;
  }
  function cancel() {
    serial++;
    controller?.abort();
    $("#analyze").disabled = false;
    $("#cancel").hidden = true;
    status("已取消。");
  }
  async function analyze(projectInput = null) {
    const run = ++serial;
    controller?.abort();
    controller = new AbortController();
    $("#analyze").disabled = true;
    $("#cancel").hidden = false;
    status("正在解析 HTML 結構與建立預覽…");
    try {
      let options = { method: "POST", signal: controller.signal };
      if (projectInput) {
        options.body = new FormData();
        options.project = projectInput;
      } else if (mode === "url") {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify({
          mode,
          url: $("#url").value,
          load_assets: $("#load-assets").checked,
        });
      } else {
        const form = new FormData();
        form.set("mode", mode);
        form.set("html", $("#html").value);
        form.set("base_url", $("#base-url").value);
        form.set("load_assets", String($("#load-assets").checked));
        if (mode === "file") {
          const file = $("#html-file").files[0];
          if (!file) throw Error("請先選擇 HTML 檔案。");
          form.set("html_file", file);
        }
        for (const file of $("#asset-files").files) form.append("assets", file);
        options.body = form;
      }
      const result =
        projectInput || browserOnly
          ? await StaticAnalyzer.route("/api/analyze", options)
          : await requestAPI("/api/analyze", options);
      if (run !== serial) return false;
      report = result;
      nodes = new Map(report.nodes.map((n) => [n.id, n]));
      mapLocations();
      expanded = new Set(
        report.nodes.filter((n) => n.depth < 2).map((n) => n.id),
      );
      selected =
        report.nodes.find((n) => n.tag === "body")?.id ||
        report.nodes[0]?.id ||
        null;
      $("#tree-search").value = "";
      $("#count-elements").textContent = String(report.nodes.length);
      $("#source-label").textContent = report.source_label;
      $("#export-report").disabled = false;
      $("#results").hidden = false;
      $("#empty-state").hidden = true;
      const warnings = [
        ...new Set([
          "HTML 結構依瀏覽器解析結果呈現。預覽保留可取得的樣式；來源腳本不執行，動態產生的元素可能不存在。",
          ...(report.warnings || []),
        ]),
      ];
      $("#warning-list").replaceChildren(...warnings.map((w) => make("li", w)));
      $("#warnings-title").textContent = "讀取紀錄 · " + warnings.length;
      renderTree();
      renderInspector();
      showView("preview");
      $("#preview").srcdoc = report.preview;
      status("HTML 分析完成。點選預覽中的元素，結構樹會同步定位。");
      window.dispatchEvent(new CustomEvent("html:ready"));
      return true;
    } catch (e) {
      if (run === serial)
        status(e.name === "AbortError" ? "已取消分析。" : e.message, true);
      return false;
    } finally {
      if (run === serial) {
        $("#analyze").disabled = false;
        $("#cancel").hidden = true;
      }
    }
  }
  $("#preview").addEventListener("load", () => {
    if (!report) return;
    const doc = $("#preview").contentDocument;
    if (!doc?.head) return;
    const style = doc.createElement("style");
    style.textContent =
      "[data-analyzer-selected]{outline:2px solid #92e4ac!important;outline-offset:2px!important;box-shadow:0 0 0 4px #14251b99!important;}";
    doc.head.append(style);
    doc.addEventListener("click", (e) => {
      e.preventDefault();
      const interactive = e.target.closest(
          'button,a,input,select,textarea,[role="button"]',
        ),
        target = interactive?.hasAttribute("data-web-analyzer-node")
          ? interactive
          : e.target.closest("[data-web-analyzer-node]");
      if (target) selectNode(target.dataset.webAnalyzerNode, true);
    });
    doc.addEventListener("submit", (e) => e.preventDefault());
    markSelection();
  });
  for (const b of document.querySelectorAll("[data-mode]"))
    b.onclick = () => setMode(b.dataset.mode);
  for (const b of document.querySelectorAll("[data-view]"))
    b.onclick = () =>
      b.dataset.view === "source" ? openSource("html") : showView("preview");
  for (const b of document.querySelectorAll("[data-width]"))
    b.onclick = () => {
      $("#preview").style.width =
        b.dataset.width === "full" ? "100%" : b.dataset.width + "px";
      for (const t of document.querySelectorAll("[data-width]"))
        t.setAttribute("aria-pressed", String(t === b));
    };
  $("#analyze-form").onsubmit = (e) => {
    e.preventDefault();
    analyze();
  };
  $("#cancel").onclick = cancel;
  $("#tree-search").oninput = renderTree;
  $("#expand-tree").onclick = () => {
    if (report) {
      expanded = new Set(
        report.nodes.filter((n) => n.children.length).map((n) => n.id),
      );
      renderTree();
    }
  };
  $("#collapse-tree").onclick = () => {
    expanded.clear();
    $("#tree-search").value = "";
    renderTree();
  };
  $("#node-source").onclick = () => openSource("node");
  $("#raw-source").onclick = () => openSource("html");
  $("#copy-source").onclick = async () => {
    try {
      await navigator.clipboard.writeText(sourceText);
      status("已複製 HTML。");
    } catch {
      status("無法存取剪貼簿，請選取原始碼後複製。", true);
    }
  };
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type })),
      a = make("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("#export-report").onclick = () => {
    if (report)
      download(
        JSON.stringify(
          {
            mode: "html-structure",
            source: report.source_label,
            nodes: report.nodes,
            warnings: report.warnings,
          },
          null,
          2,
        ),
        "html-structure.json",
        "application/json",
      );
  };
  $("#download-html").onclick = () => {
    if (report)
      download(sourceText, "selected-source.html", "text/html;charset=utf-8");
  };
  $("#open-project").onclick = () => $("#project-folder").click();
  $("#demo").onclick = () => {
    if (report) {
      showView("preview");
      $("#results").scrollIntoView({ block: "start" });
      return;
    }
    const has =
      mode === "html"
        ? $("#html").value.trim()
        : mode === "file"
          ? $("#html-file").files.length
          : $("#url").value.trim();
    if (has) analyze();
    else {
      $("#single-page").open = true;
      $("#single-page").scrollIntoView({ block: "start", behavior: "smooth" });
      status("先開啟專案，或輸入 HTML 後再執行預覽。");
    }
  };
  window.PageWorkbench = {
    analyzeProject: analyze,
    lastStatus: () => $("#status").textContent,
    cancel,
    reset() {
      cancel();
      report = null;
      nodes.clear();
      expanded.clear();
      selected = null;
      $("#preview").srcdoc = "";
      $("#results").hidden = true;
      $("#empty-state").hidden = false;
      $("#export-report").disabled = true;
      $("#tree").replaceChildren();
      $("#inspect-content").replaceChildren();
    },
  };
  if (browserOnly) {
    setMode("html");
    $("#mode-url").hidden = true;
  } else setMode("url");
})();
