"use strict";
window.CSSLab = (() => {
  const edits = new Map(),
    drafts = new Map();
  let property = "height";
  const inherited = new Set([
    "color",
    "font-size",
    "font-family",
    "line-height",
    "visibility",
  ]);
  const properties = [
    "height",
    "width",
    "min-height",
    "max-width",
    "display",
    "position",
    "top",
    "left",
    "color",
    "background-color",
    "font-size",
    "line-height",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "box-sizing",
    "overflow-x",
    "flex-direction",
    "gap",
  ];
  const make = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const button = (text, action, id) => {
    const b = make("button", text);
    b.type = "button";
    b.onclick = action;
    if (id) b.id = id;
    return b;
  };
  function section(name, id, open = true) {
    const d = make("details", undefined, "css-lab-section");
    d.id = id;
    d.open = open;
    d.append(make("summary", name));
    return d;
  }
  function identify(e) {
    return e.tagName.toLowerCase() + (e.id ? "#" + e.id : "");
  }
  function specificity(selector) {
    // Deliberately limit ranking to simple selectors; do not guess functional pseudo specificity.
    if (/[\\:|&]/.test(selector)) return null;
    const attrs = selector.match(/\[(?:[^\]"']|"[^"]*"|'[^']*')*\]/g) || [];
    let rest = selector.replace(/\[(?:[^\]"']|"[^"]*"|'[^']*')*\]/g, "");
    const ids = (rest.match(/#[\w-]+/g) || []).length;
    const classes = (rest.match(/\.[\w-]+/g) || []).length + attrs.length;
    rest = rest.replace(/[#.][\w-]+/g, "");
    if (/[^\w\s*>+~-]/.test(rest)) return null;
    return [0, ids, classes, (rest.match(/[a-zA-Z][\w-]*/g) || []).length];
  }
  function splitSelectors(s) {
    let depth = 0,
      quote = "",
      part = "",
      out = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "\\") {
        part += c + (s[++i] || "");
        continue;
      }
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (c === "," && !depth) {
        out.push(part);
        part = "";
        continue;
      }
      part += c;
    }
    out.push(part);
    return out;
  }
  const compare = (a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  };
  function candidates(element, ctx, key) {
    const scratch = document.createElement("div").style;
    const result = [];
    ctx.report.css_rules.forEach((rule, index) => {
      scratch.cssText = rule.declarations
        .map(
          (d) =>
            d.property +
            ":" +
            d.value +
            (d.important ? " !important" : "") +
            ";",
        )
        .join("");
      const value = scratch.getPropertyValue(key),
        reset = scratch.getPropertyValue("all");
      if (!value && !reset) return;
      const matches = [];
      for (const selector of splitSelectors(rule.selector)) {
        try {
          if (element.matches(selector.trim()))
            matches.push(specificity(selector.trim()));
        } catch {}
      }
      if (!matches.length) return;
      const state = ctx.conditionState(rule, ctx.win);
      const complex =
        matches.some((x) => !x) ||
        rule.conditions.some((c) => !["media", "supports"].includes(c.type)) ||
        Boolean(reset);
      const spec = complex ? null : matches.sort(compare).at(-1);
      result.push({
        selector: rule.selector,
        value: value || "all: " + reset,
        important: scratch.getPropertyPriority(key) === "important",
        spec,
        index,
        state,
        complex,
        file: rule.file,
        line: rule.line,
      });
    });
    scratch.cssText = element.getAttribute("style") || "";
    const value = scratch.getPropertyValue(key),
      reset = scratch.getPropertyValue("all");
    if (value || reset)
      result.push({
        selector: edits.has(element.dataset.webAnalyzerNode)
          ? "行內 style（含練習修改）"
          : "元素行內 style",
        value: value || "all: " + reset,
        important: scratch.getPropertyPriority(key) === "important",
        spec: [1, 0, 0, 0],
        index: Infinity,
        state: "條件符合",
        complex: Boolean(reset),
        inline: true,
      });
    return result;
  }
  const structureNames = {
    width: "寬度",
    height: "高度",
    "min-width": "最小寬度",
    "max-width": "最大寬度",
    "min-height": "最小高度",
    "max-height": "最大高度",
    "box-sizing": "盒模型尺寸算法",
    display: "排版模型",
    position: "定位方式",
    top: "頂部位移",
    right: "右側位移",
    bottom: "底部位移",
    left: "左側位移",
    "z-index": "堆疊順序",
    "margin-top": "外距頂部",
    "margin-right": "外距右側",
    "margin-bottom": "外距底部",
    "margin-left": "外距左側",
    "padding-top": "內距頂部",
    "padding-right": "內距右側",
    "padding-bottom": "內距底部",
    "padding-left": "內距左側",
    "border-top-width": "頂部邊框寬度",
    "border-right-width": "右側邊框寬度",
    "border-bottom-width": "底部邊框寬度",
    "border-left-width": "左側邊框寬度",
    "border-style": "邊框樣式",
    "border-color": "邊框顏色",
    "border-radius": "圓角",
    color: "文字顏色",
    "background-color": "背景顏色",
    "font-size": "文字大小",
    "font-weight": "文字粗細",
    "line-height": "行高",
    "text-align": "文字對齊",
    "overflow-x": "水平溢出",
    "overflow-y": "垂直溢出",
    "flex-direction": "主軸方向",
    "flex-wrap": "換行方式",
    "justify-content": "主軸分配",
    "align-items": "交叉軸對齊",
    "align-content": "多行對齊",
    "row-gap": "列間距",
    "column-gap": "欄間距",
    "flex-grow": "伸展比例",
    "flex-shrink": "收縮比例",
    "flex-basis": "基礎尺寸",
    order: "排列順序",
    "align-self": "個別對齊",
    "grid-template-columns": "欄軌道配置",
    "grid-template-rows": "列軌道配置",
    "grid-auto-flow": "自動排列方向",
    "grid-column": "所在欄",
    "grid-row": "所在列",
    "justify-items": "格內水平對齊",
    "justify-self": "個別水平對齊",
    transform: "視覺變形",
  };
  const structureOpen = new Map();
  function renderStructure(box, ctx) {
    const { element, win, node } = ctx,
      rows = [];
    const computed = () => win.getComputedStyle(element);
    const heading = make("div", undefined, "css-structure-heading");
    heading.append(
      make("h3", "CSS 結構"),
      make(
        "p",
        "先選取預覽或 HTML 結構中的元素；修改欄位即時套用到預覽。僅改預覽，不寫回來源檔。",
        "muted",
      ),
    );
    const groups = [];
    const toggleAll = button("全部展開", () => {
      const open = groups.some((g) => !g.open);
      for (const g of groups) {
        g.open = open;
        structureOpen.set(g.id, open);
      }
      toggleAll.textContent = open ? "全部收合" : "全部展開";
    });
    heading.append(toggleAll);
    box.append(heading);
    function group(title, id, open) {
      const g = section(title, id, structureOpen.get(id) ?? open);
      g.addEventListener("toggle", () => structureOpen.set(id, g.open));
      groups.push(g);
      box.append(g);
      return g;
    }
    function declared(target, key) {
      const inline = target.style.getPropertyValue(key);
      if (inline) return { value: inline, source: "預覽行內設定" };
      const all = candidates(target, ctx, key).filter(
        (x) => x.state === "條件符合",
      );
      if (all.some((x) => x.complex || !x.spec))
        return {
          value: win.getComputedStyle(target).getPropertyValue(key),
          source: "運算值（規則需另外判斷）",
        };
      all.sort(
        (a, b) =>
          Number(a.important) - Number(b.important) ||
          compare(a.spec, b.spec) ||
          a.index - b.index,
      );
      const found = all.at(-1);
      return found
        ? {
            value: found.value,
            source:
              found.selector +
              (found.file ? " · " + found.file + ":" + found.line : ""),
          }
        : {
            value: win.getComputedStyle(target).getPropertyValue(key),
            source: "運算值／瀏覽器預設",
          };
    }
    function update() {
      for (const row of rows)
        row.current.textContent =
          "目前運算值：" +
          win.getComputedStyle(row.target).getPropertyValue(row.key);
      explain();
    }
    function fields(container, target, keys) {
      for (const key of keys) {
        const record = declared(target, key),
          row = make("div", undefined, "css-parameter-row");
        const label = make(
          "label",
          key + "（" + (structureNames[key] || "原始屬性") + "）：",
        );
        const controls = make("div", undefined, "css-parameter-controls"),
          value = make("input"),
          unit = make("select");
        value.type = "text";
        value.spellcheck = false;
        value.setAttribute(
          "aria-label",
          identify(target) + " " + key + " 設定值",
        );
        unit.setAttribute("aria-label", identify(target) + " " + key + " 單位");
        for (const u of [
          "",
          "px",
          "%",
          "em",
          "rem",
          "vw",
          "vh",
          "vmin",
          "vmax",
          "ch",
          "svh",
          "dvh",
          "fr",
          "deg",
          "s",
          "ms",
        ]) {
          const o = make("option", u || "無／包含於值");
          o.value = u;
          unit.append(o);
        }
        const match = record.value
          .trim()
          .match(
            /^(-?(?:\d*\.)?\d+)(px|%|em|rem|vw|vh|vmin|vmax|ch|svh|dvh|fr|deg|ms|s)?$/,
          );
        value.value = match ? match[1] : record.value;
        unit.value = match ? match[2] || "" : "";
        label.append(value); // Keep the visible name explicitly associated with its input.
        const current = make(
          "small",
          "目前運算值：" + win.getComputedStyle(target).getPropertyValue(key),
          "css-parameter-computed",
        );
        const feedback = make("small", "", "css-parameter-feedback");
        feedback.setAttribute("aria-live", "polite");
        const source = make(
          "small",
          "初始值依據：" + record.source,
          "css-parameter-source",
        );
        function apply() {
          const raw = value.value.trim(),
            next = raw + unit.value;
          if (
            !raw ||
            /[;{}]|url\s*\(|@import/i.test(next) ||
            !win.CSS.supports(key, next)
          ) {
            feedback.textContent = "此值或單位不適用，預覽保留上次有效設定。";
            value.setAttribute("aria-invalid", "true");
            return;
          }
          const id = target.dataset.webAnalyzerNode || "parent:" + node.id;
          const original = edits.get(id) || {
            original: target.getAttribute("style"),
            element: target,
          };
          target.style.setProperty(key, next, "important");
          edits.set(id, { ...original, draft: target.style.cssText });
          drafts.set(id, target.style.cssText);
          value.removeAttribute("aria-invalid");
          feedback.textContent = "已即時套用：" + key + ": " + next;
          update();
        }
        value.oninput = apply;
        unit.onchange = apply;
        const restore = button("還原", () => {
          const id = target.dataset.webAnalyzerNode || "parent:" + node.id,
            entry = edits.get(id);
          if (entry) {
            const original = make("div").style;
            original.cssText = entry.original || "";
            const old = original.getPropertyValue(key);
            if (old)
              target.style.setProperty(
                key,
                old,
                original.getPropertyPriority(key),
              );
            else target.style.removeProperty(key);
            entry.draft = target.style.cssText;
            drafts.set(id, entry.draft);
          }
          const now = declared(target, key).value,
            m = now
              .trim()
              .match(
                /^(-?(?:\d*\.)?\d+)(px|%|em|rem|vw|vh|vmin|vmax|ch|svh|dvh|fr|deg|ms|s)?$/,
              );
          value.value = m ? m[1] : now;
          unit.value = m ? m[2] || "" : "";
          feedback.textContent = "已還原此屬性";
          value.removeAttribute("aria-invalid");
          update();
        });
        controls.append(label, unit, restore);
        row.append(controls, current, source, feedback);
        container.append(row);
        rows.push({ target, key, current });
      }
    }
    fields(group("基本尺寸與盒模型", "css-basic-fields", true), element, [
      "width",
      "height",
      "min-width",
      "max-width",
      "min-height",
      "max-height",
      "box-sizing",
    ]);
    fields(group("外距 margin", "css-margin-fields", true), element, [
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
    ]);
    fields(group("內距 padding", "css-padding-fields", false), element, [
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
    ]);
    fields(group("定位與位移", "css-position-fields", false), element, [
      "display",
      "position",
      "top",
      "right",
      "bottom",
      "left",
      "z-index",
      "transform",
    ]);
    fields(group("文字、背景與邊框", "css-appearance-fields", false), element, [
      "font-size",
      "font-weight",
      "line-height",
      "text-align",
      "color",
      "background-color",
      "border-top-width",
      "border-right-width",
      "border-bottom-width",
      "border-left-width",
      "border-style",
      "border-color",
      "border-radius",
      "overflow-x",
      "overflow-y",
    ]);
    const parent = element.parentElement,
      model = group("上一層模型：為什麼元素在這裡？", "css-parent-model", true),
      explanation = make("p", "", "info-box");
    model.append(explanation);
    function explain() {
      const own = computed(),
        r = element.getBoundingClientRect();
      if (!parent) {
        explanation.textContent =
          "此元素沒有父元素；位置以文件根節點與視窗為參考。";
        return;
      }
      const p = win.getComputedStyle(parent),
        pr = parent.getBoundingClientRect(),
        display = p.display;
      const why = display.includes("flex")
        ? "Flex：父層 flex-direction 決定主軸，justify-content 分配主軸空間，align-items 對齊交叉軸；子元素 flex-basis／grow／shrink 與 align-self 也參與排版。"
        : display.includes("grid")
          ? "Grid：父層 grid-template-columns／rows 決定軌道，gap 決定間距；子元素 grid-column／row 決定格位，align-self／justify-self 調整格內對齊。"
          : "一般文件流：父層內容區、padding、子元素 display／寬高與 margin 共同影響位置；相鄰外距在部分區塊排版中可能合併。";
      explanation.textContent =
        "父層 " +
        identify(parent) +
        "，display: " +
        display +
        "。" +
        why +
        " 本元素 position: " +
        own.position +
        "；目前左上角相對父層邊界約為 x=" +
        Math.round(r.left - pr.left) +
        "px、y=" +
        Math.round(r.top - pr.top) +
        "px。" +
        (["absolute", "fixed"].includes(own.position)
          ? "此元素脫離正常排版；位移請參考 offsetParent " +
            (element.offsetParent
              ? identify(element.offsetParent)
              : "視窗或包含區塊") +
            "，transform 等祖先設定也可能改變參考範圍。"
          : "這是排版關係線索，並非單一屬性造成位置的證明。");
    }
    if (parent) {
      if (parent.dataset.webAnalyzerNode)
        model.append(
          button("選取上一層", () =>
            ctx.selectNode(parent.dataset.webAnalyzerNode),
          ),
        );
      const parentFields = section(
        "父層實際參數（可即時調整）",
        "css-parent-parameters",
        structureOpen.get("css-parent-parameters") ?? false,
      );
      groups.push(parentFields);
      parentFields.addEventListener("toggle", () =>
        structureOpen.set(parentFields.id, parentFields.open),
      );
      model.append(parentFields);
      fields(parentFields, parent, [
        "display",
        "width",
        "height",
        "position",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "flex-direction",
        "flex-wrap",
        "justify-content",
        "align-items",
        "align-content",
        "row-gap",
        "column-gap",
        "grid-template-columns",
        "grid-template-rows",
        "grid-auto-flow",
        "justify-items",
      ]);
      const childFields = section(
        "本元素在父層模型中的參數",
        "css-child-parameters",
        structureOpen.get("css-child-parameters") ?? false,
      );
      groups.push(childFields);
      childFields.addEventListener("toggle", () =>
        structureOpen.set(childFields.id, childFields.open),
      );
      model.append(childFields);
      fields(childFields, element, [
        "flex-grow",
        "flex-shrink",
        "flex-basis",
        "order",
        "align-self",
        "grid-column",
        "grid-row",
        "justify-self",
      ]);
    }
    explain();
  }
  function render(box, ctx) {
    const { element, win, node, refresh } = ctx;
    if (!element) return;
    renderStructure(box, ctx);
    const computed = win.getComputedStyle(element);
    const model = section("盒模型圖與補充關係", "box-model", false);
    const margin = make("div", undefined, "box-layer box-margin");
    const border = make("div", undefined, "box-layer box-border");
    const padding = make("div", undefined, "box-layer box-padding");
    const values = (prefix, suffix = "") =>
      ["top", "right", "bottom", "left"]
        .map((side) => computed.getPropertyValue(prefix + "-" + side + suffix))
        .join(" / ");
    margin.append(make("div", "margin · " + values("margin"), "box-caption"));
    border.append(
      make("div", "border · " + values("border", "-width"), "box-caption"),
    );
    padding.append(
      make("div", "padding · " + values("padding"), "box-caption"),
    );
    const num = (p) => parseFloat(computed.getPropertyValue(p)) || 0;
    const width = parseFloat(computed.width),
      height = parseFloat(computed.height);
    const contentWidth =
      computed.boxSizing === "border-box"
        ? width -
          num("padding-left") -
          num("padding-right") -
          num("border-left-width") -
          num("border-right-width")
        : width;
    const contentHeight =
      computed.boxSizing === "border-box"
        ? height -
          num("padding-top") -
          num("padding-bottom") -
          num("border-top-width") -
          num("border-bottom-width")
        : height;
    const px = (n) =>
      Number.isFinite(n) ? Math.max(0, n).toFixed(1) + "px" : "auto";
    padding.append(
      make(
        "div",
        "內容 " + px(contentWidth) + " × " + px(contentHeight),
        "box-content",
      ),
    );
    border.append(padding);
    margin.append(border);
    model.append(
      margin,
      make(
        "p",
        "四邊數值依序為：上／右／下／左。內容尺寸依運算樣式估算，inline、多欄或 transform 可能與畫面邊界不同。",
        "muted",
      ),
    );
    const rect = element.getBoundingClientRect(),
      parent = element.parentElement;
    const info = make("dl", undefined, "attributes");
    for (const [key, value] of [
      [
        "畫面邊界",
        rect.width.toFixed(1) + " × " + rect.height.toFixed(1) + " px",
      ],
      ["box-sizing", computed.boxSizing],
      ["position", computed.position],
      ["display", computed.display],
    ])
      info.append(make("dt", key), make("dd", value));
    if (parent) {
      const r = parent.getBoundingClientRect();
      info.append(
        make("dt", "直接父元素"),
        make(
          "dd",
          identify(parent) +
            " · " +
            r.width.toFixed(1) +
            " × " +
            r.height.toFixed(1) +
            " px",
        ),
      );
    }
    model.append(info);
    if (parent?.dataset.webAnalyzerNode)
      model.append(
        button(
          "選取父元素",
          () => ctx.selectNode(parent.dataset.webAnalyzerNode),
          "css-select-parent",
        ),
      );
    if (["absolute", "fixed"].includes(computed.position)) {
      const offset = element.offsetParent;
      model.append(
        make(
          "p",
          offset
            ? "瀏覽器回報的 offsetParent：" +
                identify(offset) +
                "。這是位移參考線索；transform、contain 等也可能建立定位容器。"
            : "沒有 offsetParent；fixed 常以視窗定位，transform 等祖先設定可能改變其參考容器。",
          "info-box",
        ),
      );
    }
    if (element.scrollWidth > element.clientWidth + 1)
      model.append(
        make(
          "p",
          "內容寬度超過可視內容區：scrollWidth " +
            element.scrollWidth +
            "px > clientWidth " +
            element.clientWidth +
            "px。請檢查子元素寬度與 overflow-x。",
          "info-box",
        ),
      );
    box.append(model);

    const cascade = section("哪一條 CSS 在控制它？", "css-cascade", false);
    const select = make("select");
    select.id = "css-property";
    select.setAttribute("aria-label", "要追查的 CSS 屬性");
    for (const key of properties) {
      const option = make("option", key);
      option.value = key;
      select.append(option);
    }
    select.value = property;
    const details = make("div");
    cascade.append(select, details);
    box.append(cascade);
    function draw() {
      property = select.value;
      details.replaceChildren();
      details.append(
        make(
          "p",
          "瀏覽器實際運算值：" +
            win.getComputedStyle(element).getPropertyValue(property),
          "computed-value",
        ),
      );
      let source = element,
        items = candidates(source, ctx, property);
      let active = items.filter((x) => x.state === "條件符合");
      if (
        !active.length &&
        !items.some((x) => x.state === "條件需另外判斷") &&
        inherited.has(property)
      ) {
        let p = element.parentElement;
        while (p) {
          const found = candidates(p, ctx, property);
          if (found.some((x) => x.state === "條件符合")) {
            source = p;
            items = found;
            active = items.filter((x) => x.state === "條件符合");
            break;
          }
          p = p.parentElement;
        }
      }
      if (source !== element)
        details.append(
          make(
            "p",
            "此屬性可繼承；以下是祖先 " +
              identify(source) +
              " 的宣告線索。相對單位與瀏覽器預設也可能影響結果。",
            "info-box",
          ),
        );
      const uncertain =
        items.some((x) => x.complex || x.state === "條件需另外判斷") ||
        active.some(
          (x) =>
            /^(inherit|initial|unset|revert|revert-layer)$/.test(x.value) ||
            x.value.includes("var("),
        );
      active.sort(
        (a, b) =>
          Number(a.important) - Number(b.important) ||
          compare(a.spec || [0, 0, 0, 0], b.spec || [0, 0, 0, 0]) ||
          a.index - b.index,
      );
      const winner = active.at(-1);
      if (uncertain)
        details.append(
          make(
            "p",
            "包含複雜選擇器、layer、重設關鍵字或變數；此處不判定唯一勝出規則，請以運算值和原始碼交叉確認。",
            "info-box",
          ),
        );
      if (!items.length)
        details.append(
          make(
            "p",
            "沒有找到可直接追查的宣告。數值可能來自 auto 排版、繼承、瀏覽器預設、邏輯屬性或未納入分析的規則。",
            "muted",
          ),
        );
      for (const item of items) {
        const card = make("div", undefined, "rule-card cascade-rule");
        const eligible = item.state === "條件符合";
        const state = !eligible
          ? item.state
          : uncertain
            ? "待確認"
            : item === winner
              ? source === element
                ? "宣告優先順位最高"
                : "祖先宣告優先順位最高"
              : "被較高順位宣告覆蓋";
        card.dataset.cascadeState = !eligible
          ? "inactive"
          : uncertain
            ? "unknown"
            : item === winner
              ? "winner"
              : "overridden";
        card.append(
          make("p", state, "cascade-state"),
          make("code", item.selector),
          make(
            "pre",
            property +
              ": " +
              item.value +
              (item.important ? " !important" : "") +
              ";",
          ),
        );
        if (item.spec)
          card.append(
            make(
              "p",
              (item.important ? "!important · " : "") +
                "優先權（行內 / ID / class / 標籤）：" +
                item.spec.join(" / "),
            ),
          );
        if (item.file)
          card.append(
            button("查看第 " + item.line + " 行", () =>
              ctx.openSource(item.file, item.line),
            ),
          );
        details.append(card);
      }
      details.append(
        make(
          "p",
          "比較順序：!important → 選擇器優先權 → 後出現者。這是已取得宣告的排序；動畫、transition、邏輯屬性與原頁執行時樣式可能另外影響運算值。",
          "muted",
        ),
      );
      if (
        winner?.value.includes("%") &&
        ["height", "min-height"].includes(property)
      )
        details.append(
          make(
            "p",
            "百分比高度需要依包含區塊計算。父層沒有可解析的高度時，100% 可能無法得到預期高度；可先選取父元素，追查它的 height。",
            "info-box",
          ),
        );
    }
    select.onchange = draw;
    draw();

    const editor = section("進階 CSS 宣告與還原全部", "css-editor", false);
    const note = make(
      "p",
      "輸入 CSS 宣告後套用，直接觀察預覽與尺寸變化。原始 HTML、來源檔與分析 JSON 保留原內容。",
      "muted",
    );
    const textarea = make("textarea");
    textarea.id = "css-draft";
    textarea.spellcheck = false;
    textarea.setAttribute("aria-label", "練習 CSS 宣告");
    textarea.placeholder = "height: 100vh;\ndisplay: flex;\npadding: 24px;";
    textarea.value = drafts.get(node.id) ?? edits.get(node.id)?.draft ?? "";
    textarea.oninput = () => drafts.set(node.id, textarea.value);
    const feedback = make("p", "", "muted");
    feedback.id = "css-edit-status";
    feedback.setAttribute("role", "status");
    const actions = make("div", undefined, "node-buttons");
    const apply = button(
      "套用到預覽",
      () => {
        const draft = textarea.value.trim();
        const style = document.createElement("div").style;
        style.cssText = draft;
        if (draft && !style.length) {
          feedback.textContent =
            "沒有可套用的有效 CSS。請使用「屬性: 值;」，不要包含選擇器或大括號。";
          return;
        }
        if (/[{}]/.test(draft) || /url\s*\(|@import/i.test(draft)) {
          feedback.textContent =
            "此練習區只接受一般 CSS 宣告，不接受規則區塊或外部資源。";
          return;
        }
        const old = edits.get(node.id) || {
          original: element.getAttribute("style"),
          element,
        };
        element.removeAttribute("style");
        if (old.original !== null) element.setAttribute("style", old.original);
        for (let i = 0; i < style.length; i++) {
          const key = style[i];
          element.style.setProperty(
            key,
            style.getPropertyValue(key),
            style.getPropertyPriority(key),
          );
        }
        edits.set(node.id, { ...old, draft });
        refresh();
      },
      "css-apply",
    );
    apply.className = "primary";
    const restore = (entry) => {
      if (entry.original === null) entry.element.removeAttribute("style");
      else entry.element.setAttribute("style", entry.original);
    };
    const reset = button(
      "還原此元素",
      () => {
        const e = edits.get(node.id);
        if (e) restore(e);
        edits.delete(node.id);
        drafts.delete(node.id);
        refresh();
      },
      "css-reset",
    );
    reset.disabled = !edits.has(node.id);
    const all = button(
      "還原全部",
      () => {
        for (const e of edits.values()) restore(e);
        edits.clear();
        drafts.clear();
        refresh();
      },
      "css-reset-all",
    );
    all.disabled = !edits.size;
    actions.append(apply, reset, all);
    editor.append(note, textarea, actions, feedback);
    if (edits.has(node.id))
      editor.append(
        make(
          "p",
          "已套用練習樣式。有效宣告：" +
            element.style.cssText +
            "（無效宣告會被瀏覽器忽略）",
          "info-box",
        ),
      );
    if (edits.size)
      editor.append(
        make(
          "p",
          "目前有 " + edits.size + " 個元素經過修改；重新分析會清除練習修改。",
          "muted",
        ),
      );
    box.append(editor);
    window.TeachingGuide?.renderCSS(box, ctx, {
      apply(key, value) {
        const draft = document.createElement("div").style;
        draft.cssText = textarea.value;
        draft.setProperty(key, value);
        textarea.value = draft.cssText;
        textarea.oninput();
        apply.click();
      },
      reset() {
        reset.click();
      },
    });
  }
  return {
    render,
    reset: () => {
      edits.clear();
      drafts.clear();
      window.TeachingGuide?.reset();
    },
  };
})();
