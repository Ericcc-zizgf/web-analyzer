/* Read a folder snapshot, list HTML pages, and open only the chosen document. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    make = (tag, text) => {
      const e = document.createElement(tag);
      if (text !== undefined) e.textContent = text;
      return e;
    };
  let generation = 0,
    pageSerial = 0,
    sources = new Map(),
    project = null,
    profiles = [],
    limit = 20;
  function status(text) {
    $("#project-status").textContent = text;
  }
  function renderPages() {
    const q = $("#page-search").value.trim().toLowerCase(),
      filtered = profiles.filter((p) =>
        (p.path + " " + p.title).toLowerCase().includes(q),
      ),
      list = $("#page-list");
    list.replaceChildren();
    for (const p of filtered.slice(0, limit)) {
      const b = make(
        "button",
        (p.title && p.title !== p.path ? p.title + " · " : "") + p.path,
      );
      b.type = "button";
      b.title = p.path;
      b.setAttribute(
        "aria-current",
        String($("#project-page").value === p.path),
      );
      b.onclick = () => openPage(p.path);
      list.append(b);
    }
    if (!filtered.length) list.append(make("p", "沒有符合的 HTML 頁面。"));
    $("#page-more").hidden = filtered.length <= limit;
    $("#page-count").textContent = profiles.length + " 個 HTML 頁面";
  }
  async function openPage(path) {
    if (!project || !sources.has(path)) return;
    const request = ++pageSerial,
      run = generation;
    $("#project-page").value = path;
    renderPages();
    $("#project-page-status").textContent = "正在讀取 " + path + "…";
    const ok = await window.PageWorkbench.analyzeProject({
      entry: path,
      sources,
      report: project,
    });
    if (request !== pageSerial || run !== generation) return;
    $("#project-page-status").textContent = ok
      ? "目前頁面：" + path
      : "未完成：" + PageWorkbench.lastStatus();
  }
  async function run(files) {
    const run = ++generation;
    ++pageSerial;
    PageWorkbench.reset();
    sources = new Map();
    project = null;
    profiles = [];
    $("#project-page-controls").hidden = true;
    $("#project-cancel").hidden = false;
    status("正在讀取 HTML 與預覽樣式…");
    try {
      const input = await ProjectCore.collect(
        files,
        (n, total) => {
          if (run === generation) status("讀取檔案 " + n + "／" + total + "…");
        },
        () => run !== generation,
      );
      if (run !== generation) return;
      sources = new Map(
        input.entries
          .filter((e) => typeof e.source === "string")
          .map((e) => [e.path, e.source]),
      );
      project = {
        root: input.root,
        files: input.entries.map((e) => ({
          path: e.path,
          kind: e.path.split(".").at(-1).toLowerCase(),
          size: e.size,
        })),
        links: [],
        skipped: input.skipped,
      };
      profiles = ProjectPage.profiles(project, sources);
      $("#project-name").textContent = input.root;
      $("#project-page").replaceChildren(
        ...profiles.map((p) => {
          const o = make(
            "option",
            (p.title && p.title !== p.path ? p.title + " · " : "") + p.path,
          );
          o.value = p.path;
          return o;
        }),
      );
      const skipped = $("#project-skipped");
      skipped.replaceChildren(
        make("summary", "讀取範圍與略過項目 · " + input.skipped.length),
      );
      skipped.append(
        make(
          "p",
          "只讀取 HTML 與 CSS。CSS 僅用於還原預覽；其他程式碼不做解析。",
        ),
      );
      for (const item of input.skipped.slice(0, 60))
        skipped.append(make("p", item.path + "：" + item.reason));
      if (input.skipped.length > 60)
        skipped.append(make("p", "其餘略過項目未逐一列出。"));
      $("#project-page-controls").hidden = !profiles.length;
      $("#page-search").value = "";
      limit = 20;
      renderPages();
      status(
        profiles.length
          ? "已找到 " +
              profiles.length +
              " 個 HTML 頁面。選擇頁面即可查看結構。"
          : "沒有可讀取的 HTML 頁面。框架專案請先匯出或建置 HTML。",
      );
      if (profiles.length) await openPage(profiles[0].path);
    } catch (e) {
      if (run === generation) status(e.message);
    } finally {
      if (run === generation) {
        $("#project-cancel").hidden = true;
        $("#project-folder").value = "";
      }
    }
  }
  $("#project-folder").onchange = (e) => {
    if (e.target.files.length) run([...e.target.files]);
  };
  $("#project-cancel").onclick = () => {
    generation++;
    pageSerial++;
    PageWorkbench.cancel();
    $("#project-folder").value = "";
    $("#project-cancel").hidden = true;
    status("已取消讀取。");
  };
  $("#project-page").onchange = (e) => openPage(e.target.value);
  $("#project-page-reanalyze").onclick = () =>
    openPage($("#project-page").value);
  $("#page-search").oninput = () => {
    limit = 20;
    renderPages();
  };
  $("#page-more").onclick = () => {
    limit += 20;
    renderPages();
  };
})();
