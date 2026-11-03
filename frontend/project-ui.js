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
    limit = 20,
    lastPageKey = "",
    activePath = "";
  function status(text) {
    $("#project-status").textContent = text;
  }
  function renderPages() {
    const picker = $("#project-page");
    picker.disabled = profiles.length <= 1;
    $("#page-count").textContent = profiles.length
      ? profiles.length + " 個 HTML 頁面"
      : "尚未載入";
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
    if (ok) activePath = path;
    else if (activePath) $("#project-page").value = activePath;
    if (ok && lastPageKey) {
      try {
        localStorage.setItem(lastPageKey, path);
      } catch {}
    }
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
    activePath = "";
    $("#project-page").replaceChildren(new Option("正在讀取專案…", ""));
    $("#project-page").disabled = true;
    $("#page-count").textContent = "讀取中";
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
      let hash = 2166136261;
      const identity = JSON.stringify([
        input.root,
        profiles.map((p) => p.path).sort(),
      ]);
      for (let i = 0; i < identity.length; i++)
        hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
      lastPageKey = "web-analyzer:last-html-page:" + (hash >>> 0).toString(36);
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
      if (!profiles.length)
        $("#project-page").replaceChildren(
          new Option("沒有可用的 HTML 頁面", ""),
        );
      renderPages();
      status(
        profiles.length
          ? "已找到 " +
              profiles.length +
              " 個 HTML 頁面。選擇頁面即可查看結構。"
          : "沒有可讀取的 HTML 頁面。框架專案請先匯出或建置 HTML。",
      );
      let previous = "";
      try {
        previous = localStorage.getItem(lastPageKey) || "";
      } catch {}
      if (profiles.length)
        await openPage(
          profiles.some((p) => p.path === previous)
            ? previous
            : profiles[0].path,
        );
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
  window.addEventListener("html:single", () => {
    generation++;
    pageSerial++;
    sources = new Map();
    project = null;
    profiles = [];
    lastPageKey = "";
    activePath = "";
    $("#project-cancel").hidden = true;
    $("#project-folder").value = "";
  });
})();
