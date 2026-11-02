# 網頁分析器

從畫面元件找到相關的原始檔、行列與跨檔案引用。保留安全預覽、HTML 結構樹、元素解析、CSS 與 JavaScript 分頁；提供 GitHub Pages 瀏覽器版與 Python 本機版。

**[開啟線上版](https://ericcc-zizgf.github.io/web-analyzer/)** · [原始碼](https://github.com/Ericcc-zizgf/web-analyzer) · [Python 本機版完整操作說明](LOCAL-README.md)

![網頁分析器畫面](<docs/assets/截圖 2026-10-23 20.22.15.png>)

## 流程畫布與元素解析

工作區保留深色點陣畫布，可拖曳節點、平移、縮放或切換列表。卡片右下角可調整寬高，↺ 還原；移動時阻擋重疊，內容增高會排開下方卡片。預覽可切換桌面、平板、手機，展開整頁或縮放看全頁，外層縮放不改變頁面排版尺寸。

點預覽或結構樹先框選元素。原本的「元素解析」保留 HTML 屬性、直接文字、CSS、JavaScript 與練習操作；按「尋找元件相關程式碼」才進入獨立的位置查找工作區，仍可展開元素解析。更多操作見 [工作區說明](WORKSPACE-DESIGN.md)。

## 元件原始碼定位

選資料夾後會建立可讀原始檔的位置索引。點預覽元件，再按「尋找元件相關程式碼」，集中查看 HTML、CSS、JavaScript／TypeScript 的檔案與原始行列，JavaScript 以完整函式為單位呈現，流程圖從取得元件變數連到事件、處理函式與跨檔案呼叫；函式內的參數、字串、內建呼叫與寫入語句不另拆卡片。每筆結果保留找到它的依據；已確認與可能相關分開，略過、失敗及超限另列。

流程圖預設只展開直接處理函式，按「展開下游」逐層追查，也能展開全部。點連線可查看事件綁定、呼叫語句與匯入路徑的原始位置，並從依據跳到對應語句；點流程圖中的函式會定位原檔並高亮整個函式；點結果直接閱讀原始檔上下文與高亮範圍，可繼續追查符號、查看／下載完整原始檔、複製位置或匯出結果。上方「查找」也能搜尋全專案文字、函式名稱或檔名。文字命中包含註解／範例，不能當成已確認關聯。原本的元素解析面板與分頁保留；主流程聚焦位置與引用，不再自動展開程式功能教學。

HTML 與內嵌 JS／CSS 使用外層原檔位置，重複 CSS 規則不再共用第一次文字命中的行號。HTML 結構切換會同步高亮原始檔；看過片段後按「原檔」可回到完整 HTML。

動態 DOM、框架、執行時呼叫、CommonJS、別名與外部套件不能保證完整連結；不確定或未解析的部分會明示，不能宣稱靜態掃描能找齊所有執行時關聯。細節、限制與測試見 [位置查找說明](LOCATOR.md)。

## 自動分析整個專案資料夾

按頂端「開啟專案」或來源節點的「選擇專案資料夾」選取資料夾，選取後立即在瀏覽器分析，不需要逐一附加 CSS／JS，也不需要 API 金鑰。

- 可展開的資料夾樹，支援搜尋檔名與職責。
- 每個檔案顯示職責、判斷依據、行號、函式與匯出項目。
- 引用與反向引用可點選跳轉，區分已找到、缺少、套件、外部網址、已略過與待確認的別名。
- 辨識 package.json 的開發指令與部分框架套件；可下載不含完整原始碼的 JSON 報告與 Markdown 說明。
- 選一次資料夾後自動掃描所有 HTML／HTM，依主要內容、導覽、表單和頁面連結推測入口，直接開啟工作台；不用指定 index.html 或再次上傳。所有頁面另有結構、CSS、JS 依賴分析表。
- 自動依完整路徑對應 CSS／JS，展開可確認的本機 JS 模組與一般 CSS @import。檔案結構與職責收在可展開區域。
- 本機 Flask 版與 docs 瀏覽器版都支援；既有單頁分析操作仍可使用。

這是靜態分析：JS／TS／JSX 使用 Babel 語法樹，HTML／CSS／Python 使用文字線索。檔案職責是附有依據的推測，不是 AI 對業務邏輯的完整解讀。Vue／Svelte 目前只辨識元件類型。根路徑與別名不會直接當成缺檔。

資料夾不會上傳；略過 node_modules、.git、.venv、vendor、dist、build、.env 與常見憑證檔。最多分析 1,500 個檔案、每檔 768 KB、文字合計 16 MB；超過 20,000 個選取檔案會拒絕。略過清單可查看原因。圖片等二進位資源只記錄檔名與大小。檔名排除無法辨識所有敏感內容，分享匯出報告前仍應檢查。

瀏覽器需要你先選擇資料夾；分析完即沿用這份快照分析網頁，不會再要求上傳 HTML 或 CSS／JS。不給 index.html 固定優先權；依所有可讀取 HTML 的內容與引用關係推測入口，並自動分析各頁的 HTML 結構、CSS 與本機依賴。表格列出每頁結果、缺失與錯誤，也可以直接切換頁面。JavaScript 的元素關聯、函式與事件工作台會在開啟該頁時解析。單頁依賴最多 60 份、單檔 768 KB、HTML 與依賴合計 8 MB，HTML 最多 2 MB；超限與缺失會標示原因。來源程式不執行，React／Vue 等動態畫面不會完整還原；沒有 HTML 的專案會明示原因。修改後重新選擇同一資料夾即可更新。請透過原本的啟動方式或 HTTP 靜態伺服器開啟，直接雙擊 HTML 可能無法啟動 Worker。完整操作見 [專案分析說明](PROJECT-ANALYSIS.md)。

## 兩種版本

| 功能 | GitHub Pages 瀏覽器版 | Python 本機版 |
| --- | --- | --- |
| 貼上 HTML／上傳 HTML | 支援，在瀏覽器處理 | 支援，由 Flask 接收 |
| 附加 HTML 引用的 CSS／JS | 支援，按檔名對應 | 支援 |
| HTML 樹、元素片段、安全預覽 | 瀏覽器解析 | BeautifulSoup + html5lib |
| CSS 規則與盒模型／CSS 練習 | CSSOM + 預覽運算樣式 | tinycss2 + 預覽運算樣式 |
| JS 函式、事件、DOM、fetch 線索 | Babel 語法樹，Web Worker | 同樣在瀏覽器的 Web Worker |
| 輸入網址、取得同來源資源 | 停用，沒有跨站抓取後端 | 支援，受來源網站存取限制 |
| 來源程式執行 | 不執行 | 不執行 |
| 分析結果匯出 JSON | 支援 | 支援 |

Pages 版不需要 Python、帳號或 API 金鑰。使用者貼上／選擇的來源檔案只在自己的瀏覽器處理，不會上傳到 GitHub。網站本身載入時仍需下載本站的程式檔案。

瀏覽器版與本機版不是完全相同的解析器：DOM 本身不提供原始行號；新的位置查找使用原始標記與語法樹保留行列。舊 CSS 面板的 CSSOM 行號僅供參考，精確位置請使用元件關聯清單；瀏覽器 CSSOM 可能直接略過無效語法，未必提供 Python 版相同的錯誤訊息。複雜規則、動態腳本、框架事件與執行時樣式都需要另外閱讀。

## 線上版如何使用

1. 開啟線上版，按「載入示範」查看可操作的分析結果。
2. 整份專案使用「開啟專案」選擇資料夾；單頁則按「分析單頁原始碼」，選「貼上 HTML」或「上傳檔案」。可以分析視覺化網頁器匯出的 HTML。
3. 若 HTML 引用獨立 CSS／JS，在「附加檔案與基準網址」選入對應檔案。Pages 版只使用附加檔案，不會自動讀取網址，基準網址與遠端讀取選項停用。
4. 點「分析網頁」，選結構樹或預覽中的元素，再切換 HTML／CSS／JavaScript 對照。
5. 點選元件會先在預覽框選位置；按「尋找元件相關程式碼」查看原始位置與引用；用「動手改 CSS」練習排版，修改只影響預覽。
6. 需要保存時按頂端「匯出分析」。報告包含你輸入的原始碼，分享報告前請自行檢查內容。

HTML 最多 2 MB、4000 元素、90 層巢狀；CSS／JS 附加檔案最多 12 份，每份最多 768 KB，合計輸入最多 8 MB。過大來源會拒絕。

安全預覽移除來源腳本、事件屬性、外部資源入口與嵌入內容，並以沙箱和 CSP 限制執行及連線；不是原網站的完整互動瀏覽器。Pages 預覽不顯示圖片、SVG、影音與 iframe，可能與原頁外觀不同。這是靜態分析工具，不會呼叫 LLM。
分析只暫存在瀏覽器記憶體，重新整理會清除；沒有雲端保存。

## 下載完整程式碼

需先安裝 Git：

```sh
git clone https://github.com/Ericcc-zizgf/web-analyzer.git
cd web-analyzer
```

也可以在 GitHub 按 Code → Download ZIP，解壓縮後使用。

## 本機開啟 Pages 版

macOS／Linux：

```sh
python3 -m http.server 5241 --bind 127.0.0.1 --directory docs
```

Windows PowerShell：

```powershell
py -3 -m http.server 5241 --bind 127.0.0.1 --directory docs
```

開啟 http://127.0.0.1:5241/ 。這裡的 Python 只負責提供靜態檔案，沒有啟動 Flask 分析後端。使用線上版時完全不需安裝 Python。

## 執行完整 Python 本機版（含網址抓取）

macOS／Linux：

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python backend/app.py
```

Windows PowerShell（直接使用虛擬環境 Python，無需變更執行原則）：

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe backend/app.py
```

開啟 http://127.0.0.1:5240/ ，保持終端機執行，Ctrl+C 停止。完整本機版預設只接受 localhost／127.0.0.1；請勿直接修改本機存取限制後對外公開。新倉庫的 start.command 可獨立啟動，不依賴其他練習資料夾。
完整版本的「練習總覽」需要原工作區 launcher；獨立下載時請直接使用分析器。

## 程式結構

```text
backend/             原 Flask 後端，提供本機完整版
frontend/            原 Flask 版前端與第三方 parser
  vendor/            Prettier、parser 及授權
docs/                GitHub Pages 發布來源
  index.html         線上介面
  static-analyzer.js 瀏覽器 HTML/CSS 分析與 API 適配
  app.js             結構樹、選取、原始碼、Worker 串接
  css-lab.js         盒模型與 CSS 練習
  analysis-worker.js JS 語法樹分析
  vendor/            隨站提供的 parser 與授權
tests/               原本機版測試
```

所有 parser 隨倉庫提供，不需要外部 CDN。保留 frontend/vendor 與 docs/vendor 裡的 LICENSE、THIRD-PARTY-NOTICES.md。
原始專案未提供整體開源授權；公開瀏覽不等同另授予再散布或修改權利。

## 更新與部署

Pages 設定：main 分支、/docs。推送後由 GitHub Pages 建置，從倉庫 Actions 查看部署結果。

- 修改線上版：編輯 docs/。
- 修改 Python 本機版：編輯 backend/ 或 frontend/。
- 兩份前端不會自動同步；修改共用功能時應評估兩版。

```sh
git status
git add docs/app.js
git commit -m "更新線上分析器"
git push origin main
```

## 發布檢查

首次發布排除 .venv、__pycache__、.DS_Store、test-results、啟動紀錄，未包含其他練習的 PDF、資料庫、草稿或密鑰。
本次檢查與驗證見 [RELEASE-VERIFICATION.md](RELEASE-VERIFICATION.md)。

本次 BUG 修復與回歸驗證見 [BUGFIX-VERIFICATION.md](BUGFIX-VERIFICATION.md)。
