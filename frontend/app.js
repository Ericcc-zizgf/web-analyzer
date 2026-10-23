"use strict";
const $ = (s) => document.querySelector(s);
let mode = "url",
  token = "",
  report = null,
  nodeMap = new Map(),
  selected = null,
  inspectTab = "html",
  view = "preview",
  sourceFile = "html",
  sourceText = "",
  rawText = "",
  formatted = false,
  worker = null,
  workerSerial = 0,
  runSerial = 0,
  controller = null;
const pending = new Map(),
  expanded = new Set();
let jsResults = [];
let jsScope = "element",
  jsCategory = "events";
const DEMO = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8"><title>分析示範</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.7 system-ui; color: #23422f; }
.layout { display: flex; min-height: 100vh; }
#sidebar { width: 180px; padding: 24px; background: #eaf0e2; }
.content { flex: 1; padding: 30px; }
h1 { font-size: 28px; }
button { padding: 9px 16px; background: #2e6849; color: white; border: 0; border-radius: 5px; }
#count { font-size: 36px; font-weight: 700; }
@media (max-width: 600px) { .layout { flex-direction: column; } #sidebar { width: 100%; } }
</style>
</head>
<body>
<main class="layout">
  <nav id="sidebar"><h2>課程導覽</h2><a href="#lesson">第一堂課</a></nav>
  <section class="content" id="lesson">
    <h1>讀懂一個小網頁</h1><p>點選元素，觀察右側的 CSS 與事件。</p>
    <p id="count">0</p><button id="increase">增加一次</button>
    <button id="toggle">切換側欄</button>
  </section>
</main>
<script>
const increase = document.querySelector('#increase');
const counter = document.getElementById('count');
function updateCount() {
  counter.textContent = String(Number(counter.textContent) + 1);
}
increase.addEventListener('click', updateCount);
document.querySelector('#toggle').addEventListener('click', () => {
  document.querySelector('#sidebar').hidden = !document.querySelector('#sidebar').hidden;
});
async function loadNotes() {
  const response = await fetch('/api/notes', { method: 'GET' });
  return response.json();
}
localStorage.setItem('example-only', '這段程式不會被分析器執行');
</script>
</body></html>`;
function status(text, error = false) {
  $("#status").textContent = text;
  $("#status").className = error ? "error" : "";
}
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function btn(text, callback) {
  const n = el("button", text);
  n.type = "button";
  n.onclick = callback;
  return n;
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "X-Analyzer-Token": token, ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "請求失敗");
  return data;
}
function workerCall(type, data) {
  if (!worker) {
    worker = new Worker("/static/analysis-worker.js");
    worker.onmessage = (e) => {
      const task = pending.get(e.data.id);
      if (task) {
        pending.delete(e.data.id);
        clearTimeout(task.timer);
        e.data.error ? task.reject(Error(e.data.error)) : task.resolve(e.data.result);
      }
    };
    worker.onerror = () => stopWorker("JavaScript 解析器無法啟動");
  }
  return new Promise((resolve, reject) => {
    const id = ++workerSerial,
      timer = setTimeout(
        () => stopWorker("語法解析超過 12 秒，已停止；仍可查看原始碼。"),
        12000,
      );
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, type, ...data });
  });
}
function stopWorker(reason = "已取消") {
  if (worker) worker.terminate();
  worker = null;
  for (const task of pending.values()) {
    clearTimeout(task.timer);
    task.reject(Error(reason));
  }
  pending.clear();
}
function setMode(value) {
  mode = value;
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === value);
    b.setAttribute("aria-selected", b.dataset.mode === value);
  });
  for (const key of ["url", "html", "file"]) $("#input-" + key).hidden = key !== value;
}
function showView(value) {
  view = value;
  $("#preview-view").hidden = value !== "preview";
  $("#source-view").hidden = value !== "source";
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === value));
}
function label(node) {
  if (!node) return "";
  return (
    "<" +
    node.tag +
    ">" +
    (node.attrs.id ? " #" + node.attrs.id : "") +
    (node.attrs.class ? " ." + node.attrs.class.split(/\s+/).slice(0, 2).join(".") : "")
  );
}
async function analyze() {
  const run = ++runSerial;
  controller?.abort();
  stopWorker();
  controller = new AbortController();
  $("#analyze").disabled = true;
  $("#cancel").hidden = false;
  status("正在讀取 HTML 與資源，這可能需要數十秒…");
  try {
    let options = { method: "POST", signal: controller.signal };
    if (mode === "url") {
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
        if (!file) throw Error("請先選擇 HTML 檔案");
        form.set("html_file", file);
      }
      for (const file of $("#asset-files").files) form.append("assets", file);
      options.body = form;
    }
    const result = await api("/api/analyze", options);
    if (run !== runSerial) return;
    window.CSSLab.reset();
    report = result;
    sourceText = "";
    rawText = "";
    $("#tree-search").value = "";
    nodeMap = new Map(report.nodes.map((n) => [n.id, n]));
    expanded.clear();
    for (const n of report.nodes) if (n.depth < 2) expanded.add(n.id);
    jsResults = [];
    jsScope = "element";
    selected = report.nodes.find((n) => n.tag === "body")?.id || report.nodes[0].id;
    $("#results").hidden = false;
    $("#empty-state").hidden = true;
    $("#export-report").disabled = false;
    $("#source-label").textContent = report.source_label;
    $("#count-elements").textContent = report.stats.elements;
    $("#count-css").textContent = report.stats.css_rules;
    $("#count-functions").textContent = "…";
    $("#count-events").textContent = report.inline_events.length;
    fillSources();
    renderWarnings();
    renderTree();
    renderInspector();
    showView("preview");
    $("#preview").srcdoc = report.preview;
    status("HTML 與 CSS 已完成；正在以語法樹解析 JavaScript…");
    const scripts = report.files.filter((f) => f.kind === "js" && f.loaded);
    if (scripts.length)
      try {
        jsResults = await workerCall("analyze", {
          files: scripts.map((f) => ({ id: f.id, source: f.source })),
        });
      } catch (error) {
        if (run === runSerial) report.warnings.push(error.message);
      }
    if (run !== runSerial) return;
    for (const result of jsResults) {
      const file = report.files.find((f) => f.id === result.id);
      if (result.error)
        report.warnings.push(file.label + "：JS 語法無法解析（" + result.error + "）");
      if (result.truncated?.length)
        report.warnings.push(
          file.label + "：部分語法清單超過 160 筆顯示上限；計數仍列出解析總數。",
        );
      if (result.imports?.length)
        report.warnings.push(file.label + "：發現 import／模組依賴，此版本不展開。");
    }
    const good = jsResults.filter((r) => !r.error);
    $("#count-functions").textContent =
      scripts.length && !good.length
        ? "—"
        : good.reduce((sum, r) => sum + r.counts.functions, 0);
    $("#count-events").textContent =
      report.inline_events.length + good.reduce((sum, r) => sum + r.counts.events, 0);
    renderWarnings();
    renderInspector();
    status("分析完成。點選 HTML 元素，或切換 CSS／JavaScript 查看來源。");
  } catch (error) {
    if (run === runSerial)
      status(error.name === "AbortError" ? "已取消分析。" : error.message, true);
  } finally {
    if (run === runSerial) {
      $("#analyze").disabled = false;
      $("#cancel").hidden = true;
    }
  }
}
function renderWarnings() {
  const notes = [
    "這是靜態原始碼分析；原頁 JavaScript 不執行，動態 DOM、登入後內容與程式執行結果不在本次分析中。",
    "安全預覽只套用已取得的 HTML／CSS，外部圖片、字型、CSS @import 與 JS import 依賴未展開。",
    ...report.warnings,
  ];
  $("#warnings-title").textContent = "分析範圍與讀取紀錄 · " + notes.length + " 項";
  $("#warning-list").replaceChildren(...notes.map((n) => el("li", n)));
}
function renderTree() {
  if (!report) return;
  const search = $("#tree-search").value.trim().toLowerCase(),
    visible = new Set();
  if (search)
    for (const n of report.nodes)
      if (
        (n.tag + " " + Object.values(n.attrs).join(" ") + " " + n.text)
          .toLowerCase()
          .includes(search)
      ) {
        let p = n;
        while (p) {
          visible.add(p.id);
          p = nodeMap.get(p.parent);
        }
      }
  const tree = $("#tree");
  tree.replaceChildren();
  function visit(n) {
    if (search && !visible.has(n.id)) return;
    const row = el("div", undefined, "tree-row");
    row.style.paddingLeft = Math.min(n.depth, 12) * 14 + "px";
    row.classList.toggle("is-selected", selected === n.id);
    const isOpen = expanded.has(n.id) || Boolean(search);
    const toggle = n.children.length
      ? btn("", () => {
          expanded.has(n.id) ? expanded.delete(n.id) : expanded.add(n.id);
          renderTree();
          document.querySelector(`[data-toggle="${n.id}"]`)?.focus({ preventScroll: true });
        })
      : el("span", "", "tree-leaf");
    if (n.children.length) {
      toggle.className = "tree-toggle";
      toggle.dataset.toggle = n.id;
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.setAttribute("aria-label", (isOpen ? "收合 " : "展開 ") + label(n));
      toggle.disabled = Boolean(search);
      toggle.title = search
        ? "搜尋時自動展開符合的路徑；清除搜尋後可收合"
        : toggle.getAttribute("aria-label");
      const chevron = el("span", "", "chevron");
      chevron.setAttribute("aria-hidden", "true");
      toggle.append(chevron);
    } else {
      toggle.setAttribute("aria-hidden", "true");
    }
    const item = btn(label(n), () => selectNode(n.id));
    item.className = "tree-item" + (selected === n.id ? " selected" : "");
    item.dataset.node = n.id;
    item.setAttribute("aria-pressed", String(selected === n.id));
    item.title = label(n) + " " + n.text;
    row.append(toggle, item);
    tree.append(row);
    if (expanded.has(n.id) || search) for (const id of n.children) visit(nodeMap.get(id));
  }
  for (const n of report.nodes) if (!n.parent) visit(n);
  if (!tree.children.length)
    tree.append(el("p", "找不到符合的元素，試試其他標籤或名稱。", "tree-empty"));
  $("#tree-total").textContent =
    (search ? visible.size + " / " : "") + report.nodes.length + " 個";
}
function selectNode(id) {
  if (selected !== id) jsScope = "element";
  selected = id;
  let node = nodeMap.get(id);
  while (node?.parent) {
    expanded.add(node.parent);
    node = nodeMap.get(node.parent);
  }
  renderTree();
  const tree = $("#tree");
  const active = tree.querySelector(".tree-item.selected");
  if (active) {
    const area = tree.getBoundingClientRect();
    const row = active.getBoundingClientRect();
    if (row.bottom > area.bottom) tree.scrollTop += row.bottom - area.bottom + 8;
    else if (row.top < area.top) tree.scrollTop -= area.top - row.top + 8;
  }
  markSelection();
  renderInspector();
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
function markSelection() {
  const doc = $("#preview").contentDocument;
  if (!doc) return;
  doc
    .querySelectorAll("[data-analyzer-selected]")
    .forEach((n) => n.removeAttribute("data-analyzer-selected"));
  const target = previewElement();
  if (target) {
    target.setAttribute("data-analyzer-selected", "");
    if (!["html", "head", "body"].includes(target.tagName.toLowerCase()))
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  const path = [];
  let node = nodeMap.get(selected);
  while (node) {
    path.unshift(label(node));
    node = nodeMap.get(node.parent);
  }
  $("#selection-path").textContent = path.join(" › ");
}
$("#preview").addEventListener("load", () => {
  if (!report) return;
  const doc = $("#preview").contentDocument;
  if (!doc?.head) return;
  const style = doc.createElement("style");
  style.textContent =
    "[data-analyzer-selected]{outline:2px solid #548d4d!important;outline-offset:-2px!important;}";
  doc.head.append(style);
  doc.addEventListener("click", (event) => {
    event.preventDefault();
    const target = event.target.closest("[data-web-analyzer-node]");
    if (target) selectNode(target.dataset.webAnalyzerNode);
  });
  doc.addEventListener("submit", (e) => e.preventDefault());
  markSelection();
  renderInspector();
});
function title(text) {
  return el("div", text, "detail-title");
}
function definition(node) {
  return (
    {
      html: "整份 HTML 文件的根元素。",
      head: "頁面標題、樣式與資源設定。",
      body: "頁面可見內容。",
      main: "主要內容區域。",
      nav: "導覽連結的區域。",
      section: "具有主題的內容區塊。",
      article: "可以獨立閱讀的內容。",
      div: "一般容器；外觀與排列由 CSS 決定。",
      h1: "主要標題。",
      h2: "次層級標題。",
      p: "段落文字。",
      a: "連結。",
      button: "可觸發事件的按鈕。",
      input: "輸入控制項。",
      form: "表單與輸入內容的組織。",
      style: "內嵌 CSS。",
      script: "JavaScript 或資料腳本；安全預覽會移除。",
      img: "圖片元素；安全預覽不讀取外部圖片。",
      ul: "無序清單。",
      li: "清單項目。",
      label: "表單欄位標籤。",
      textarea: "多行文字輸入。",
    }[node.tag] || "HTML 元素；實際外觀取決於 CSS 與瀏覽器。"
  );
}
function renderInspector() {
  if (!report) return;
  const box = $("#inspect-content"),
    node = nodeMap.get(selected);
  box.replaceChildren();
  $("#selected-node").textContent = label(node);
  document
    .querySelectorAll("[data-inspect]")
    .forEach((b) => b.classList.toggle("active", b.dataset.inspect === inspectTab));
  if (inspectTab === "html") {
    box.append(el("p", definition(node), "info-box"), title("屬性 Attributes"));
    const list = el("dl", undefined, "attributes");
    for (const [k, v] of Object.entries(node.attrs)) {
      list.append(el("dt", k), el("dd", v));
    }
    if (!list.children.length) box.append(el("p", "沒有明確指定屬性。", "muted"));
    else box.append(list);
    if (node.text) box.append(title("直接文字內容"), el("p", node.text, "muted"));
    box.append(
      el(
        "p",
        "子元素 " +
          node.children.length +
          " 個" +
          (node.line ? " · HTML5 解析位置約第 " + node.line + " 行" : ""),
        "muted",
      ),
    );
    const buttons = el("div", undefined, "node-buttons");
    buttons.append(
      btn("看此元素片段", showNodeSource),
      btn("看原始 HTML", () => openSource("html", node.line || 1)),
    );
    box.append(buttons);
    const events = report.inline_events.filter((e) => e.target_node === selected);
    if (events.length) {
      box.append(title("HTML 事件屬性（未執行）"));
      for (const event of events) {
        const card = el("div", undefined, "js-card");
        card.append(el("code", "on" + event.event), el("pre", event.code));
        box.append(card);
      }
    }
  } else if (inspectTab === "css") renderCSS(box, node);
  else renderJS(box, node);
}
function conditionState(rule, win) {
  let unknown = false;
  for (const c of rule.conditions) {
    try {
      if (c.type === "media" && !win.matchMedia(c.condition).matches) return "目前尺寸不符合";
      if (c.type === "supports" && !win.CSS.supports(c.condition)) return "瀏覽器不支援";
      if (!["media", "supports", "layer"].includes(c.type)) unknown = true;
    } catch {
      unknown = true;
    }
  }
  return unknown ? "條件需另外判斷" : "條件符合";
}
function renderCSS(box, node) {
  const element = previewElement(),
    win = $("#preview").contentWindow;
  window.CSSLab.render(box, {
    element,
    win,
    node,
    report,
    conditionState,
    selectNode,
    openSource,
    refresh: renderInspector,
  });
  const rulesPanel = el("details", undefined, "css-lab-section");
  rulesPanel.id = "css-all-rules";
  rulesPanel.append(el("summary", "規則清單與完整運算值"));
  box.append(rulesPanel);
  box = rulesPanel;
  box.append(
    el(
      "p",
      "相符規則不一定是最後生效值；下方運算樣式包含瀏覽器預設與已取得 CSS，不含原頁 JavaScript 執行後的修改。",
      "info-box",
    ),
  );
  const filter = el("label", undefined, "checkbox"),
    check = document.createElement("input");
  check.type = "checkbox";
  check.checked = true;
  filter.append(check, document.createTextNode("只看與選取元素相符的規則"));
  box.append(filter);
  const area = el("div");
  box.append(area);
  if (node.attrs.style) {
    box.append(title("元素行內 style"), el("pre", node.attrs.style));
  }
  if (element) {
    const computed = win.getComputedStyle(element);
    box.append(title("安全預覽的運算樣式"));
    const list = el("dl", undefined, "attributes");
    for (const key of [
      "display",
      "position",
      "width",
      "height",
      "min-height",
      "padding",
      "margin",
      "color",
      "background-color",
      "font-size",
      "flex-direction",
      "grid-template-columns",
    ])
      list.append(el("dt", key), el("dd", computed.getPropertyValue(key)));
    box.append(list);
  } else box.append(el("p", "此節點不在安全預覽中，無法取得運算樣式。", "muted"));
  function draw() {
    area.replaceChildren();
    let chosen = report.css_rules.filter((rule) => {
      if (!check.checked) return true;
      if (!element) return false;
      try {
        return element.matches(rule.selector);
      } catch {
        return false;
      }
    });
    area.append(
      title((check.checked ? "選擇器相符" : "全部") + "：" + chosen.length + " 條規則"),
    );
    if (check.checked)
      area.append(el("p", "偽元素及 :hover 等狀態可能不在這份相符清單。", "muted"));
    for (const rule of chosen.slice(0, 70)) {
      const state = conditionState(rule, win),
        card = el("div", undefined, "rule-card" + (state === "條件符合" ? "" : " inactive"));
      card.append(el("code", rule.selector));
      if (rule.conditions.length)
        card.append(
          el(
            "p",
            rule.conditions.map((c) => "@" + c.type + " " + c.condition).join(" / ") +
              " · " +
              state,
          ),
        );
      card.append(
        el(
          "pre",
          rule.declarations
            .map((d) => d.property + ": " + d.value + (d.important ? " !important" : "") + ";")
            .join("\n"),
        ),
      );
      const file = report.files.find((f) => f.id === rule.file);
      card.append(
        btn((file?.label || "CSS") + " · 第 " + rule.line + " 行", () =>
          openSource(rule.file, rule.line),
        ),
      );
      area.append(card);
    }
    if (chosen.length > 70)
      area.append(el("p", "目前顯示前 70 條，可到原始碼查看完整內容。", "muted"));
  }
  check.onchange = draw;
  draw();
}
function renderJS(box, node) {
  const scope = el("select");
  scope.id = "js-scope";
  scope.setAttribute("aria-label", "JavaScript 分析範圍");
  for (const [value, text] of [
    ["element", "目前元素 · " + label(node)],
    ["page", "整個網頁 · 全部 JavaScript"],
  ]) {
    const option = el("option", text);
    option.value = value;
    scope.append(option);
  }
  scope.value = jsScope;
  box.append(
    scope,
    el(
      "p",
      "依靜態選擇器、直接綁定的回呼，以及函式內的元素操作比對。事件委派、動態選擇器、跨檔案呼叫與框架事件可能無法判定；未列出不代表沒有互動。",
      "info-box",
    ),
  );
  const category = el("select");
  category.id = "js-category";
  category.setAttribute("aria-label", "JavaScript 分析類型");
  for (const [value, text] of [
    ["events", "事件綁定"],
    ["functions", "函式與方法"],
    ["network", "API／網路呼叫"],
    ["selectors", "DOM 選擇器"],
    ["writes", "DOM 修改"],
    ["storage", "瀏覽器儲存"],
    ["timers", "計時器"],
    ["imports", "模組依賴"],
  ]) {
    const option = el("option", text);
    option.value = value;
    category.append(option);
  }
  category.value = jsCategory;
  const scopeNote = el("p", "", "stat-line");
  const area = el("div");
  box.append(category, scopeNote, area);
  function matches(selector) {
    try {
      return Boolean(selector && previewElement()?.matches(selector));
    } catch {
      return false;
    }
  }
  function draw() {
    area.replaceChildren();
    const all = scope.value === "page";
    let count = 0,
      omitted = 0,
      incomplete = false;
    if (category.value === "events") {
      for (const event of report.inline_events) {
        if (!all && event.target_node !== node.id) {
          omitted++;
          continue;
        }
        count++;
        const targetNode = nodeMap.get(event.target_node);
        const card = el("div", undefined, "js-card");
        card.append(
          el(
            "code",
            "on" + event.event + " → " + (targetNode ? label(targetNode) : "HTML 元素"),
          ),
          el("p", "HTML 事件屬性"),
          el("pre", event.code),
          btn("查看原始 HTML", () => openSource("html", targetNode?.line || 1)),
        );
        area.append(card);
      }
    }
    for (const file of report.files.filter((f) => ["js", "data"].includes(f.kind))) {
      const parsed = jsResults.find((r) => r.id === file.id);
      if (!file.loaded || parsed?.error || (file.kind === "js" && !parsed)) {
        incomplete = true;
        if (all)
          area.append(
            el(
              "p",
              file.label +
                "：" +
                (file.error || parsed?.error || "語法解析尚未完成或已停止。"),
              "error-box",
            ),
            btn("查看原始碼", () => openSource(file.id, parsed?.line || 1)),
          );
        continue;
      }
      if (file.kind === "data") {
        if (all)
          area.append(el("p", file.label + "：資料腳本，不屬於元素的互動程式。", "info-box"));
        continue;
      }
      if (parsed.truncated?.length) incomplete = true;
      const items = parsed[category.value] || [];
      const relevant = items.filter(
        (item) => all || (item.relatedTargets || [item.target || item.selector]).some(matches),
      );
      omitted += items.length - relevant.length;
      for (const item of relevant.slice(0, 60)) {
        count++;
        const card = el("div", undefined, "js-card");
        const summary =
          category.value === "functions"
            ? item.name + "(" + item.params.join(", ") + ")"
            : category.value === "events"
              ? item.event + " → " + (item.target || item.receiver) + " → " + item.handler
              : category.value === "network"
                ? item.api + " " + item.method + " " + item.url
                : category.value === "selectors"
                  ? item.method + " " + item.selector
                  : category.value === "imports"
                    ? item.kind + " " + item.name
                    : item.api + (item.key ? " · " + item.key : "");
        card.append(el("code", summary));
        if (!all)
          card.append(
            el(
              "p",
              category.value === "events"
                ? "直接綁定在目前元素"
                : "選擇器或所屬函式與目前元素有關聯",
            ),
          );
        card.append(
          el("p", file.label + " · 第 " + item.line + " 行"),
          el("pre", item.snippet),
          btn("查看這段程式", () => openSource(file.id, item.line)),
        );
        area.append(card);
      }
      if (relevant.length > 60)
        area.append(el("p", "此檔案僅顯示前 60 筆，其他項目請查看原始碼。", "muted"));
    }
    scopeNote.textContent =
      (all ? "整頁範圍" : "目前元素：" + label(node)) +
      " · 顯示 " +
      count +
      " 筆" +
      (!all && omitted ? "，其餘 " + omitted + " 筆未確認與此元素相關" : "");
    if (!count)
      area.append(
        el(
          "p",
          all
            ? "沒有可列出的「" + category.selectedOptions[0].textContent + "」。"
            : "未找到可確認與此元素相關的「" +
                category.selectedOptions[0].textContent +
                "」。可切換「整個網頁」查看其他程式。",
          "muted",
        ),
      );
    if (incomplete)
      area.append(
        el(
          "p",
          "部分腳本未完成解析、讀取失敗或超出分析上限；請查看整頁範圍及讀取紀錄。",
          "info-box",
        ),
      );
  }
  scope.onchange = () => {
    jsScope = scope.value;
    draw();
  };
  category.onchange = () => {
    jsCategory = category.value;
    draw();
  };
  draw();
}
function fillSources() {
  const select = $("#source-file");
  select.replaceChildren();
  const html = el("option", "HTML 原始檔");
  html.value = "html";
  select.append(html);
  for (const file of report.files) {
    const option = el(
      "option",
      (file.kind === "css" ? "CSS" : file.kind === "data" ? "資料" : "JS") +
        " · " +
        file.label +
        (file.loaded ? "" : "（未讀取）"),
    );
    option.value = file.id;
    select.append(option);
  }
  sourceFile = "html";
  select.value = "html";
}
async function openSource(id, line = 1) {
  sourceFile = id;
  $("#source-file").value = id;
  const file = report.files.find((f) => f.id === id);
  rawText = id === "html" ? report.html : file?.source || "";
  sourceText = rawText;
  formatted = false;
  showView("source");
  $("#source-meta").textContent =
    id === "html"
      ? "HTML 原始輸入；行號依原始文字。"
      : file?.loaded
        ? file.label +
          " · " +
          (file.inline ? "內嵌區塊，行號從此區塊第 1 行算起" : "取得的原始檔案")
        : file?.error || "無法取得此檔案";
  renderSource(line);
}
function renderSource(line = 0) {
  const pre = $("#source-code");
  pre.replaceChildren();
  const lines = sourceText.split("\n");
  lines.forEach((text, index) => {
    const span = el("span", text + (index < lines.length - 1 ? "\n" : ""));
    if (index + 1 === line) span.className = "target-line";
    pre.append(span);
  });
  const target = pre.querySelector(".target-line");
  if (target)
    pre.scrollTop =
      target.getBoundingClientRect().top -
      pre.getBoundingClientRect().top +
      pre.scrollTop -
      40;
  else pre.scrollTop = 0;
}
async function showNodeSource() {
  if (!report) return;
  try {
    const id = selected,
      analysisId = report.id;
    const result = await api("/api/analysis/" + analysisId + "/node/" + id);
    if (id !== selected || report.id !== analysisId) return;
    sourceText = result.source;
    rawText = result.source;
    formatted = false;
    sourceFile = "node";
    showView("source");
    $("#source-meta").textContent =
      label(nodeMap.get(id)) +
      " · HTML5 解析後的元素片段，已重新縮排，行號與原檔不同。" +
      (result.truncated ? " 超過 200 KB，已截取。" : "");
    renderSource();
  } catch (error) {
    status(error.message, true);
  }
}
document
  .querySelectorAll("[data-mode]")
  .forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      showView(b.dataset.view);
      if (view === "source" && !sourceText) openSource("html");
    }),
);
document.querySelectorAll("[data-inspect]").forEach(
  (b) =>
    (b.onclick = () => {
      inspectTab = b.dataset.inspect;
      renderInspector();
    }),
);
document.querySelectorAll("[data-width]").forEach(
  (b) =>
    (b.onclick = () => {
      $("#preview").style.width = b.dataset.width === "full" ? "100%" : b.dataset.width + "px";
      document
        .querySelectorAll("[data-width]")
        .forEach((item) => item.setAttribute("aria-pressed", item === b));
      setTimeout(() => {
        if (inspectTab === "css") renderInspector();
      }, 40);
    }),
);
$("#analyze-form").onsubmit = (e) => {
  e.preventDefault();
  analyze();
};
$("#cancel").onclick = () => {
  runSerial++;
  controller?.abort();
  stopWorker();
  $("#analyze").disabled = false;
  $("#cancel").hidden = true;
  status("已取消。");
};
$("#demo").onclick = () => {
  setMode("html");
  $("#html").value = DEMO;
  $("#base-url").value = "";
  $("#asset-files").value = "";
  analyze();
};
$("#empty-demo").onclick = () => $("#demo").click();
$("#toggle-input").onclick = () => {
  const collapsed = document.body.classList.toggle("input-collapsed");
  $("#input-panel").hidden = collapsed;
  $("#toggle-input").setAttribute("aria-expanded", String(!collapsed));
  $("#toggle-input").textContent = collapsed ? "更換分析來源" : "收起輸入區";
};
$("#expand-tree").onclick = () => {
  if (!report) return;
  for (const node of report.nodes) if (node.children.length) expanded.add(node.id);
  renderTree();
};
$("#collapse-tree").onclick = () => {
  $("#tree-search").value = "";
  expanded.clear();
  renderTree();
};
$("#tree-search").oninput = renderTree;
$("#source-file").onchange = () => openSource($("#source-file").value);
$("#node-source").onclick = showNodeSource;
$("#raw-source").onclick = () => {
  sourceText = rawText;
  formatted = false;
  $("#source-meta").textContent += " · 顯示原始文字";
  renderSource();
};
$("#format-source").onclick = async () => {
  if (!sourceText) return;
  const analysisId = report.id;
  const id = sourceFile;
  $("#format-source").disabled = true;
  try {
    const file = report.files.find((f) => f.id === sourceFile);
    const kind =
      sourceFile === "html" || sourceFile === "node" ? "html" : file?.kind || "html";
    const value = await workerCall("format", { source: rawText, kind });
    if (report?.id === analysisId && sourceFile === id) {
      sourceText = value;
      formatted = true;
      $("#source-meta").textContent =
        "已排版方便閱讀；行號與原始檔不同。按「原檔」可還原顯示。";
      renderSource();
    }
  } catch (error) {
    status("無法排版：" + error.message, true);
  } finally {
    $("#format-source").disabled = false;
  }
};
$("#copy-source").onclick = async () => {
  try {
    await navigator.clipboard.writeText(sourceText);
    status("已複製目前顯示的原始碼。");
  } catch {
    status("瀏覽器未允許自動複製，請選取原始碼後按 Ctrl／Command+C。", true);
  }
};
$("#export-report").onclick = () => {
  if (!report) return;
  const { preview, ...data } = report;
  const value = {
    ...data,
    javascript: jsResults,
    analysis_mode: "static-source-no-script-execution",
    exported_at: new Date().toISOString(),
  };
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "web-analysis.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
(async () => {
  try {
    token = (await api("/api/session")).token;
    $("#home-link").href = "/hub";
  } catch (error) {
    status("無法連接本機後端：" + error.message, true);
  }
})();

// Keep box metrics and media-query explanations current when the preview resizes.
let cssResizeTimer;
new ResizeObserver(() => {
  clearTimeout(cssResizeTimer);
  cssResizeTimer = setTimeout(() => {
    if (report && inspectTab === "css") renderInspector();
  }, 120);
}).observe($("#preview"));
