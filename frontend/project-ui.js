/* Folder picker and project report, shared by Flask and Pages. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const node = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const state = {
    report: null,
    sources: new Map(),
    selected: null,
    worker: null,
    serial: 0,
    cancelTask: null,
    pageSerial: 0,
    batchController: null,
    pageProfiles: [],
    pageResults: new Map(),
  };
  const status = (text) => {
    $("#project-status").textContent = text;
  };
  function stop() {
    state.serial++;
    state.pageSerial++;
    state.batchController?.abort();
    state.batchController = null;
    window.PageWorkbench?.cancel();
    state.worker?.terminate();
    state.worker = null;
    state.cancelTask?.();
    state.cancelTask = null;
    $("#project-cancel").hidden = true;
    // Clear even on cancellation so choosing the same folder fires change again.
    $("#project-folder").value = "";
  }
  async function openPage(path) {
    if (!state.report || !path) return;
    const serial = ++state.pageSerial;
    const projectSerial = state.serial;
    $("#project-page").value = path;
    const profile = state.pageProfiles.find((page) => page.path === path);
    $("#project-page-reason").textContent = profile
      ? "頁面線索：" +
        profile.reasons.join("、") +
        "。入口是靜態推測；其餘 HTML 也會一併分析。"
      : "";
    $("#project-page-link").hidden = true;
    $("#project-page-status").textContent =
      "正在分析 " + path + " 的 HTML、CSS 與 JavaScript…";
    $("#input-panel").hidden = true;
    document.body.classList.add("input-collapsed");
    $("#toggle-input").textContent = "改用單頁分析";
    $("#toggle-input").setAttribute("aria-expanded", "false");
    const ok = await window.PageWorkbench.analyzeProject({
      entry: path,
      sources: state.sources,
      report: state.report,
    });
    if (serial !== state.pageSerial || projectSerial !== state.serial) return;
    $("#project-page-status").textContent = ok
      ? "已分析「" + path + "」，下方可直接查看畫面、HTML 結構、CSS 與 JavaScript。"
      : "這個頁面未完成分析：" + window.PageWorkbench.lastStatus();
    $("#project-page-link").hidden = !ok;
  }
  async function scanAll(profiles) {
    state.batchController?.abort();
    const batch = new AbortController();
    state.batchController = batch;
    const projectSerial = state.serial,
      report = state.report,
      sources = state.sources;
    const table = $("#project-pages-body");
    table.replaceChildren();
    const rows = new Map();
    state.pageResults = new Map();
    report.page_analysis = profiles.map((profile) => ({ ...profile, status: "pending" }));
    $("#project-pages-overview").hidden = !profiles.length;
    $("#project-pages-cancel").hidden = false;
    for (const profile of profiles) {
      const row = node("tr"),
        name = node("td"),
        button = node("button", profile.path);
      button.type = "button";
      button.onclick = () => openPage(profile.path);
      name.append(button);
      row.append(name, node("td", profile.title));
      for (let i = 0; i < 3; i++) row.append(node("td", "—"));
      row.append(node("td", "等待分析"));
      table.append(row);
      rows.set(profile.path, row);
    }
    let completed = 0,
      failed = 0;
    for (const profile of profiles) {
      if (batch.signal.aborted || projectSerial !== state.serial) break;
      $("#project-pages-status").textContent =
        `正在自動分析所有 HTML：${completed + failed} / ${profiles.length}，目前 ${profile.path}`;
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (batch.signal.aborted || projectSerial !== state.serial) break;
      let result;
      try {
        result = await window.StaticAnalyzer.route("/api/analyze", {
          body: new FormData(),
          project: { entry: profile.path, sources, report },
          signal: batch.signal,
          summaryOnly: true,
        });
        if (batch.signal.aborted || projectSerial !== state.serial) break;
        completed++;
      } catch (error) {
        if (batch.signal.aborted || projectSerial !== state.serial) break;
        result = { path: profile.path, status: "error", error: error.message };
        failed++;
      }
      state.pageResults.set(profile.path, result);
      Object.assign(
        report.page_analysis.find((page) => page.path === profile.path),
        result,
      );
      const cells = rows.get(profile.path).children;
      cells[2].textContent = result.elements ?? "—";
      cells[3].textContent = result.css_rules ?? "—";
      cells[4].textContent = result.scripts ?? "—";
      cells[5].textContent =
        result.status === "error"
          ? result.error
          : result.missing.length
            ? `完成，缺少 ${result.missing.length} 個資源`
            : "完成";
    }
    if (projectSerial !== state.serial || state.batchController !== batch) return;
    if (batch.signal.aborted) {
      for (const page of report.page_analysis)
        if (page.status === "pending") {
          page.status = "cancelled";
          rows.get(page.path).lastElementChild.textContent = "已取消";
        }
    }
    $("#project-pages-status").textContent =
      `共找到 ${profiles.length} 個 HTML，已完成 ${completed} 個、失敗 ${failed} 個` +
      (batch.signal.aborted ? "，其餘已取消。" : "。不需要指定 index.html 或逐頁上傳。");
    $("#project-pages-cancel").hidden = true;
    state.batchController = null;
  }
  function download(data, name, type) {
    const a = node("a");
    const url = URL.createObjectURL(new Blob([data], { type }));
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function relation(link) {
    return {
      resolved: "已找到",
      missing: "找不到檔案",
      package: "套件依賴",
      external: "外部網址／頁內定位",
      unresolved: "待確認的別名／根路徑",
      skipped: "已略過的檔案",
    }[link.status];
  }
  function showFile(path) {
    const report = state.report,
      file = report.files.find((f) => f.path === path);
    if (!file) return;
    state.selected = path;
    document
      .querySelectorAll("#project-tree button")
      .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.path === path)));
    const panel = $("#project-detail");
    panel.replaceChildren();
    panel.append(
      node("h3", file.path),
      node("p", file.role, "project-role"),
      node(
        "p",
        `${file.lines === null ? "未讀取文字" : file.lines + " 行"} · ${(file.size / 1024).toFixed(1)} KB`,
        "muted",
      ),
    );
    if (/^html?$/.test(file.kind)) {
      const button = node("button", "直接分析這個網頁 ↓");
      button.type = "button";
      button.onclick = () => openPage(path);
      panel.append(button);
    }
    const section = (title, items) => {
      panel.append(node("h4", title));
      const ul = node("ul");
      if (!items.length) ul.append(node("li", "沒有可確認的線索"));
      for (const item of items)
        ul.append(typeof item === "string" ? node("li", item) : item);
      panel.append(ul);
    };
    section(
      "判斷依據",
      file.evidence.map((e) => `L${e.line}：${e.text}`),
    );
    section(
      "函式與方法",
      file.functions.map((f) => `L${f.line}：${f.async ? "async " : ""}${f.name}()`),
    );
    if (file.exports.length)
      section(
        "匯出項目",
        file.exports.map((e) => `L${e.line}：${e.name}`),
      );
    section(
      "這個檔案引用了什麼",
      report.links
        .filter((l) => l.from === path)
        .map((link) => {
          const li = node("li");
          li.append(node("span", `L${link.line} · ${relation(link)} · `));
          if (link.target) {
            const b = node("button", link.target);
            b.type = "button";
            b.onclick = () => showFile(link.target);
            li.append(b);
          } else li.append(node("code", link.reference));
          return li;
        }),
    );
    section(
      "哪些檔案引用它",
      report.links
        .filter((l) => l.target === path)
        .map((link) => {
          const li = node("li"),
            b = node("button", link.from + ` · L${link.line}`);
          b.type = "button";
          b.onclick = () => showFile(link.from);
          li.append(b);
          return li;
        }),
    );
    if (file.diagnostics.length) section("解析限制與錯誤", file.diagnostics);
    const source = state.sources.get(path);
    if (source !== null && source !== undefined) {
      const details = node("details");
      details.append(node("summary", "查看原始碼（最多顯示 60,000 字元）"));
      const pre = node("pre");
      pre.append(node("code", source.slice(0, 60000)));
      details.append(pre);
      panel.append(details);
    }
  }
  function renderTree() {
    const query = $("#project-search").value.trim().toLowerCase();
    const files = state.report.files.filter((f) =>
      (f.path + " " + f.role).toLowerCase().includes(query),
    );
    const tree = $("#project-tree");
    tree.replaceChildren();
    const directories = new Map([["", tree]]);
    for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
      const parts = file.path.split("/");
      let parent = "",
        container = tree;
      for (const part of parts.slice(0, -1)) {
        const key = parent ? parent + "/" + part : part;
        if (!directories.has(key)) {
          const d = node("details");
          d.open = !!query || key.split("/").length < 2;
          d.append(node("summary", part + "/"));
          const box = node("div", undefined, "project-folder");
          d.append(box);
          container.append(d);
          directories.set(key, box);
        }
        parent = key;
        container = directories.get(key);
      }
      const b = node("button", parts.at(-1));
      b.type = "button";
      b.dataset.path = file.path;
      b.title = file.role;
      b.setAttribute("aria-pressed", String(state.selected === file.path));
      b.onclick = () => showFile(file.path);
      container.append(b);
    }
    if (!files.length) tree.append(node("p", "沒有符合的檔案。"));
  }
  function render() {
    const r = state.report;
    $("#project-results").hidden = false;
    $("#project-map").hidden = false;
    $("#project-page-controls").hidden = false;
    $("#project-export").disabled = false;
    $("#project-notes").disabled = false;
    $("#project-title").textContent = r.root + " · 專案地圖";
    $("#project-summary").textContent =
      `${r.files.length} 個檔案 · ${r.entries.length} 個入口候選 · ${r.links.filter((l) => l.status === "resolved").length} 條已確認引用 · ${r.skipped.length} 個略過`;
    const overview = $("#project-overview");
    overview.replaceChildren();
    overview.append(
      node(
        "p",
        "辨識到的套件技術：" +
          (r.frameworks.join("、") || "未找到支援辨識的 package.json 套件"),
      ),
    );
    const start = node("p", "建議先看：");
    for (const path of r.entries.slice(0, 8)) {
      const b = node("button", path);
      b.type = "button";
      b.onclick = () => showFile(path);
      start.append(b);
    }
    if (!r.entries.length)
      start.append(node("span", "尚未辨識入口，可從 README 或 package.json 開始。"));
    overview.append(start);
    const notices = $("#project-notices");
    notices.replaceChildren();
    for (const limit of r.limitations) notices.append(node("li", limit));
    const missing = r.links.filter((l) => l.status === "missing");
    if (missing.length)
      notices.append(
        node("li", `${missing.length} 個相對引用找不到檔案，請點選各檔案查看路徑。`),
      );
    const details = $("#project-skipped");
    details.replaceChildren(node("summary", `略過檔案與原因 · ${r.skipped.length}`));
    const ul = node("ul");
    for (const item of r.skipped.slice(0, 200))
      ul.append(node("li", item.path + "：" + item.reason));
    if (r.skipped.length > 200)
      ul.append(node("li", "清單只顯示前 200 筆，完整清單可匯出 JSON。"));
    details.append(ul);
    $("#project-search").value = "";
    renderTree();
    showFile(
      r.entries[0] ||
        r.files.find((f) => /readme/i.test(f.path))?.path ||
        r.files[0]?.path,
    );
    state.pageProfiles = ProjectPage.profiles(r, state.sources);
    const pages = state.pageProfiles.map((page) => page.path);
    $("#project-page").replaceChildren(
      ...pages.map((path) => {
        const profile = state.pageProfiles.find((page) => page.path === path);
        const option = node(
          "option",
          (profile?.title && profile.title !== path ? profile.title + " · " : "") + path,
        );
        option.value = path;
        return option;
      }),
    );
    $("#project-page-picker").hidden = !pages.length;
    $("#project-page-link").hidden = true;
    if (pages.length) {
      openPage(pages[0]);
      scanAll(state.pageProfiles);
    } else {
      $("#project-page-status").textContent =
        "專案中沒有可讀取的 HTML 頁面。目前已分析原始碼職責與模組；React／Vue 等動態畫面需先啟動或建置專案，無法只靠原始碼還原。";
      $("#input-panel").hidden = true;
      $("#empty-state").hidden = true;
    }
    status("專案分析完成。已沿用資料夾內的檔案，不需要再次上傳。");
  }
  async function run(files) {
    stop();
    const serial = state.serial;
    window.PageWorkbench.reset();
    window.LocatorIndex?.clear();
    $("#project-page-controls").hidden = true;
    $("#project-results").hidden = true;
    $("#project-map").hidden = true;
    $("#project-map").open = false;
    $("#project-detail").replaceChildren();
    $("#project-export").disabled = true;
    $("#project-notes").disabled = true;
    $("#project-pages-overview").hidden = true;
    state.pageProfiles = [];
    state.report = null;
    state.sources.clear();
    $("#project-cancel").hidden = false;
    status("正在讀取資料夾…");
    try {
      const input = await ProjectCore.collect(
        files,
        (n, total) => {
          if (serial === state.serial) status(`正在讀取檔案 ${n} / ${total}…`);
        },
        () => serial !== state.serial,
      );
      if (serial !== state.serial) return;
      if (!input.entries.length)
        throw Error("沒有可分析的檔案；請選擇包含原始碼的專案資料夾。");
      state.sources = new Map(input.entries.map((e) => [e.path, e.source]));
      status("正在分析結構、職責與檔案引用…");
      const workerURL = new URL("project-worker.js", scriptURL);
      workerURL.search = new URL(scriptURL).search;
      const worker = new Worker(workerURL);
      state.worker = worker;
      const report = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          worker.terminate();
          reject(Error("分析超過 60 秒，請改選較小的專案資料夾。"));
        }, 60000);
        state.cancelTask = () => {
          clearTimeout(timer);
          reject(Error("已取消分析"));
        };
        worker.onmessage = (e) => {
          clearTimeout(timer);
          e.data.error ? reject(Error(e.data.error)) : resolve(e.data.report);
        };
        worker.onerror = () => {
          clearTimeout(timer);
          reject(Error("專案解析器無法啟動，請透過本機伺服器開啟網頁。"));
        };
        worker.postMessage(input);
      });
      worker.terminate();
      if (serial !== state.serial) return;
      state.worker = null;
      state.report = report;
      window.LocatorIndex?.setProject(state.sources, report);
      render();
    } catch (e) {
      if (serial === state.serial) status(e.message);
    } finally {
      if (serial === state.serial) {
        state.worker?.terminate();
        state.worker = null;
        state.cancelTask = null;
        $("#project-cancel").hidden = true;
        $("#project-folder").value = "";
      }
    }
  }
  const scriptURL = document.currentScript.src;
  $("#project-folder").onchange = (e) => {
    if (e.target.files.length) run([...e.target.files]);
  };
  $("#project-cancel").onclick = () => {
    stop();
    status("已取消。重新選擇資料夾即可分析。");
  };
  $("#project-page").onchange = (e) => openPage(e.target.value);
  $("#project-page-reanalyze").onclick = () => openPage($("#project-page").value);
  $("#project-pages-cancel").onclick = () => state.batchController?.abort();
  $("#project-search").oninput = () => {
    if (state.report) renderTree();
  };
  $("#project-export").onclick = () => {
    if (state.report)
      download(
        JSON.stringify(state.report, null, 2),
        "project-analysis.json",
        "application/json",
      );
  };
  $("#project-notes").onclick = () => {
    const r = state.report;
    if (!r) return;
    const lines = [
      "# " + r.root + " 專案說明",
      "",
      ...r.limitations.map((s) => "> " + s),
      "",
      "## 檔案職責",
    ];
    for (const f of r.files) {
      lines.push(
        "",
        "### " + f.path,
        f.role,
        ...f.evidence.map((e) => "- L" + e.line + "：" + e.text),
      );
    }
    if (r.page_analysis?.length) {
      lines.push("", "## 所有 HTML 的分析結果");
      for (const page of r.page_analysis)
        lines.push(
          "",
          "### " + page.path,
          page.title,
          "入口線索：" + page.reasons.join("、"),
          page.status === "done"
            ? `HTML 元素 ${page.elements}；CSS 規則 ${page.css_rules}；JS 檔案 ${page.scripts}；缺少資源 ${page.missing.length}。`
            : page.status === "error"
              ? "分析失敗：" + page.error
              : "狀態：" + page.status,
        );
    }
    lines.push(
      "",
      "## 檔案引用",
      ...r.links.map(
        (l) =>
          "- " + l.from + " → " + (l.target || l.reference) + "（" + relation(l) + "）",
      ),
    );
    download(lines.join("\n"), "project-notes.md", "text/markdown");
  };
})();
