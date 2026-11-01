/* Explanations are local rules and MDN syntax data, never an LLM inference. */
window.TeachingGuide = (() => {
  const scriptURL = document.currentScript.src;
  const make = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const button = (text, fn) => {
    const b = make("button", text);
    b.type = "button";
    b.onclick = fn;
    return b;
  };
  const cssDescriptions = {
    display: [
      "決定這個元素如何排列，以及如何排列子元素。",
      "block 另起一塊；inline 跟文字一起排；flex 把直接子元素排成一條主軸；grid 用列和欄排列；none 不顯示也不占空間。",
      ["block", "inline", "inline-block", "flex", "grid", "none"],
    ],
    position: [
      "決定定位方式；搭配 top／right／bottom／left 或 inset。",
      "static 是一般排列；relative 相對原位置移動；absolute 脫離一般排列，相對定位包含塊；fixed 通常相對視窗；sticky 在捲動到門檻後黏住。",
      ["static", "relative", "absolute", "fixed", "sticky"],
    ],
    width: [
      "設定寬度。",
      "px 是 CSS 像素；% 依包含塊寬度；vw 依視窗寬度。padding 與 border 是否計入取決於 box-sizing。",
      [
        "auto",
        "120px",
        "50%",
        "100%",
        "50vw",
        "min-content",
        "max-content",
        "fit-content",
      ],
    ],
    height: [
      "設定高度。",
      "百分比高度通常需要可解析的包含塊高度；auto 依內容；vh 依視窗。固定高度不保證內容一定裝得下。",
      ["auto", "120px", "50%", "100vh", "100dvh"],
    ],
    "min-height": [
      "限制最小高度，內容多時仍能繼續長高。",
      "常用於至少填滿一個視窗，而不是固定死高度。",
      ["0", "200px", "100vh", "100dvh"],
    ],
    "max-height": [
      "限制最大高度。",
      "內容過多時是否裁切或捲動，由 overflow 決定。",
      ["none", "300px", "80vh"],
    ],
    "min-width": [
      "限制最小寬度。",
      "在 flex／grid 中，min-width:0 常能讓項目縮小到內容寬度以下。",
      ["0", "120px", "50%"],
    ],
    "max-width": [
      "限制最大寬度。",
      "常用 width:100% 搭配 max-width，讓區塊隨容器縮小但不無限變寬。",
      ["none", "600px", "100%"],
    ],
    color: [
      "設定文字前景顏色，通常會被子元素繼承。",
      "不會直接設定背景顏色。",
      ["#e53935", "rgb(40 80 60)", "blue", "currentColor"],
    ],
    "background-color": [
      "設定元素背景顏色。",
      "transparent 透明，可透出後方內容。",
      ["transparent", "#f1f6ef", "#234e38", "rgba(0,0,0,0.2)"],
    ],
    background: [
      "背景的簡寫，可同時設定色彩、漸層、位置與尺寸等。",
      "只寫 background 可能把先前的其他背景子屬性一起重設。",
      ["#f1f6ef", "linear-gradient(90deg, #e4efdb, #aac8bc)", "none"],
    ],
    "font-size": [
      "設定文字大小。",
      "px 是 CSS 像素；rem 依根元素字體；em 依字體上下文。",
      ["12px", "18px", "24px", "1rem", "1.5em"],
    ],
    "font-weight": [
      "設定字重。",
      "可見效果也取決於字型是否提供該字重。",
      ["normal", "bold", "400", "600", "700"],
    ],
    "font-family": [
      "設定字型及依序備用的字型。",
      "找不到第一個字型時使用下一個。",
      ["system-ui, sans-serif", "serif", "monospace"],
    ],
    "line-height": [
      "設定每行文字的行高。",
      "無單位數字是字體大小的倍數，常用 1.5 至 1.8。",
      ["normal", "1", "1.5", "1.8", "24px"],
    ],
    padding: [
      "內容到邊框之間的內距。",
      "1 值四邊；2 值上下／左右；3 值上／左右／下；4 值上／右／下／左。不能用負值。",
      ["0", "8px", "16px 24px", "10px 20px 30px 40px"],
    ],
    margin: [
      "元素邊框外的間距。",
      "1 至 4 值依上右下左規則分配。部分情況可用 auto 分配空間；一般區塊的垂直 margin 可能合併。",
      ["0", "16px", "0 auto", "10px 20px"],
    ],
    gap: [
      "設定 flex／grid 等排列中項目之間的間隔。",
      "不是元素四周的外距；對一般 block 排列不一定有效。",
      ["0", "8px", "24px", "12px 24px"],
    ],
    "flex-direction": [
      "指定 flex 容器的主軸方向。",
      "只有在 flex 容器上才會改變子項目排列。",
      ["row", "row-reverse", "column", "column-reverse"],
    ],
    "flex-wrap": [
      "決定 flex 項目放不下時要不要換行。",
      "nowrap 可能讓項目縮小或溢出。",
      ["nowrap", "wrap", "wrap-reverse"],
    ],
    "justify-content": [
      "分配 flex 主軸或 grid 行內軸上的剩餘空間。",
      "方向依排列方式決定；有剩餘空間時效果較明顯。",
      ["start", "end", "center", "space-between", "space-around", "space-evenly"],
    ],
    "align-items": [
      "設定 flex／grid 子項目在交錯軸／區塊軸的對齊。",
      "flex-direction 改變時，對應的視覺方向也會改變。",
      ["stretch", "start", "end", "center", "baseline"],
    ],
    "grid-template-columns": [
      "設定 grid 的欄數與各欄寬度。",
      "fr 分配可用空間；repeat 可重複欄；需要 display:grid。",
      [
        "1fr",
        "1fr 1fr",
        "200px 1fr",
        "repeat(3, 1fr)",
        "repeat(auto-fit, minmax(180px, 1fr))",
      ],
    ],
    "grid-template-rows": [
      "設定 grid 的列數與各列高度。",
      "auto 可依內容決定；fr 分配可用空間。",
      ["auto", "auto 1fr", "repeat(3, 100px)"],
    ],
    flex: [
      "同時設定 flex-grow、flex-shrink、flex-basis。",
      "需要這個元素本身是 flex 項目，即父層為 flex。",
      ["0 1 auto", "1", "1 1 0%", "none"],
    ],
    "box-sizing": [
      "決定 width／height 包含哪些範圍。",
      "content-box 不含 padding 和 border；border-box 將它們算進設定尺寸。margin 都在外面。",
      ["content-box", "border-box"],
    ],
    overflow: [
      "決定內容超出盒子時怎麼顯示。",
      "visible 露出；hidden 裁切但仍可能程式捲動；clip 裁切；auto 需要時出現捲軸；scroll 建立可捲動區。",
      ["visible", "hidden", "clip", "auto", "scroll"],
    ],
    "border-radius": [
      "設定圓角。",
      "px 固定半徑；% 依盒子尺寸。50% 可將正方形變圓。",
      ["0", "8px", "24px", "50%"],
    ],
    border: [
      "同時設定邊框粗細、樣式、顏色。",
      "只改 border-color 而沒有可見的 border-style 時，可能仍看不到邊框。",
      ["none", "1px solid #888", "3px dashed #e53935"],
    ],
    opacity: [
      "設定整個元素與子元素的透明度。",
      "0 完全透明但仍占空間，1 不透明；不等於 display:none。",
      ["0", "0.25", "0.5", "1"],
    ],
    visibility: [
      "控制元素是否可見。",
      "hidden 一般仍保留排列空間。",
      ["visible", "hidden", "collapse"],
    ],
    cursor: [
      "設定滑鼠指標外觀。",
      "只改外觀，不會自動加入點擊功能。",
      ["auto", "default", "pointer", "text", "not-allowed", "grab"],
    ],
    "text-align": [
      "設定行內文字在容器中的對齊。",
      "不會把這個容器本身置中。",
      ["start", "end", "left", "right", "center", "justify"],
    ],
    "text-decoration": [
      "設定文字底線、刪除線等裝飾。",
      "可同時設定線型與顏色。",
      ["none", "underline", "line-through", "underline wavy red"],
    ],
    "white-space": [
      "控制空白與換行的處理。",
      "nowrap 不自動換行；pre-wrap 保留換行與空白，並允許自動折行。",
      ["normal", "nowrap", "pre", "pre-wrap", "pre-line", "break-spaces"],
    ],
    "box-shadow": [
      "設定盒子的陰影。",
      "常見順序為水平位移、垂直位移、模糊、擴散、顏色；inset 改成內陰影。",
      ["none", "0 4px 12px rgba(0,0,0,0.2)", "inset 0 0 0 2px #40805c"],
    ],
    transform: [
      "對顯示結果做位移、旋轉、縮放等。",
      "通常不重新分配一般排列中的原位置；可能建立新的包含塊。",
      ["none", "translateX(20px)", "rotate(10deg)", "scale(1.2)"],
    ],
    transition: [
      "設定屬性改變時的過渡效果。",
      "需要屬性真的發生變化，而且該值可動畫，才會看見。",
      ["none", "color 0.3s ease", "transform 0.2s ease", "all 0.3s ease"],
    ],
    "z-index": [
      "控制堆疊順序。",
      "受到堆疊上下文影響，數字大不保證能蓋過所有元素。",
      ["auto", "0", "1", "10"],
    ],
    "object-fit": [
      "決定圖片／影片等替換元素如何放進指定盒子。",
      "需要先有可供對比的寬高。",
      ["fill", "contain", "cover", "none", "scale-down"],
    ],
    "aspect-ratio": [
      "設定偏好的寬高比例。",
      "例如 16 / 9；實際尺寸也受 width／height 和最小最大尺寸影響。",
      ["auto", "1", "16 / 9", "4 / 3"],
    ],
    inset: [
      "同時設定 top、right、bottom、left 的定位距離。",
      "需要非 static 的適用定位方式；1 至 4 值同內距順序。",
      ["auto", "0", "20px", "10%"],
    ],
    "overflow-wrap": [
      "設定長文字或網址必要時如何斷行。",
      "anywhere 能讓難以斷行的文字拆開。",
      ["normal", "anywhere", "break-word"],
    ],
    "word-break": [
      "控制單字的斷行規則。",
      "break-all 可能在單字中間斷開，閱讀性要留意。",
      ["normal", "break-all", "keep-all"],
    ],
  };
  Object.assign(cssDescriptions, {
    "background-image": [
      "設定背景圖層或漸層。",
      "可有多層背景；練習區不載入外部圖片，只示範漸層或 none。",
      ["none", "linear-gradient(90deg, #e7f4df, #548c73)"],
    ],
    "background-size": [
      "設定背景圖層的大小。",
      "cover 填滿且可能裁切；contain 完整放入且可能留白；需有背景圖層才看得到。",
      ["auto", "cover", "contain", "100% 100%"],
    ],
    "background-repeat": [
      "控制背景是否重複鋪排。",
      "沒有背景圖層時，看不見差別。",
      ["repeat", "no-repeat", "repeat-x", "repeat-y", "space", "round"],
    ],
    "background-position": [
      "設定背景圖層的位置。",
      "第一值水平、第二值垂直；百分比依背景定位區與圖片尺寸計算。",
      ["center", "left top", "right bottom", "50% 50%"],
    ],
    "background-position-x": [
      "設定背景圖層的水平位置。",
      "需有背景圖層才能看到變化。",
      ["left", "center", "right", "20px", "50%"],
    ],
    "background-position-y": [
      "設定背景圖層的垂直位置。",
      "需有背景圖層才能看到變化。",
      ["top", "center", "bottom", "20px", "50%"],
    ],
    "background-attachment": [
      "決定背景隨元素或視窗如何捲動。",
      "scroll 隨元素，local 隨元素內容，fixed 相對視窗；實際支援因裝置而異。",
      ["scroll", "local", "fixed"],
    ],
    "background-origin": [
      "設定背景位置的計算範圍。",
      "padding-box 包含內距；border-box 含邊框；content-box 只有內容區。",
      ["padding-box", "border-box", "content-box"],
    ],
    "background-clip": [
      "限制背景繪製在哪個範圍。",
      "border-box 畫到邊框下方；padding-box 到內距；content-box 只在內容區。",
      ["border-box", "padding-box", "content-box", "text"],
    ],
    "border-image-source": [
      "設定作為邊框的圖片或漸層。",
      "搭配切片、寬度和重複規則使用；不是文字顏色。",
      ["none", "linear-gradient(45deg, #e53935, #40805c)"],
    ],
    "border-image-slice": [
      "設定邊框圖片如何切成角、邊與中心。",
      "數字或百分比決定切片位置；fill 可保留中心部分。",
      ["100%", "30", "30 fill"],
    ],
    "border-image-width": [
      "設定邊框圖片的顯示寬度。",
      "無單位數字表示邊框寬度的倍數，也可用長度或百分比。",
      ["1", "2", "10px", "auto"],
    ],
    "border-image-outset": [
      "設定邊框圖片向邊框外延伸多少。",
      "無單位數字依邊框寬度計算；不直接改變一般排列的空間。",
      ["0", "1", "10px"],
    ],
    "border-image-repeat": [
      "設定邊框圖片沿邊的鋪排方式。",
      "stretch 拉伸；repeat 重複；round 調整重複項目尺寸。",
      ["stretch", "repeat", "round", "space"],
    ],
    "letter-spacing": [
      "設定字元之間的額外間距。",
      "負值會拉近；不等於字體大小。",
      ["normal", "1px", "0.1em", "-0.5px"],
    ],
    "font-style": [
      "設定一般或斜體字樣。",
      "字型提供的樣式會影響實際外觀。",
      ["normal", "italic", "oblique"],
    ],
    font: [
      "字體屬性的簡寫。",
      "同時設定字體大小、行高、字型等；省略的子屬性可能被重設。",
      ["16px system-ui", "bold 20px/1.5 sans-serif"],
    ],
    animation: [
      "設定 CSS 動畫的名稱、時間、重複方式等。",
      "需要有對應的 @keyframes；只填名稱但沒有關鍵影格，不會自動產生動畫。",
      ["none", "example 1s ease infinite"],
    ],
    "animation-duration": [
      "設定一次動畫循環的時間。",
      "s 是秒，ms 是毫秒；需要有動畫名稱和關鍵影格。",
      ["0s", "0.3s", "2s"],
    ],
    "transition-duration": [
      "設定屬性過渡花多少時間。",
      "需要屬性真的改變，且該屬性可做動畫。",
      ["0s", "0.2s", "1s"],
    ],
    "flex-grow": [
      "設定 flex 項目分配剩餘空間的比例。",
      "0 不主動長大；數字是相對比例，需要父層為 flex。",
      ["0", "1", "2"],
    ],
    "flex-shrink": [
      "設定 flex 項目在空間不足時的縮小比例。",
      "0 不主動縮小；實際還受基準尺寸及最小尺寸影響。",
      ["0", "1", "2"],
    ],
    "flex-basis": [
      "設定 flex 項目在分配空間前的基準尺寸。",
      "主軸方向決定此尺寸對應寬或高。",
      ["auto", "0%", "200px", "50%"],
    ],
    "align-self": [
      "覆蓋單一 flex／grid 項目的交錯軸對齊方式。",
      "只改這個項目，其他項目仍依父層 align-items。",
      ["auto", "stretch", "start", "center", "end"],
    ],
    order: [
      "設定 flex／grid 項目的視覺排序。",
      "不改變 HTML 的讀取與鍵盤導覽順序。",
      ["0", "1", "-1"],
    ],
    "row-gap": [
      "設定列與列之間的間距。",
      "適用於 grid／flex 等排列，視排列方向而定。",
      ["0", "8px", "24px"],
    ],
    "column-gap": [
      "設定欄與欄之間的間距。",
      "適用於 grid／flex／多欄等排列。",
      ["normal", "8px", "24px"],
    ],
    "overflow-x": [
      "設定水平方向溢出如何顯示。",
      "auto 可在需要時捲動，hidden 裁切。",
      ["visible", "hidden", "clip", "auto", "scroll"],
    ],
    "overflow-y": [
      "設定垂直方向溢出如何顯示。",
      "通常需要有受限制的高度，才會產生垂直捲動。",
      ["visible", "hidden", "clip", "auto", "scroll"],
    ],
    "pointer-events": [
      "設定元素是否能成為指標事件的目標。",
      "none 會讓指標事件略過它，但不等於從畫面或鍵盤導覽移除。",
      ["auto", "none"],
    ],
    outline: [
      "設定不占排列空間的輪廓線。",
      "常用來表示鍵盤焦點，移除時應提供其他可見焦點。",
      ["none", "2px solid #40805c"],
    ],
    "text-overflow": [
      "設定文字溢出時的提示。",
      "ellipsis 通常還需搭配 overflow:hidden 及不換行等條件。",
      ["clip", "ellipsis"],
    ],
    "text-transform": [
      "設定文字顯示大小寫。",
      "不改原始文字資料；對沒有大小寫的語言可能看不出差別。",
      ["none", "uppercase", "lowercase", "capitalize"],
    ],
  });
  function description(prop) {
    if (cssDescriptions[prop]) return cssDescriptions[prop];
    if (/^padding-/.test(prop))
      return [
        "設定這一側的內距。",
        "不能是負值；px 是 CSS 像素，% 的參照通常為包含塊行內尺寸。",
        ["0", "8px", "24px", "5%"],
      ];
    if (/^margin-/.test(prop))
      return [
        "設定這一側的外距。",
        "可用負值；auto 的效果依排列方式而定。",
        ["0", "8px", "24px", "auto"],
      ];
    if (/^(top|right|bottom|left)$/.test(prop))
      return [
        "設定這一側的定位距離。",
        "需配合非 static 的 position；參照位置取決於定位包含塊。",
        ["auto", "0", "20px", "10%"],
      ];
    if (
      /^border-(top|right|bottom|left|inline-start|inline-end|block-start|block-end)-color$/.test(
        prop,
      ) ||
      prop === "border-color"
    )
      return [
        "設定邊框顏色。",
        "不設定文字顏色；currentColor 會跟隨元素的文字前景色。需有可見邊框寬度與樣式。",
        ["currentColor", "#e53935", "#40805c"],
      ];
    if (/^border-.*radius$/.test(prop)) return cssDescriptions["border-radius"];
    if (/^border-.*style$/.test(prop) || prop === "border-style")
      return [
        "設定邊框線的樣式。",
        "none 不畫邊框；solid 實線；dashed 虛線。",
        ["none", "solid", "dashed", "dotted", "double"],
      ];
    if (
      /^border-(top|right|bottom|left|inline-start|inline-end|block-start|block-end)-width$/.test(
        prop,
      )
    )
      return [
        "設定該邊框的寬度。",
        "邊框樣式為 none 時仍看不見。",
        ["0", "1px", "4px", "thin", "medium", "thick"],
      ];
    if (prop.startsWith("--"))
      return [
        "這是專案自訂的 CSS 變數。",
        "可存放自訂文字值；實際效果取決於哪些屬性以 var(" +
          prop +
          ") 使用它。沒有一份通用的可用值清單。",
        ["8px", "#40805c"],
      ];
    return [
      "此屬性尚未有內建白話解說。",
      "下方提供 MDN 值語法、可用關鍵字及原始文件；瀏覽器支援不代表目前元素一定有可見效果。",
      [],
    ];
  }
  let cssData;
  function loadCSS() {
    if (!cssData)
      cssData = Promise.all(
        ["properties", "syntaxes"].map((n) =>
          fetch(new URL("vendor/mdn-css/" + n + ".json", scriptURL)).then((r) => {
            if (!r.ok) throw Error("CSS 參考資料讀取失敗");
            return r.json();
          }),
        ),
      )
        .then(([properties, syntaxes]) => ({ properties, syntaxes }))
        .catch((e) => {
          cssData = null;
          throw e;
        });
    return cssData;
  }
  function grammarValues(syntax, properties, syntaxes, depth = 0, seen = new Set()) {
    if (depth > 4 || seen.has(syntax)) return [];
    seen.add(syntax);
    let text = syntax
      .replace(/<'([^']+)'>/g, (_, p) => (depth < 4 ? properties[p]?.syntax || "" : ""))
      .replace(/<([^>]+)>/g, (_, p) => (depth < 4 ? syntaxes[p]?.syntax || "" : ""));
    const values = text.match(/(?<![\w-])[a-z][a-z0-9-]*(?![\w-])/g) || [];
    return [...new Set(values.filter((v) => !["px", "deg", "s"].includes(v)))].slice(
      0,
      120,
    );
  }
  const cssStates = new Map();
  async function renderCSS(box, ctx, edit) {
    const host = make("section", undefined, "learning-panel css-learning");
    host.id = "css-learning";
    host.append(
      make("h3", "CSS 逐條說明與試改"),
      make(
        "p",
        "先看目前有哪些設定，再選一個屬性試改。套用只影響預覽，可還原；px／% 等數值有無限種組合，完整值語法與常見例子分開顯示。",
      ),
    );
    box.prepend(host);
    try {
      const data = await loadCSS();
      if (!host.isConnected) return;
      const key = ctx.report.id + ":" + ctx.node.id;
      let state = cssStates.get(key);
      if (!state) {
        state = { property: "", value: "", feedback: "" };
        cssStates.set(key, state);
        if (cssStates.size > 20) cssStates.delete(cssStates.keys().next().value);
      }
      const declarations = [];
      for (const rule of ctx.report.css_rules) {
        try {
          if (!ctx.element.matches(rule.selector)) continue;
        } catch {
          continue;
        }
        for (const d of rule.declarations)
          declarations.push({
            ...d,
            selector: rule.selector,
            condition: ctx.conditionState(rule, ctx.win),
          });
      }
      for (const prop of ctx.element.style)
        declarations.push({
          property: prop,
          value: ctx.element.style.getPropertyValue(prop),
          selector: "元素的 style",
          condition: "行內樣式",
        });
      const list = make("details");
      list.open = declarations.length <= 8;
      list.append(make("summary", "目前元素匹配的宣告 · " + declarations.length + " 條"));
      list.append(
        make(
          "p",
          "包含被覆蓋及條件不符合的規則；是否生效以右側運算值為準。繼承與偽元素可在既有 CSS 面板查詢。",
        ),
      );
      for (const d of declarations.slice(0, 150)) {
        const row = make("div", undefined, "learning-css-row"),
          info = description(d.property);
        row.append(
          make("code", d.property + ": " + d.value + (d.important ? " !important" : "")),
          make("p", info[0]),
          make(
            "small",
            d.selector +
              " · " +
              d.condition +
              " · 運算值：" +
              ctx.win.getComputedStyle(ctx.element).getPropertyValue(d.property),
          ),
          button("解釋／試改", () => {
            state.property = d.property;
            state.value = d.value;
            draw();
            form.scrollIntoView({ block: "nearest" });
          }),
        );
        list.append(row);
      }
      if (!declarations.length)
        list.append(
          make(
            "p",
            "沒有直接匹配的來源宣告；外觀仍可能來自繼承或瀏覽器預設。可從下方加入新屬性試試。",
          ),
        );
      if (declarations.length > 150)
        list.append(make("p", "此處僅列前 150 條，其他規則請查看完整規則清單。"));
      host.append(list);
      const form = make("div", undefined, "learning-css-form");
      host.append(form);
      const properties = [
        ...new Set([
          ...Object.keys(data.properties),
          ...Array.from(ctx.win.getComputedStyle(ctx.element)),
          ...declarations.map((d) => d.property),
        ]),
      ]
        .filter((p) => p !== "--*")
        .sort();
      host.append(
        make(
          "p",
          "可查詢 " +
            properties.length +
            " 個 MDN／瀏覽器收錄的屬性名稱。常見屬性有內建白話說明，其他屬性提供值語法與 MDN 文件。",
        ),
      );
      if (!state.property)
        state.property = declarations[0]?.property || "background-color";
      function draw() {
        form.replaceChildren();
        const propLabel = make("label", "想了解或新增哪個 CSS 屬性？"),
          input = make("input");
        input.value = state.property;
        input.setAttribute("list", "css-learning-properties");
        input.setAttribute("aria-label", "查詢 CSS 屬性");
        input.id = "css-learning-property";
        const dl = make("datalist");
        dl.id = "css-learning-properties";
        for (const p of properties) {
          const o = make("option");
          o.value = p;
          dl.append(o);
        }
        propLabel.append(input);
        form.append(
          propLabel,
          dl,
          button("查詢設定說明", () => {
            state.property = input.value.trim();
            if (!state.property.startsWith("--"))
              state.property = state.property.toLowerCase();
            state.value = "";
            draw();
          }),
        );
        const p = state.property,
          reference = data.properties[p],
          info = description(p);
        form.append(make("h4", p), make("p", info[0]), make("p", info[1]));
        const current = ctx.win.getComputedStyle(ctx.element).getPropertyValue(p);
        form.append(make("p", "目前運算值：" + (current || "未取得／不支援")));
        if (reference) {
          const syntax = make("details");
          syntax.append(
            make("summary", "完整值語法（MDN）"),
            make("code", reference.syntax),
            make(
              "p",
              "| 任選一種；|| 可任意順序組合；&& 都需要；? 可省略；+ 一個以上；# 用逗號分隔；{a,b} 重複次數。<length> 是長度、<percentage> 是百分比、<color> 是色彩。inherit 繼承、initial 用初始值、unset 依繼承規則重設、revert／revert-layer 回退來源或圖層。",
            ),
          );
          const keywords = grammarValues(
            reference.syntax,
            data.properties,
            data.syntaxes,
          ).filter((v) => ctx.win.CSS.supports(p, v));
          syntax.append(
            make(
              "p",
              "目前瀏覽器接受的獨立關鍵字：" +
                (keywords.join("、") ||
                  "此語法需長度、函式或多個值的組合，不能只填單一關鍵字。"),
            ),
          );
          form.append(syntax);
          const link = make("a", "查看 MDN 完整屬性說明 ↗");
          link.href =
            "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/" +
            encodeURIComponent(p);
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          form.append(link);
        } else if (!p.startsWith("--"))
          form.append(
            make("p", "MDN 資料未收錄此名稱，請檢查拼字。瀏覽器可能只支援部分擴充屬性。"),
          );
        const valueLabel = make("label", "設定值"),
          value = make("input");
        value.id = "css-learning-value";
        value.setAttribute("aria-label", "要試改的 CSS 值");
        value.value = state.value || info[2][0] || current;
        valueLabel.append(value);
        form.append(valueLabel);
        const examples = make("div", undefined, "learning-examples");
        for (const v of info[2])
          examples.append(
            button(v, () => {
              value.value = v;
              state.value = v;
            }),
          );
        form.append(make("p", "常見例子（可直接點選，也可自行輸入）："), examples);
        form.append(
          make(
            "p",
            "可能影響：" +
              info[0] +
              " 實際結果取決於父層排列、其他規則與內容；套用後會讀取實際變化。",
          ),
        );
        form.append(
          button("套用並比較變化", () => {
            const v = value.value.trim();
            state.value = v;
            if (!p || /[{};]/.test(p + v) || /url\s*\(|@import|image-set\s*\(/i.test(v)) {
              feedback.textContent = "此處只接受單一屬性值，不接受外部資源或規則區塊。";
              return;
            }
            if (!ctx.win.CSS.supports(p, v)) {
              feedback.textContent =
                "此瀏覽器不接受這個屬性與值，尚未套用。請參考語法或常見例子。";
              return;
            }
            const before = snapshot(p),
              beforeHTML = capture();
            edit.apply(p, v);
            const after = snapshot(p),
              afterHTML = capture();
            state.comparison =
              beforeHTML && afterHTML
                ? {
                    before: beforeHTML,
                    after: afterHTML,
                    width: ctx.element.ownerDocument.defaultView.innerWidth,
                    height: ctx.element.ownerDocument.defaultView.innerHeight,
                  }
                : null;
            state.feedback =
              "已套用 " +
              p +
              ": " +
              v +
              "。此屬性：" +
              before.value +
              " → " +
              after.value +
              "；元素尺寸：" +
              before.width +
              " × " +
              before.height +
              " → " +
              after.width +
              " × " +
              after.height +
              " CSS px。" +
              (!state.comparison ? "（大型文件僅提供運算值比較，可回畫布查看。）" : "") +
              (before.value === after.value
                ? "運算值未改變，可能原本相同或被其他宣告覆蓋；請查看既有優先順序面板。"
                : "運算值有改變；畫面效果也可能受父層或內容限制。");
            const live = document.querySelector("#css-learning-feedback");
            if (live) live.textContent = state.feedback;
          }),
          button("還原此元素的試改", () => {
            state.feedback = "已還原這個元素的練習樣式。";
            state.comparison = null;
            edit.reset();
          }),
        );
        function capture() {
          const html = ctx.element.ownerDocument.documentElement.outerHTML;
          return html.length <= 200000 ? html : null;
        }
        function snapshot(key) {
          const c = ctx.win.getComputedStyle(ctx.element);
          return { value: c.getPropertyValue(key), width: c.width, height: c.height };
        }
        const feedback = make("p", state.feedback, "learning-feedback");
        feedback.id = "css-learning-feedback";
        feedback.setAttribute("role", "status");
        form.append(feedback);
        if (state.comparison) {
          const comparison = state.comparison;
          const compare = make("div", undefined, "learning-css-comparison");
          for (const [title, html] of [
            ["套用前", comparison.before],
            ["套用後", comparison.after],
          ]) {
            const area = make("section");
            area.append(make("h4", title));
            const viewport = make("div", undefined, "learning-mini-viewport");
            const frame = make("iframe");
            frame.title = title + "的安全預覽";
            frame.setAttribute("sandbox", "allow-same-origin");
            frame.tabIndex = -1;
            frame.style.width = comparison.width + "px";
            frame.style.height = comparison.height + "px";
            frame.srcdoc = html;
            frame.onload = () => {
              const target = frame.contentDocument?.querySelector(
                '[data-web-analyzer-node="' + ctx.node.id + '"]',
              );
              if (target) {
                const win = frame.contentWindow;
                win.scrollTo(
                  0,
                  Math.max(
                    0,
                    target.getBoundingClientRect().top +
                      win.scrollY -
                      win.innerHeight / 2 +
                      target.getBoundingClientRect().height / 2,
                  ),
                );
              }
            };
            const resize = () => {
              frame.style.transform =
                "scale(" + Math.min(1, viewport.clientWidth / comparison.width) + ")";
            };
            const observer = new ResizeObserver(() => {
              if (!viewport.isConnected) {
                observer.disconnect();
                return;
              }
              resize();
            });
            observer.observe(viewport);
            viewport.append(frame);
            area.append(viewport);
            compare.append(area);
          }
          form.append(
            make(
              "p",
              "同一個安全預覽的套用前後縮圖；保持原預覽寬度，縮放顯示並對準目前元素。",
            ),
            compare,
          );
        }
        if (document.body.classList.contains("component-mode"))
          form.append(
            button("回到畫布看實際變化", () =>
              document.querySelector(".component-top .canvas-button")?.click(),
            ),
          );
      }
      draw();
    } catch (e) {
      host.append(make("p", e.message + "；仍可使用原本的 CSS 練習區。"));
    }
  }
  let jsRequest = 0;
  async function showJS(host, source, analyze) {
    const request = ++jsRequest;
    host.replaceChildren(
      make("h3", "這段 JavaScript 在做什麼？"),
      make("p", "正在依語法解析這段程式…"),
    );
    try {
      const lesson = await analyze(source);
      if (request !== jsRequest || !host.isConnected) return;
      host.replaceChildren(
        make("h3", "這段 JavaScript 在做什麼？"),
        make(
          "p",
          "依目前片段解釋，行號以此片段為準；不執行來源程式，外部變數與動態結果保留未知。",
        ),
      );
      const basics = make("details");
      basics.append(make("summary", "先認識這段程式會用到的名詞"));
      for (const [term, text] of lesson.glossary)
        basics.append(make("strong", term), make("p", text));
      host.append(basics);
      const reference = make("details");
      reference.append(
        make(
          "summary",
          "JavaScript 函式對照表 · " + Object.keys(lesson.reference || {}).length + " 項",
        ),
      );
      const search = make("input");
      search.setAttribute("aria-label", "搜尋 JavaScript 函式對照");
      search.placeholder = "例如 querySelector、Number、map";
      const entries = make("div");
      function drawReference() {
        entries.replaceChildren();
        for (const [key, info] of Object.entries(lesson.reference || {})) {
          if (
            !(key + " " + info.join(" "))
              .toLowerCase()
              .includes(search.value.toLowerCase())
          )
            continue;
          entries.append(
            make("h4", key),
            make("p", "傳入什麼：" + info[0]),
            make("p", "會發生什麼：" + info[1]),
          );
        }
      }
      search.oninput = drawReference;
      drawReference();
      reference.append(search, entries);
      host.append(reference);
      for (const step of lesson.steps) {
        const row = make("article", undefined, "learning-js-step");
        row.append(
          make("h4", "第 " + step.line + " 行 · " + step.title),
          make("code", step.code),
          make("p", step.text),
        );
        host.append(row);
      }
      if (!lesson.steps.length)
        host.append(
          make(
            "p",
            "這段內容沒有目前可解釋的宣告或呼叫，可點流程圖的函式或變數節點查看。",
          ),
        );
      if (lesson.truncated)
        host.append(make("p", "已達說明項目上限；請改選較小的函式片段。"));
      if (lesson.functions.length) {
        const simulation = make("section", undefined, "learning-simulation");
        simulation.append(make("h4", "代入參數，看看回傳結果"));
        const select = make("select");
        select.setAttribute("aria-label", "選擇要代入的函式");
        for (const fn of lesson.functions) {
          const opt = make("option", fn.name + "(" + fn.params.join(", ") + ")");
          opt.value = fn.index;
          select.append(opt);
        }
        const input = make("input");
        input.value = "[]";
        input.maxLength = 20000;
        input.setAttribute("aria-label", "函式輸入 JSON 陣列");
        input.placeholder = "例如 [2, 3]";
        const result = make("pre");
        result.setAttribute("role", "status");
        simulation.append(
          select,
          make(
            "p",
            "用 JSON 陣列依序提供輸入，例如 [2, 3] 會把 2 給第一個參數、3 給第二個。這是有限語法推演，只支援基本運算、變數與條件回傳；遇到 DOM、外部函式、迴圈或非同步會停止，不會真的操作網頁。",
          ),
          input,
          button("代入並逐步說明", async () => {
            try {
              const args = JSON.parse(input.value);
              const response = await analyze(source, {
                index: Number(select.value),
                args,
              });
              if (request !== jsRequest) return;
              result.textContent =
                response.simulation.trace.join("\n") +
                "\n結果：" +
                response.simulation.display;
            } catch (e) {
              result.textContent = "無法推演：" + e.message;
            }
          }),
          result,
        );
        host.append(simulation);
      }
    } catch (e) {
      if (request === jsRequest)
        host.replaceChildren(
          make("h3", "JavaScript 說明"),
          make("p", "無法解析目前片段：" + e.message + "。請改選完整函式或變數宣告。"),
        );
    }
  }
  return {
    showJS,
    renderCSS,
    reset() {
      cssStates.clear();
    },
    description,
  };
})();
