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
        .map((d) => d.property + ":" + d.value + (d.important ? " !important" : "") + ";")
        .join("");
      const value = scratch.getPropertyValue(key),
        reset = scratch.getPropertyValue("all");
      if (!value && !reset) return;
      const matches = [];
      for (const selector of splitSelectors(rule.selector)) {
        try {
          if (element.matches(selector.trim())) matches.push(specificity(selector.trim()));
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
  function render(box, ctx) {
    const { element, win, node, refresh } = ctx;
    if (!element) return;
    const computed = win.getComputedStyle(element);
    const model = section("盒模型與排版關係", "box-model");
    const margin = make("div", undefined, "box-layer box-margin");
    const border = make("div", undefined, "box-layer box-border");
    const padding = make("div", undefined, "box-layer box-padding");
    const values = (prefix, suffix = "") =>
      ["top", "right", "bottom", "left"]
        .map((side) => computed.getPropertyValue(prefix + "-" + side + suffix))
        .join(" / ");
    margin.append(make("div", "margin · " + values("margin"), "box-caption"));
    border.append(make("div", "border · " + values("border", "-width"), "box-caption"));
    padding.append(make("div", "padding · " + values("padding"), "box-caption"));
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
    const px = (n) => (Number.isFinite(n) ? Math.max(0, n).toFixed(1) + "px" : "auto");
    padding.append(
      make("div", "內容 " + px(contentWidth) + " × " + px(contentHeight), "box-content"),
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
      ["畫面邊界", rect.width.toFixed(1) + " × " + rect.height.toFixed(1) + " px"],
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
          identify(parent) + " · " + r.width.toFixed(1) + " × " + r.height.toFixed(1) + " px",
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

    const cascade = section("哪一條 CSS 在控制它？", "css-cascade");
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
          "瀏覽器實際運算值：" + win.getComputedStyle(element).getPropertyValue(property),
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
            property + ": " + item.value + (item.important ? " !important" : "") + ";",
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
            button("查看第 " + item.line + " 行", () => ctx.openSource(item.file, item.line)),
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
      if (winner?.value.includes("%") && ["height", "min-height"].includes(property))
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

    const editor = section("動手改 CSS · 僅影響預覽", "css-editor");
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
          feedback.textContent = "此練習區只接受一般 CSS 宣告，不接受規則區塊或外部資源。";
          return;
        }
        const old = edits.get(node.id) || { original: element.getAttribute("style"), element };
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
          "已套用練習樣式。有效宣告：" + element.style.cssText + "（無效宣告會被瀏覽器忽略）",
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
  }
  return {
    render,
    reset: () => {
      edits.clear();
      drafts.clear();
    },
  };
})();
