/* Visual workspace around the existing analyzers. Nodes keep their original IDs and handlers. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const icon = (name) => {
    if (!name) return "";
    const paths = {
      folder: '<path d="M3 7h6l2 2h10v11H3z"/><path d="M3 7V4h6l2 3"/>',
      code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 20"/>',
      grid: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
      fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M8 8l8 8m-8 0 8-8"/>',
      play: '<path d="m8 4 12 8-12 8z"/>',
      list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
      download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.code}</svg>`;
  };
  function button(text, name, fn, cls = "") {
    const b = make("button", "canvas-button " + cls);
    b.type = "button";
    b.innerHTML = icon(name);
    b.append(make("span", "", text));
    b.onclick = fn;
    return b;
  }
  const header = $(".topbar");
  header.classList.add("flow-topbar");
  $(".brand-symbol").innerHTML = icon("code");
  $(".brand small").textContent = "選取畫面，找到原始檔與行號。";
  const nav = make("nav", "canvas-nav");
  nav.setAttribute("aria-label", "工作區顯示方式");
  const canvasButton = button(
    "流程畫布",
    "grid",
    () => setList(false),
    "active",
  );
  const listButton = button("列表", "list", () => setList(true));
  nav.append(canvasButton, listButton);
  header.insertBefore(nav, $(".top-actions"));
  const actions = $(".top-actions");
  const demo = $("#demo");
  demo.setAttribute("aria-label", "載入示範");
  demo.innerHTML = icon("play") + "<span>載入示範</span>";
  $("#export-report").setAttribute("aria-label", "匯出目前網頁分析");
  $("#export-report").innerHTML = icon("download") + "<span>匯出分析</span>";
  const openFolder = button(
    "開啟專案",
    "folder",
    () => $("#project-folder").click(),
    "canvas-primary",
  );
  actions.prepend(openFolder);
  const main = $("body > main");
  const canvas = make("section", "flow-canvas");
  canvas.id = "flow-canvas";
  canvas.setAttribute("aria-label", "可拖曳平移的網頁分析流程畫布");
  const world = make("div", "flow-world");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("flow-edges");
  svg.setAttribute("aria-hidden", "true");
  world.append(svg);
  canvas.append(world);
  canvas.prepend(make("h1", "canvas-sr-only", "網頁分析器專案流程工作區"));
  const caption = make("div", "canvas-caption");
  caption.append(
    make("span", "canvas-state-dot"),
    make("span", "", "WEB ANALYZER"),
    make("span", "canvas-caption-divider", "/"),
    make("span", "", "專案分析流程"),
  );
  canvas.append(caption);
  const hint = make(
    "p",
    "canvas-hint",
    "拖曳標題移動 · Ctrl / ⌘ + 滾輪縮放 ·「調整連線」自動儲存",
  );
  canvas.append(hint);
  main.prepend(canvas);
  function createNode(id, title, subtitle, color, x, y, width) {
    const el = make("section", "flow-node node-" + color);
    el.id = id;
    el.dataset.x = x;
    el.dataset.y = y;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.width = width + "px";
    const label = make("div", "flow-node-label");
    label.append(make("i", ""), make("span", "", subtitle));
    const heading = make("div", "flow-node-heading");
    heading.tabIndex = 0;
    heading.setAttribute("role", "group");
    heading.setAttribute("aria-label", title + "節點；可拖曳或按方向鍵移動");
    heading.append(make("h2", "", title), make("span", "node-grip", "⠿"));
    const body = make("div", "flow-node-content");
    el.append(label, heading, body);
    world.append(el);
    return { el, body, heading };
  }
  const source = createNode(
    "source-node",
    "專案來源",
    "Source",
    "green",
    40,
    230,
    280,
  );
  const pages = createNode(
    "pages-node",
    "頁面與入口",
    "Pages",
    "green",
    380,
    70,
    300,
  );
  const tree = createNode(
    "tree-node",
    "HTML 結構",
    "Structure",
    "blue",
    380,
    365,
    300,
  );
  const inspector = createNode(
    "inspector-node",
    "元素解析",
    "Inspect",
    "yellow",
    380,
    740,
    300,
  );
  const preview = createNode(
    "preview-node",
    "網頁預覽",
    "Preview",
    "blue",
    750,
    145,
    610,
  );
  const sourcePanel = $(".project-panel");
  source.body.append(sourcePanel);
  const projectHeading = $("#project-heading");
  projectHeading.textContent = "建立整個專案的原始位置索引";
  const intro = $(".project-heading .muted");
  intro.textContent =
    "選取資料夾，建立原始檔、符號與引用索引；點選元件找出相關程式碼位置。";
  const label = $("label[for='project-folder']");
  label.textContent = "選擇專案資料夾";
  const limits = $("#project-folder").nextElementSibling;
  const limitDetails = make("details", "source-limits");
  limitDetails.append(make("summary", "", "檔案範圍與分析限制"), limits);
  sourcePanel.append(limitDetails);
  const selectedProject = make("p", "canvas-project-name", "尚未載入專案");
  sourcePanel.insertBefore(selectedProject, $(".project-actions"));
  const pageControls = $("#project-page-controls");
  pages.body.append(pageControls);
  const pageEmpty = make(
    "div",
    "node-empty",
    "所有 HTML 都會被找到，主頁名稱不需要是 index.html。",
  );
  pages.body.append(pageEmpty);
  const pageTools = make("div", "node-tools");
  const pageListButton = button("所有頁面", "list", () =>
    openDialog(pagesDialog),
  );
  const fileMapButton = button("檔案地圖", "folder", () => {
    $("#project-map").open = true;
    openDialog(mapDialog);
  });
  pageTools.append(pageListButton, fileMapButton);
  pages.body.append(pageTools);
  const treePanel = $(".tree-panel");
  tree.body.append(treePanel);
  const treeEmpty = make(
    "div",
    "node-empty",
    "分析後，從這裡選擇 HTML 元素。每個節點都能追溯到原始碼。",
  );
  tree.body.append(treeEmpty);
  const inspectorPanel = $(".inspector");
  inspector.body.append(inspectorPanel);
  const inspectorEmpty = make(
    "div",
    "node-empty",
    "點選結構樹或預覽畫面，查看選中元素的 HTML、CSS 與 JavaScript。",
  );
  inspector.body.append(inspectorEmpty);
  const viewer = $(".viewer");
  preview.body.append(viewer);
  const inspectActions = make("div", "node-preview-actions");
  inspectActions.append(
    button("尋找元件相關程式碼", "code", () => openComponent()),
  );
  viewer.append(inspectActions);
  const previewEmpty = make("div", "preview-empty");
  const diagram = make("div", "preview-wireframe");
  diagram.innerHTML =
    '<div class="wire-nav"><i></i><span></span><span></span></div><div class="wire-main"><div><span></span><span></span><span></span><b></b></div><aside><i></i><i></i><i></i></aside></div><div class="wire-footer"><i></i><i></i><i></i></div>';
  const emptyDemo = $("#empty-demo");
  emptyDemo.textContent = "載入示範，看看如何連起來";
  previewEmpty.append(
    diagram,
    make("h3", "", "畫面與程式碼，一起看懂。"),
    make("p", "", "開啟專案，或先用示範探索。\n來源程式不會被執行。"),
    emptyDemo,
  );
  preview.body.append(previewEmpty);
  function createDialog(title, className) {
    const d = make("dialog", "canvas-dialog " + className);
    const bar = make("div", "dialog-heading");
    const h = make("h2", "", title);
    h.id = className + "-heading";
    d.setAttribute("aria-labelledby", h.id);
    const close = make("button", "dialog-close", "關閉 ✕");
    close.type = "button";
    close.onclick = () => d.close();
    bar.append(h, close);
    d.append(bar);
    document.body.append(d);
    d.addEventListener("click", (e) => {
      if (
        e.target === d &&
        (e.offsetX < 0 ||
          e.offsetY < 0 ||
          e.offsetX > d.clientWidth ||
          e.offsetY > d.clientHeight)
      )
        d.close();
    });
    return d;
  }
  const manualDialog = createDialog("單頁原始碼分析", "manual-dialog");
  manualDialog.append($("#input-panel"));
  const mapDialog = createDialog("專案檔案地圖", "map-dialog");
  mapDialog.append($("#project-map"));
  const pagesDialog = createDialog("所有網頁的分析結果", "pages-dialog");
  pagesDialog.append($("#project-pages-overview"));
  $("#project-pages-overview").addEventListener("click", (e) => {
    if (e.target.closest("button")) pagesDialog.close();
  });
  function openDialog(d) {
    if (!d.open) d.showModal();
  }
  const manualButton = button("分析單頁原始碼", "code", () => {
    $("#input-panel").hidden = false;
    openDialog(manualDialog);
  });
  source.body.append(manualButton);
  $("#toggle-input").onclick = () => {
    $("#input-panel").hidden = false;
    openDialog(manualDialog);
  };
  source.body.append($("#toggle-input"));
  $("#toggle-input").classList.add("canvas-legacy-toggle");
  const metrics = $(".summary");
  metrics.classList.add("canvas-metrics");
  document.body.append(metrics);
  const warningsDialog = createDialog("分析範圍與讀取紀錄", "warnings-dialog");
  warningsDialog.append($("#warnings"));
  $("#warnings").open = true;
  const infoButton = button("讀取紀錄", "list", () =>
    openDialog(warningsDialog),
  );
  metrics.append(infoButton);
  const oldEmpty = $("#empty-state");
  oldEmpty.hidden = true;
  const emptyFileMap = make(
    "p",
    "muted",
    "選取資料夾後，這裡會顯示完整檔案地圖。",
  );
  mapDialog.append(emptyFileMap);
  const emptyPageMap = make(
    "p",
    "muted",
    "選取資料夾後，這裡會列出每個頁面的分析結果。",
  );
  pagesDialog.append(emptyPageMap);
  const graph = [
    [source, pages],
    [pages, tree],
    [tree, inspector],
    [tree, preview],
  ];
  const paths = graph.map(() => {
    const p = document.createElementNS(svg.namespaceURI, "path");
    svg.append(p);
    return p;
  });
  let scale = 1,
    tx = 0,
    ty = 0,
    viewTouched = false;
  let edgeFrame = 0;
  function boxes() {
    return nodes.map((n) => ({
      id: n.el.id,
      x: n.el.offsetLeft,
      y: n.el.offsetTop,
      width: n.el.offsetWidth,
      height: n.el.offsetHeight,
    }));
  }
  function placeNode(el, x, y) {
    const allowed = CanvasLayout.canPlace(el.id, x, y, boxes());
    el.classList.toggle("movement-blocked", !allowed);
    if (allowed) {
      el.style.left = x + "px";
      el.style.top = y + "px";
      drawEdges();
    }
    return allowed;
  }
  function reflow() {
    if (
      matchMedia("(max-width:760px)").matches ||
      document.body.classList.contains("canvas-list")
    )
      return;
    for (const box of CanvasLayout.settle(boxes())) {
      const node = nodes.find((n) => n.el.id === box.id);
      node.el.style.top = box.y + "px";
    }
  }
  function drawEdges() {
    cancelAnimationFrame(edgeFrame);
    edgeFrame = requestAnimationFrame(() => {
      const connections = graph.map(([from, to], i) => {
        const box = (el) => ({
          x: el.offsetLeft,
          y: el.offsetTop,
          width: el.offsetWidth,
          height: el.offsetHeight,
        });
        const id = JSON.stringify([from.el.id, to.el.id]);
        const a = box(from.el),
          b = box(to.el);
        paths[i].setAttribute(
          "d",
          WireLayout.route(a, b, mainWires.state.routes[id]).d,
        );
        return {
          id,
          a,
          b,
          label:
            from.heading.querySelector("h2").textContent +
            " → " +
            to.heading.querySelector("h2").textContent,
        };
      });
      mainWires.sync(connections);
    });
  }
  const zoomTools = make("div", "canvas-zoom");
  const zoomLabel = make("output", "zoom-label", "100%");
  zoomLabel.setAttribute("aria-label", "畫布縮放比例");
  const zoomIn = button("＋", "", () => zoom(scale + 0.1));
  zoomIn.setAttribute("aria-label", "放大畫布");
  const zoomOut = button("−", "", () => zoom(scale - 0.1));
  zoomOut.setAttribute("aria-label", "縮小畫布");
  const fit = button("適合畫面", "fit", () => fitView());
  fit.title = "適合畫面";
  fit.setAttribute("aria-label", "適合畫面");
  const reset = button("重設", "grid", () => {
    for (const n of nodes) {
      n.el.style.left = n.el.dataset.x + "px";
      n.el.style.top = n.el.dataset.y + "px";
    }
    mainWires.clear();
    reflow();
    mainWires.saveNodes(boxes());
    initialView();
  });
  reset.title = "重設畫布";
  reset.setAttribute("aria-label", "重設畫布");
  zoomTools.append(zoomOut, zoomLabel, zoomIn, fit, reset);
  canvas.append(zoomTools);
  const nodes = [source, pages, tree, inspector, preview];
  const mainWireTools = make("div", "main-wire-tools");
  document.body.append(mainWireTools);
  const mainWires = new WireLayout.Editor(
    world,
    mainWireTools,
    "main",
    drawEdges,
  );
  for (const node of nodes) {
    const saved = mainWires.state.nodes[node.el.id];
    if (saved && saved.x >= 0 && saved.y >= 35) {
      node.el.style.left = saved.x + "px";
      node.el.style.top = saved.y + "px";
    }
  }
  const frame = $("#preview");
  let previewMode = "full",
    previewFullPage = false,
    previewHeight = 490;
  const previewSizeNote = make(
    "output",
    "preview-size-note",
    "預覽尺寸跟隨卡片；拖曳右下角調整",
  );
  const previewSizing = make("div", "preview-sizing");
  const expandPage = button("展開整頁", "", () => {
    previewFullPage = !previewFullPage;
    updatePreviewSize();
  });
  expandPage.setAttribute("aria-pressed", "false");
  const fitPreview = button("縮放看全頁", "fit", () => {
    if (!previewFullPage) {
      previewFullPage = true;
      updatePreviewSize();
    }
    viewTouched = true;
    scale = Math.max(
      0.02,
      Math.min(
        1,
        (canvas.clientWidth - 80) / preview.el.offsetWidth,
        (canvas.clientHeight - world.offsetTop - 110) / preview.el.offsetHeight,
      ),
    );
    tx =
      (canvas.clientWidth - preview.el.offsetWidth * scale) / 2 -
      preview.el.offsetLeft * scale;
    ty = 30 - preview.el.offsetTop * scale;
    transform();
  });
  previewSizing.append(previewSizeNote, expandPage, fitPreview);
  viewer.querySelector(".viewer-toolbar").after(previewSizing);
  const desktopButton = make("button", "", "桌面");
  desktopButton.type = "button";
  desktopButton.dataset.width = "1440";
  desktopButton.title = "桌面寬度 1440px";
  desktopButton.setAttribute("aria-pressed", "false");
  $(".width-tabs").insertBefore(desktopButton, $('[data-width="768"]'));
  function previewOverhead() {
    return (
      preview.heading.offsetHeight +
      viewer.querySelector(".viewer-toolbar").offsetHeight +
      previewSizing.offsetHeight +
      viewer.querySelector(".preview-notice").offsetHeight +
      viewer.querySelector(".selection-path").offsetHeight +
      inspectActions.offsetHeight +
      15
    );
  }
  function setCardSize(node, width, height) {
    node.el.classList.add("is-sized");
    node.el.style.width =
      Math.round(
        Math.max(node === preview ? 320 : 240, Math.min(2600, width)),
      ) + "px";
    node.el.style.height =
      Math.round(
        Math.max(node === preview ? 360 : 200, Math.min(24000, height)),
      ) + "px";
    reflow();
    drawEdges();
  }
  function refreshPreviewNote() {
    previewSizeNote.textContent =
      Math.round(frame.clientWidth) +
      " × " +
      Math.round(frame.clientHeight) +
      " px" +
      (previewFullPage ? " · 整頁高度" : " · 視窗高度") +
      "；外層畫布可獨立縮放";
  }
  function updatePreviewSize() {
    viewer.querySelector('[data-view="preview"]').click();
    if (previewMode !== "full")
      preview.el.style.width = Number(previewMode) + 30 + "px";
    preview.el.style.setProperty("--preview-height", previewHeight + 2 + "px");
    if (previewFullPage) {
      try {
        frame.style.setProperty("height", "1px", "important");
        const doc = frame.contentDocument;
        const height = Math.max(
          previewHeight,
          doc?.documentElement.scrollHeight || 0,
          doc?.body?.scrollHeight || 0,
        );
        preview.el.style.setProperty(
          "--preview-height",
          Math.min(23000, height + 2) + "px",
        );
      } catch {
      } finally {
        frame.style.removeProperty("height");
      }
    }
    setCardSize(
      preview,
      preview.el.offsetWidth,
      parseFloat(preview.el.style.getPropertyValue("--preview-height")) +
        previewOverhead(),
    );
    expandPage.textContent = previewFullPage ? "還原視窗高度" : "展開整頁";
    expandPage.setAttribute("aria-pressed", String(previewFullPage));
    refreshPreviewNote();
    preview.el.style.height =
      parseFloat(preview.el.style.getPropertyValue("--preview-height")) +
      previewOverhead() +
      "px";
    reflow();
  }
  for (const control of document.querySelectorAll("[data-width]"))
    control.addEventListener("click", () => {
      previewMode = control.dataset.width;
      previewHeight =
        previewMode === "768"
          ? 1024
          : previewMode === "375"
            ? 812
            : previewMode === "1440"
              ? 900
              : 490;
      document
        .querySelectorAll("[data-width]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === control)));
      frame.style.width = "100%";
      updatePreviewSize();
    });
  frame.addEventListener("load", () => {
    if (manualDialog.open && !$("#results").hidden) manualDialog.close();
    if (previewFullPage) updatePreviewSize();
    else refreshPreviewNote();
  });
  for (const node of nodes) {
    const resetSize = make("button", "node-size-reset", "↺");
    resetSize.type = "button";
    resetSize.title = "還原卡片大小";
    resetSize.setAttribute(
      "aria-label",
      "還原" + node.heading.querySelector("h2").textContent + "卡片大小",
    );
    resetSize.onclick = () => {
      node.el.classList.remove("is-sized");
      node.el.style.height = "";
      node.el.style.width =
        (node === source ? 280 : node === preview ? 610 : 300) + "px";
      if (node === preview) {
        previewMode = "full";
        previewFullPage = false;
        previewHeight = 490;
        node.el.style.removeProperty("--preview-height");
        frame.style.width = "100%";
        expandPage.textContent = "展開整頁";
        expandPage.setAttribute("aria-pressed", "false");
        document
          .querySelectorAll("[data-width]")
          .forEach((b) =>
            b.setAttribute("aria-pressed", String(b.dataset.width === "full")),
          );
        refreshPreviewNote();
      }
      reflow();
      drawEdges();
    };
    node.heading.append(resetSize);
    const grip = make("button", "node-resize-handle", "◢");
    grip.type = "button";
    grip.setAttribute(
      "aria-label",
      "調整" + node.heading.querySelector("h2").textContent + "卡片大小",
    );
    grip.title = "拖曳調整大小，或用方向鍵調整寬高";
    node.el.append(grip);
    const resizeCard = (width, height) => {
      if (node === preview) {
        const overhead = previewOverhead();
        previewMode = "full";
        previewFullPage = false;
        previewHeight = Math.max(120, height - overhead);
        node.el.style.setProperty("--preview-height", previewHeight + "px");
        frame.style.width = "100%";
        expandPage.textContent = "展開整頁";
        expandPage.setAttribute("aria-pressed", "false");
        document
          .querySelectorAll("[data-width]")
          .forEach((b) =>
            b.setAttribute("aria-pressed", String(b.dataset.width === "full")),
          );
      }
      setCardSize(node, width, height);
      if (node === preview) {
        const minimum = previewOverhead() + 122;
        if (node.el.offsetHeight < minimum)
          node.el.style.height = minimum + "px";
        previewHeight = node.el.offsetHeight - previewOverhead() - 2;
        node.el.style.setProperty("--preview-height", previewHeight + 2 + "px");
        refreshPreviewNote();
        reflow();
      }
    };
    grip.onpointerdown = (e) => {
      if (
        e.button !== 0 ||
        matchMedia("(max-width:760px)").matches ||
        document.body.classList.contains("canvas-list")
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      viewTouched = true;
      const x = e.clientX,
        y = e.clientY,
        width = node.el.offsetWidth,
        height = node.el.offsetHeight,
        resizeScale = scale;
      grip.setPointerCapture(e.pointerId);
      grip.onpointermove = (ev) =>
        resizeCard(
          width + (ev.clientX - x) / resizeScale,
          height + (ev.clientY - y) / resizeScale,
        );
      grip.onpointerup = grip.onpointercancel = () => {
        grip.onpointermove = null;
      };
    };
    grip.onkeydown = (e) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
        return;
      e.preventDefault();
      e.stopPropagation();
      resizeCard(
        node.el.offsetWidth +
          (e.key === "ArrowRight" ? 40 : e.key === "ArrowLeft" ? -40 : 0),
        node.el.offsetHeight +
          (e.key === "ArrowDown" ? 40 : e.key === "ArrowUp" ? -40 : 0),
      );
    };
  }
  function transform() {
    world.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
    zoomLabel.value = Math.round(scale * 100) + "%";
    drawEdges();
  }
  function zoom(
    value,
    x = canvas.clientWidth / 2,
    y = canvas.clientHeight / 2,
  ) {
    viewTouched = true;
    y -= world.offsetTop;
    const next = Math.max(0.02, Math.min(2, value));
    tx = x - ((x - tx) * next) / scale;
    ty = y - ((y - ty) * next) / scale;
    scale = next;
    transform();
  }
  function initialView() {
    viewTouched = false;
    scale = Math.min(1, Math.max(0.75, (canvas.clientWidth - 70) / 1380));
    tx = 20;
    ty = 0;
    transform();
  }
  function fitView() {
    viewTouched = true;
    const right =
      Math.max(...nodes.map((n) => n.el.offsetLeft + n.el.offsetWidth)) + 40;
    const bottom =
      Math.max(...nodes.map((n) => n.el.offsetTop + n.el.offsetHeight)) + 60;
    scale = Math.max(
      0.02,
      Math.min(
        1,
        (canvas.clientWidth - 60) / right,
        (canvas.clientHeight - world.offsetTop - 100) / bottom,
      ),
    );
    tx = 30;
    ty = 20;
    transform();
  }
  function focusNode(node) {
    if (
      matchMedia("(max-width:760px)").matches ||
      document.body.classList.contains("canvas-list")
    ) {
      node.el.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
      return;
    }
    viewTouched = true;
    tx =
      (canvas.clientWidth - node.el.offsetWidth * scale) / 2 -
      node.el.offsetLeft * scale;
    ty = 100 - node.el.offsetTop * scale;
    transform();
    node.heading.focus({ preventScroll: true });
  }
  function setList(value) {
    if (document.body.classList.contains("component-mode")) closeComponent();
    document.body.classList.toggle("canvas-list", value);
    canvasButton.classList.toggle("active", !value);
    listButton.classList.toggle("active", value);
    canvasButton.setAttribute("aria-pressed", String(!value));
    listButton.setAttribute("aria-pressed", String(value));
    drawEdges();
  }
  canvasButton.setAttribute("aria-pressed", "true");
  listButton.setAttribute("aria-pressed", "false");
  let dragging = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (
      e.button !== 0 ||
      matchMedia("(max-width:760px)").matches ||
      document.body.classList.contains("canvas-list")
    )
      return;
    if (
      e.target.closest(
        ".node-resize-handle,.node-size-reset,.wire-handle,.main-wire-tools",
      )
    )
      return;
    const heading = e.target.closest(".flow-node-heading");
    if (
      !heading &&
      e.target.closest(".flow-node,button,a,input,select,textarea")
    )
      return;
    viewTouched = true;
    dragging = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      tx,
      ty,
      node: heading?.parentElement,
      left: heading?.parentElement.offsetLeft,
      top: heading?.parentElement.offsetTop,
    };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("is-panning");
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const dx = e.clientX - dragging.x,
      dy = e.clientY - dragging.y;
    if (dragging.node) {
      placeNode(
        dragging.node,
        Math.max(0, dragging.left + dx / scale),
        Math.max(35, dragging.top + dy / scale),
      );
    } else {
      tx = dragging.tx + dx;
      ty = dragging.ty + dy;
      transform();
    }
  });
  function endDrag() {
    if (dragging?.node) mainWires.saveNodes(boxes());
    dragging?.node?.classList.remove("movement-blocked");
    dragging = null;
    canvas.classList.remove("is-panning");
  }
  canvas.addEventListener("scroll", () => {
    const dx = canvas.scrollLeft,
      dy = canvas.scrollTop;
    if (dx || dy) {
      tx -= dx;
      ty -= dy;
      canvas.scrollLeft = 0;
      canvas.scrollTop = 0;
      viewTouched = true;
      transform();
    }
  });
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (
        matchMedia("(max-width:760px)").matches ||
        document.body.classList.contains("canvas-list")
      )
        return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        zoom(
          scale - e.deltaY * 0.002,
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
      } else if (!e.target.closest(".flow-node,button")) {
        e.preventDefault();
        viewTouched = true;
        tx -= e.deltaX;
        ty -= e.deltaY;
        transform();
      }
    },
    { passive: false },
  );
  for (const n of nodes)
    n.heading.addEventListener("keydown", (e) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) ||
        document.body.classList.contains("canvas-list") ||
        matchMedia("(max-width:760px)").matches
      )
        return;
      e.preventDefault();
      placeNode(
        n.el,
        Math.max(
          0,
          n.el.offsetLeft +
            (e.key === "ArrowRight" ? 15 : e.key === "ArrowLeft" ? -15 : 0),
        ),
        Math.max(
          35,
          n.el.offsetTop +
            (e.key === "ArrowDown" ? 15 : e.key === "ArrowUp" ? -15 : 0),
        ),
      );
      setTimeout(() => n.el.classList.remove("movement-blocked"), 250);
      mainWires.saveNodes(boxes());
    });
  const detail = make("section", "component-workspace");
  detail.id = "component-workspace";
  detail.hidden = true;
  detail.setAttribute("aria-label", "逐層元件檢視");
  const detailTop = make("div", "component-top");
  const backButton = button("返回流程畫布", "grid", () => closeComponent());
  const upButton = button("上一層", "", () => {
    const selected = window.PageWorkbench.component();
    if (selected?.parent) openComponent(selected.parent);
  });
  const crumbs = make("nav", "component-breadcrumbs");
  crumbs.setAttribute("aria-label", "元件層級路徑");
  detailTop.append(backButton, upButton, crumbs);
  const detailHeading = make("div", "component-heading");
  const detailTitle = make("h1", "", "元件檢視");
  detailTitle.tabIndex = -1;
  const detailMeta = make("p", "", "");
  detailHeading.append(detailTitle, detailMeta);
  const columns = make("div", "component-columns");
  const childPanel = make("aside", "component-children");
  const childTitle = make("h2", "", "子元件");
  const childList = make("div", "component-child-list");
  childPanel.append(childTitle, childList);
  const codePanel = make("section", "component-source");
  const codeToolbar = make("div", "component-code-toolbar");
  const codeLabel = make("span", "", "目前元件的 HTML");
  const formatButton = button("排版", "code", async () => {
    if (!detailSource) return;
    const request = detailRequest;
    formatButton.disabled = true;
    try {
      const formatted = await window.PageWorkbench.formatComponentSource(
        detailSource,
        detailKind,
      );
      if (request === detailRequest) componentCode.textContent = formatted;
    } catch (e) {
      if (request === detailRequest)
        detailMeta.textContent = "排版未完成：" + e.message;
    } finally {
      if (request === detailRequest) formatButton.disabled = false;
    }
  });
  const copyButton = button("複製", "", async () => {
    try {
      await navigator.clipboard.writeText(componentCode.textContent);
      detailMeta.textContent = "已複製目前顯示的程式碼。";
    } catch (e) {
      detailMeta.textContent = "無法自動複製，請選取程式碼後複製。";
    }
  });
  const backToHtml = button("元件 HTML", "", () => openComponent());
  codeToolbar.append(codeLabel, backToHtml, formatButton, copyButton);
  const componentCode = make("pre", "component-code");
  componentCode.id = "component-code";
  componentCode.tabIndex = 0;
  componentCode.setAttribute("aria-label", "目前元件原始碼");
  const jsLearning = make("section", "learning-panel component-js-learning");
  jsLearning.id = "component-js-learning";
  jsLearning.hidden = true;
  const explainJS = () => {
    jsLearning.hidden = true;
  };
  const teachButton = button("解釋這段 JS", "", () => explainJS(detailSource));
  codeToolbar.append(teachButton);
  codePanel.append(codeToolbar, componentCode, jsLearning);
  const detailInspector = make("aside", "component-inspector");
  detailInspector.id = "component-inspector";
  columns.append(childPanel, codePanel, detailInspector);
  const flowSection = make("section", "component-flow-section");
  const flowTop = make("div", "component-flow-top");
  flowTop.append(make("h2", "", "元件 JavaScript 流程"));
  const flowMinus = button("−", "", () => changeFlowScale(-0.1));
  const flowPlus = button("+", "", () => changeFlowScale(0.1));
  const flowReset = button("重設排列", "", () => {
    functionPositions.clear();
    functionWires.state.nodes = {};
    functionWires.save();
    renderComponentFlow();
  });
  flowMinus.setAttribute("aria-label", "縮小元件流程圖");
  flowPlus.setAttribute("aria-label", "放大元件流程圖");
  const flowScaleLabel = make("output", "", "100%");
  flowTop.append(flowMinus, flowScaleLabel, flowPlus, flowReset);
  const flowNote = make("p", "component-flow-note");
  const flowCanvas = make("div", "component-flow-canvas");
  flowCanvas.tabIndex = 0;
  flowCanvas.setAttribute(
    "aria-label",
    "元件程式碼關聯畫布，可捲動瀏覽及拖曳節點",
  );
  const flowSpace = make("div", "component-flow-space");
  const flowWorld = make("div", "component-flow-world");
  flowSpace.append(flowWorld);
  flowCanvas.append(flowSpace);
  const flowEvidence = make("section", "component-flow-evidence");
  flowEvidence.hidden = true;
  flowEvidence.setAttribute("aria-label", "連線原始碼依據");
  const flowConnections = make("details", "component-flow-connections");
  flowSection.append(
    flowTop,
    flowNote,
    flowCanvas,
    flowEvidence,
    flowConnections,
  );
  detail.append(detailTop, detailHeading, flowSection, columns);
  document.body.append(detail);
  let detailRequest = 0,
    detailId = null,
    detailAnalysisId = null,
    detailSource = "",
    detailKind = "html",
    previousFocus = null;
  let flowScale = 1,
    currentFunctionFlow = null,
    expandedFunctions = new Set(),
    showAllFunctions = false,
    functionLimit = 40,
    functionPositions = new Map();
  function openFlowEvidence(edge, graph) {
    flowEvidence.replaceChildren();
    flowEvidence.hidden = false;
    const from = graph.nodes.find((n) => n.id === edge.from),
      to = graph.nodes.find((n) => n.id === edge.to);
    flowEvidence.append(
      make("h3", "", from.title + " → " + to.title),
      make(
        "p",
        "",
        edge.label +
          " · " +
          (edge.certainty === "confirmed"
            ? "已確認靜態關聯"
            : "可能相關，尚未確認執行時目標"),
      ),
    );
    for (const record of edge.evidence || []) {
      const item = button(
        record.file + ":" + record.line + ":" + record.column,
        "",
        () =>
          window.dispatchEvent(
            new CustomEvent("locator:open-block", { detail: record }),
          ),
      );
      item.classList.add("component-flow-proof");
      const source = window.LocatorIndex.source(record.file) || "";
      item.append(
        make(
          "code",
          "",
          source.slice(record.start, Math.min(record.end, record.start + 220)),
        ),
      );
      flowEvidence.append(item);
    }
    if (!edge.evidence?.length)
      flowEvidence.append(
        make("p", "", "這條關聯尚無可定位的呼叫語句，請對照兩端函式原始碼。"),
      );
    flowEvidence.append(
      button("關閉連線依據", "", () => {
        flowEvidence.hidden = true;
      }),
    );
    flowEvidence.scrollIntoView({ block: "nearest" });
  }
  function changeFlowScale(delta) {
    flowScale = Math.max(0.25, Math.min(1.5, flowScale + delta));
    flowWorld.style.transform = `scale(${flowScale})`;
    flowScaleLabel.textContent = Math.round(flowScale * 100) + "%";
    flowSpace.style.width =
      Number(flowWorld.dataset.width || 1000) * flowScale + "px";
    flowSpace.style.height =
      Number(flowWorld.dataset.height || 400) * flowScale + "px";
  }
  let functionLayoutKey = "";
  const functionWires = new WireLayout.Editor(
    flowWorld,
    flowTop,
    "functions-empty",
    () => renderComponentFlow(),
  );
  function renderComponentFlow(input) {
    const previousScroll = {
      left: flowCanvas.scrollLeft,
      top: flowCanvas.scrollTop,
    };
    if (input) {
      currentFunctionFlow = input;
      expandedFunctions.clear();
      showAllFunctions = false;
      functionLimit = 40;
      functionLayoutKey =
        "functions-" +
        WireLayout.hash(
          JSON.stringify([
            selectedProject.textContent,
            input.nodes
              .map((n) => [n.id, n.file, n.title, n.source])
              .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
          ]),
        );
      functionWires.setScope(functionLayoutKey);
      functionPositions = new Map(Object.entries(functionWires.state.nodes));
      flowEvidence.hidden = true;
    }
    const complete = currentFunctionFlow || {
      nodes: [],
      edges: [],
      warnings: [],
    };
    const projection = window.FunctionFlow.view(
      complete,
      expandedFunctions,
      showAllFunctions,
      functionLimit,
    );
    const graph = {
      ...complete,
      nodes: projection.nodes,
      edges: projection.edges,
    };
    flowConnections.replaceChildren(
      make(
        "summary",
        "",
        "連線清單 · " + graph.edges.length + " 條（可查看原始碼依據）",
      ),
    );
    for (const edge of graph.edges) {
      const a = complete.nodes.find((n) => n.id === edge.from),
        b = complete.nodes.find((n) => n.id === edge.to);
      flowConnections.append(
        button(a.title + " → " + b.title + " · " + edge.label, "", () =>
          openFlowEvidence(edge, complete),
        ),
      );
    }
    flowAll.textContent = showAllFunctions ? "逐層瀏覽" : "展開全部";
    flowAll.setAttribute("aria-pressed", String(showAllFunctions));
    flowMore.hidden = projection.remaining === 0;
    flowMore.textContent =
      "再顯示 40 個區塊（尚有 " + projection.remaining + " 個）";
    const first =
      graph.nodes.find((n) => n.kind === "functions") ||
      graph.nodes.find((n) => n.kind === "bindings") ||
      graph.nodes[0];
    if (first) explainJS(first.source);
    else jsLearning.hidden = true;
    functionWires.layer.remove();
    flowWorld.replaceChildren();
    flowNote.textContent =
      "先看元件變數、事件與直接處理函式，按節點的「展開下游」繼續追查。點函式看整段原檔，點連線看依據。" +
      " 目前顯示 " +
      graph.nodes.length +
      "／" +
      complete.nodes.length +
      " 個區塊。實線為已確認，虛線為可能相關。" +
      (graph.warnings.length ? " · " + graph.warnings.join("；") : "");
    if (!graph.nodes.length) {
      flowCanvas.hidden = true;
      functionWires.sync([]);
      flowConnections.hidden = true;
      flowNote.textContent +=
        " 尚未找到可連線的元件變數或函式。請查看下方搜尋範圍：來源缺失、解析失敗或動態寫法都可能讓關聯不完整。";
      return;
    }
    flowCanvas.hidden = false;
    flowConnections.hidden = false;
    const edges = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    edges.classList.add("component-flow-edges");
    flowWorld.append(edges);
    const cards = [],
      categories = {
        events: 0,
        functions: 1,
        calls: 2,
        selectors: 3,
        network: 3,
        writes: 3,
        storage: 3,
        timers: 3,
        bindings: 0,
      },
      bottoms = Array(9).fill(40);
    for (const node of graph.nodes) {
      const card = make("article", "component-flow-node");
      card.dataset.kind = node.kind;
      card.dataset.flowNode = node.id;
      const heading = make("button", "component-flow-handle", node.title);
      heading.type = "button";
      heading.title = "拖曳移動；方向鍵調整位置";
      const meta = make(
        "p",
        "",
        node.file +
          (node.line
            ? " · 第 " +
              node.line +
              (node.endLine > node.line ? "–" + node.endLine : "") +
              " 行"
            : ""),
      );
      const snippet = make("button", "component-flow-snippet");
      snippet.type = "button";
      snippet.setAttribute(
        "aria-label",
        "查看 " + node.title + " 的完整程式碼",
      );
      snippet.append(
        make(
          "pre",
          "",
          node.source.length > 8000
            ? node.source.slice(0, 8000) + "\n… 點選查看完整函式"
            : node.source,
        ),
      );
      snippet.onclick = () => {
        if (node.record) {
          window.dispatchEvent(
            new CustomEvent("locator:open-block", { detail: node.record }),
          );
          return;
        }
        ++detailRequest;
        detailSource = node.source;
        detailKind = "js";
        teachButton.disabled = false;
        codeLabel.textContent = "JavaScript · " + node.file;
        componentCode.textContent = node.source;
        explainJS(node.source);
        detailMeta.textContent =
          node.title + (node.line ? " · 第 " + node.line + " 行" : "");
        formatButton.disabled = false;
        copyButton.disabled = false;
        codePanel.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
      card.append(heading, meta, snippet);
      if (node.type === "function") {
        const downstream = [
          ...new Set(
            (projection.outgoing.get(node.id) || [])
              .filter((e) => e.to !== node.id)
              .map((e) => e.to),
          ),
        ];
        const upstream = (projection.incoming.get(node.id) || []).filter(
          (e) => e.from !== node.id,
        );
        const actions = make("div", "component-flow-actions");
        if (downstream.length) {
          const expand = button(
            (expandedFunctions.has(node.id) ? "收合下游" : "展開下游") +
              " · " +
              downstream.length +
              " 個區塊",
            "",
            () => {
              if (expandedFunctions.has(node.id))
                expandedFunctions.delete(node.id);
              else expandedFunctions.add(node.id);
              showAllFunctions = false;
              renderComponentFlow();
              [...flowWorld.querySelectorAll(".component-flow-node")]
                .find((c) => c.dataset.flowNode === node.id)
                ?.querySelector(".component-flow-actions button")
                ?.focus({ preventScroll: true });
            },
          );
          expand.disabled = showAllFunctions;
          expand.setAttribute(
            "aria-expanded",
            String(expandedFunctions.has(node.id) || showAllFunctions),
          );
          actions.append(expand);
        }
        if (upstream.length)
          actions.append(
            button("上游 · " + upstream.length + " 個區塊", "", () => {
              flowEvidence.replaceChildren(
                make("h3", "", node.title + " 的上游關聯"),
              );
              flowEvidence.hidden = false;
              for (const edge of upstream) {
                const from = complete.nodes.find((n) => n.id === edge.from);
                flowEvidence.append(
                  button(from.title + " · " + edge.label, "", () =>
                    openFlowEvidence(edge, complete),
                  ),
                );
              }
              flowEvidence.scrollIntoView({ block: "nearest" });
            }),
          );
        if (actions.childNodes.length) card.append(actions);
      }
      if (node.note) card.append(make("p", "flow-unresolved", node.note));
      flowWorld.append(card);
      const column = node.column ?? categories[node.kind] ?? 3;
      card.style.left = 35 + column * 340 + "px";
      card.style.top = bottoms[column] + "px";
      bottoms[column] += card.offsetHeight + 60;
      cards.push({ id: node.id, el: card });
      const saved = functionPositions.get(node.id);
      if (saved) {
        card.style.left = saved.x + "px";
        card.style.top = saved.y + "px";
      }
      const settled = window.CanvasLayout.settle(
        cards.map((c) => ({
          id: c.id,
          x: c.el.offsetLeft,
          y: c.el.offsetTop,
          width: c.el.offsetWidth,
          height: c.el.offsetHeight,
        })),
      );
      for (let i = 0; i < cards.length; i++) {
        cards[i].el.style.left = settled[i].x + "px";
        cards[i].el.style.top = settled[i].y + "px";
      }
      const geometry = () =>
        cards.map((c) => ({
          id: c.id,
          x: c.el.offsetLeft,
          y: c.el.offsetTop,
          width: c.el.offsetWidth,
          height: c.el.offsetHeight,
        }));
      const move = (x, y) => {
        if (window.CanvasLayout.canPlace(node.id, x, y, geometry())) {
          card.style.left = x + "px";
          card.style.top = y + "px";
          functionPositions.set(node.id, { x, y });
          draw();
        } else card.classList.add("movement-blocked");
      };
      heading.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        heading.setPointerCapture(e.pointerId);
        const x = e.clientX,
          y = e.clientY,
          left = card.offsetLeft,
          top = card.offsetTop;
        heading.onpointermove = (ev) =>
          move(
            left + (ev.clientX - x) / flowScale,
            top + (ev.clientY - y) / flowScale,
          );
        heading.onpointerup = () => {
          heading.onpointermove = null;
          card.classList.remove("movement-blocked");
          functionWires.saveNodes(geometry());
        };
        heading.onpointercancel = heading.onpointerup;
      };
      heading.onkeydown = (e) => {
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        )
          return;
        e.preventDefault();
        move(
          card.offsetLeft +
            (e.key === "ArrowRight" ? 15 : e.key === "ArrowLeft" ? -15 : 0),
          card.offsetTop +
            (e.key === "ArrowDown" ? 15 : e.key === "ArrowUp" ? -15 : 0),
        );
        functionWires.saveNodes(geometry());
        setTimeout(() => card.classList.remove("movement-blocked"), 250);
      };
    }
    function draw() {
      const width = Math.max(
          600,
          ...cards.map((c) => c.el.offsetLeft + c.el.offsetWidth + 40),
        ),
        height = Math.max(
          360,
          ...cards.map((c) => c.el.offsetTop + c.el.offsetHeight + 50),
        );
      flowWorld.style.width = width + "px";
      flowWorld.style.height = height + "px";
      flowWorld.dataset.width = width;
      flowWorld.dataset.height = height;
      edges.setAttribute("width", width);
      edges.setAttribute("height", height);
      edges.replaceChildren();
      const defs = document.createElementNS(edges.namespaceURI, "defs"),
        marker = document.createElementNS(edges.namespaceURI, "marker"),
        arrow = document.createElementNS(edges.namespaceURI, "path");
      marker.id = "component-flow-arrow";
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "9");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "6");
      marker.setAttribute("markerHeight", "6");
      marker.setAttribute("orient", "auto-start-reverse");
      arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      arrow.setAttribute("fill", "#9ab7a5");
      marker.append(arrow);
      defs.append(marker);
      edges.append(defs);
      const map = new Map(cards.map((c) => [c.id, c.el]));
      const connections = [];
      for (const edge of graph.edges) {
        const a = map.get(edge.from),
          b = map.get(edge.to);
        if (!a || !b) continue;
        const box = (el) => ({
          x: el.offsetLeft,
          y: el.offsetTop,
          width: el.offsetWidth,
          height: el.offsetHeight,
        });
        const id = JSON.stringify([edge.from, edge.to, edge.label]);
        const path = document.createElementNS(edges.namespaceURI, "path");
        const connection = {
          id,
          a: box(a),
          b: box(b),
          self: edge.from === edge.to,
          label:
            mapTitle(edge.from) +
            " → " +
            mapTitle(edge.to) +
            " · " +
            edge.label,
        };
        connections.push(connection);
        path.setAttribute(
          "d",
          WireLayout.route(
            connection.a,
            connection.b,
            functionWires.state.routes[id],
            connection.self,
          ).d,
        );
        path.setAttribute("marker-end", "url(#component-flow-arrow)");
        if (edge.certainty === "possible")
          path.setAttribute("stroke-dasharray", "5 5");
        const hit = document.createElementNS(edges.namespaceURI, "path");
        hit.setAttribute("d", path.getAttribute("d"));
        hit.classList.add("component-flow-edge-hit");
        hit.setAttribute("tabindex", "0");
        hit.setAttribute("role", "button");
        hit.setAttribute(
          "aria-label",
          "查看連線依據：" +
            mapTitle(edge.from) +
            " → " +
            mapTitle(edge.to) +
            " · " +
            edge.label,
        );
        hit.onclick = () => openFlowEvidence(edge, complete);
        hit.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openFlowEvidence(edge, complete);
          }
        };
        function mapTitle(id) {
          return complete.nodes.find((n) => n.id === id)?.title || id;
        }
        const title = document.createElementNS(edges.namespaceURI, "title");
        title.textContent = edge.label;
        path.append(title);
        edges.append(path, hit);
      }
      functionWires.sync(connections);
      changeFlowScale(0);
    }
    // Keep handle elements alive during dragging; rebuilding cards would lose pointer capture.
    functionWires.redraw = draw;
    for (const c of cards)
      functionPositions.set(c.id, { x: c.el.offsetLeft, y: c.el.offsetTop });
    draw();
    flowCanvas.scrollTop = input ? 0 : previousScroll.top;
    flowCanvas.scrollLeft = input ? 0 : previousScroll.left;
  }
  window.addEventListener("locator:function-flow", (event) =>
    renderComponentFlow(event.detail),
  );
  const fitFunctions = button("適合畫面", "fit", () => {
    flowScale = Math.max(
      0.25,
      Math.min(
        1,
        (flowCanvas.clientWidth - 12) / Number(flowWorld.dataset.width || 1000),
      ),
    );
    changeFlowScale(0);
  });
  const flowAll = button("展開全部", "", () => {
    showAllFunctions = !showAllFunctions;
    expandedFunctions.clear();
    renderComponentFlow();
  });
  const flowMore = button("再顯示 40 個區塊", "", () => {
    functionLimit += 40;
    renderComponentFlow();
  });
  flowMore.hidden = true;
  const restoreFunctions = button("還原配置", "", () => {
    functionPositions.clear();
    functionWires.clear();
    renderComponentFlow();
  });
  flowTop.append(fitFunctions, flowAll, flowMore, restoreFunctions);
  async function openComponent(id) {
    const selected = id
      ? window.PageWorkbench.selectComponent(id)
      : window.PageWorkbench.component();
    if (!selected) return;
    if (!document.body.classList.contains("component-mode"))
      previousFocus = document.activeElement;
    document.body.classList.add("component-mode");
    detail.hidden = false;
    detailInspector.append(inspectorPanel);
    detailId = selected.id;
    detailAnalysisId = selected.analysisId;
    const request = ++detailRequest;
    detailTitle.textContent = selected.label;
    detailMeta.textContent =
      "依原始檔案定位 HTML、CSS、JavaScript 與跨檔案引用。已確認、可能相關與查找缺口分開列出。";
    upButton.disabled = !selected.parent;
    crumbs.replaceChildren();
    for (const ancestor of selected.ancestors) {
      const crumb = make("button", "", ancestor.label);
      crumb.type = "button";
      crumb.onclick = () => openComponent(ancestor.id);
      if (ancestor.id === selected.id)
        crumb.setAttribute("aria-current", "page");
      crumbs.append(crumb);
    }
    childTitle.textContent = "子元件 · " + selected.children.length;
    childList.replaceChildren();
    for (const child of selected.children) {
      const childButton = make("button", "component-child");
      childButton.type = "button";
      childButton.append(
        make("strong", "", child.label),
        make(
          "span",
          "",
          child.text
            ? child.text.slice(0, 90)
            : "點入查看這個元件的結構與程式碼",
        ),
        make("i", "", "→"),
      );
      childButton.onclick = () => openComponent(child.id);
      childList.append(childButton);
    }
    if (!selected.children.length)
      childList.append(
        make("p", "component-leaf", "這是最內層元件，沒有其他子元素。"),
      );
    detailSource = "";
    detailKind = "html";
    teachButton.disabled = true;
    codeLabel.textContent = "目前元件的 HTML";
    componentCode.textContent = "正在讀取目前元件…";
    formatButton.disabled = true;
    copyButton.disabled = true;
    ((currentFunctionFlow = null),
      (expandedFunctions = new Set()),
      (showAllFunctions = false),
      (functionLimit = 40),
      (functionPositions = new Map()));
    function openFlowEvidence(edge, graph) {
      flowEvidence.replaceChildren();
      flowEvidence.hidden = false;
      const from = graph.nodes.find((n) => n.id === edge.from),
        to = graph.nodes.find((n) => n.id === edge.to);
      flowEvidence.append(
        make("h3", "", from.title + " → " + to.title),
        make(
          "p",
          "",
          edge.label +
            " · " +
            (edge.certainty === "confirmed"
              ? "已確認靜態關聯"
              : "可能相關，尚未確認執行時目標"),
        ),
      );
      for (const record of edge.evidence || []) {
        const item = button(
          record.file + ":" + record.line + ":" + record.column,
          "",
          () =>
            window.dispatchEvent(
              new CustomEvent("locator:open-block", { detail: record }),
            ),
        );
        item.classList.add("component-flow-proof");
        const source = window.LocatorIndex.source(record.file) || "";
        item.append(
          make(
            "code",
            "",
            source.slice(
              record.start,
              Math.min(record.end, record.start + 220),
            ),
          ),
        );
        flowEvidence.append(item);
      }
      if (!edge.evidence?.length)
        flowEvidence.append(
          make("p", "", "這條關聯尚無可定位的呼叫語句，請對照兩端函式原始碼。"),
        );
      flowEvidence.append(
        button("關閉連線依據", "", () => {
          flowEvidence.hidden = true;
        }),
      );
      flowEvidence.scrollIntoView({ block: "nearest" });
    }
    flowWorld.replaceChildren();
    flowCanvas.hidden = true;
    flowNote.textContent = "正在整理元件變數與完整函式…";
    window.dispatchEvent(
      new CustomEvent("analyzer:component", { detail: { id: selected.id } }),
    );
    detailTitle.focus({ preventScroll: true });
    try {
      const result = await window.PageWorkbench.componentSource(selected.id);
      if (
        request !== detailRequest ||
        detailAnalysisId !== result.analysisId ||
        !document.body.classList.contains("component-mode")
      )
        return;
      detailSource = result.source;
      componentCode.textContent = result.source;
      formatButton.disabled = false;
      copyButton.disabled = false;
      if (result.truncated)
        detailMeta.textContent =
          "元件片段超過顯示上限，已截取前 200,000 字元。";
    } catch (error) {
      if (request === detailRequest) {
        componentCode.textContent = "讀取失敗：" + error.message;
        detailMeta.textContent = "請返回畫布重新分析後，再開啟元件。";
      }
    }
  }
  function closeComponent() {
    ++detailRequest;
    detail.hidden = true;
    document.body.classList.remove("component-mode");
    inspector.body.prepend(inspectorPanel);
    detailId = null;
    detailAnalysisId = null;
    detailSource = "";
    if (previousFocus?.isConnected)
      previousFocus.focus({ preventScroll: true });
    reflow();
    drawEdges();
  }
  inspectorPanel.addEventListener(
    "click",
    (event) => {
      if (!document.body.classList.contains("component-mode")) return;
      const button = event.target.closest("button");
      if (button?.textContent === "看此元素片段") {
        event.preventDefault();
        event.stopImmediatePropagation();
        openComponent();
      }
    },
    true,
  );
  window.addEventListener("analyzer:source", (event) => {
    const value = event.detail;
    if (
      !document.body.classList.contains("component-mode") ||
      value.analysisId !== detailAnalysisId
    )
      return;
    ++detailRequest;
    detailSource = value.source;
    detailKind = value.kind;
    teachButton.disabled = value.kind !== "js";
    if (value.kind === "js") explainJS(value.source);
    else jsLearning.hidden = true;
    codeLabel.textContent =
      (value.kind === "js" ? "JS" : value.kind === "css" ? "CSS" : "HTML") +
      " · " +
      value.label;
    detailMeta.textContent =
      "正在對照「" +
      window.PageWorkbench.component().label +
      "」相關來源，第 " +
      value.line +
      " 行。可按「元件 HTML」回到目前元件。";
    componentCode.replaceChildren();
    const lines = value.source.split("\n");
    if (lines.length < 5000)
      lines.forEach((line, index) => {
        const span = make(
          "span",
          index + 1 === value.line ? "component-line-target" : "",
          line + (index < lines.length - 1 ? "\n" : ""),
        );
        componentCode.append(span);
      });
    else componentCode.textContent = value.source;
    const target = componentCode.querySelector(".component-line-target");
    componentCode.scrollTop = target
      ? target.offsetTop - componentCode.offsetTop - 20
      : 0;
    formatButton.disabled = false;
    copyButton.disabled = false;
  });
  new MutationObserver(() => {
    if (document.body.classList.contains("component-mode")) {
      const selected = window.PageWorkbench.component();
      if (selected?.analysisId !== detailAnalysisId) closeComponent();
      else if (selected?.id !== detailId) openComponent();
    }
  }).observe($("#selected-node"), { childList: true, subtree: true });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      document.body.classList.contains("component-mode") &&
      !document.querySelector("dialog[open]")
    ) {
      event.preventDefault();
      closeComponent();
    }
  });
  function update() {
    const ready = !$("#results").hidden;
    document.body.dataset.analysis = ready ? "ready" : "empty";
    treePanel.hidden = !ready;
    inspectorPanel.hidden = !ready;
    viewer.hidden = !ready;
    treeEmpty.hidden = ready;
    inspectorEmpty.hidden = ready;
    previewEmpty.hidden = ready;
    pageEmpty.hidden = !pageControls.hidden;
    pageListButton.disabled = $("#project-pages-overview").hidden;
    fileMapButton.disabled = $("#project-map").hidden;
    emptyFileMap.hidden = !$("#project-map").hidden;
    emptyPageMap.hidden = !$("#project-pages-overview").hidden;
    selectedProject.textContent =
      $("#project-title").textContent.replace(/ · 專案地圖$/, "") ||
      (ready ? $("#source-label").textContent : "尚未載入專案");
    infoButton.disabled = !ready;
    metrics.dataset.ready = String(ready);
    if (ready && manualDialog.open) manualDialog.close();
    drawEdges();
  }
  const observer = new MutationObserver(update);
  observer.observe($("#results"), {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  observer.observe(pageControls, {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  observer.observe($("#project-map"), {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  observer.observe($("#project-pages-overview"), {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  observer.observe($("#project-title"), { childList: true, subtree: true });
  const resize = new ResizeObserver(() => {
    reflow();
    drawEdges();
  });
  nodes.forEach((n) => resize.observe(n.el));
  window.addEventListener("resize", () => {
    if (!dragging) {
      if (!viewTouched) initialView();
      else drawEdges();
    }
  });
  update();
  reflow();
  initialView();
})();
