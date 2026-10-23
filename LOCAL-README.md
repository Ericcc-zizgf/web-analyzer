# 網頁分析器

從網址、HTML 原始碼或 HTML 檔案，探索頁面的 HTML 結構、CSS 規則與 JavaScript 實作。這是靜態原始碼分析工具，沒有呼叫 LLM，也不執行來源腳本。

## 啟動

在練習總覽選「網頁分析器」，或雙擊本資料夾的 `start.command`。優先使用 5240 埠，啟動流程會依專案位置找路徑並開啟瀏覽器。原埠號被占用時，以實際開啟的網址為準。

若在另一台電腦缺少依賴，於此資料夾開啟終端機：

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

也可直接執行 `python3 backend/app.py`。請保留啟動終端機，Control+C 停止。

## 三種輸入

- **網址**：輸入公開的 http／https 頁面，或自己的 `http://127.0.0.1:埠號/`。啟用「讀取同來源 CSS／JS」後，會讀取頁面直接連結且同 scheme／host／port 的資源。
- **貼上 HTML**：可輸入完整 HTML 或片段。內嵌 style、script 和事件屬性會直接列入分析。
- **上傳檔案**：選取 UTF-8 HTML，例如網頁組裝室匯出的網頁。若 CSS／JS 分開存檔，可在「附加檔案與基準網址」一併選入。

附加檔案按 HTML 引用路徑／檔名對應，最多 12 份，同檔名不可重複。貼上 HTML 或上傳檔案若要讀取線上資源，請明確填寫基準網址，再勾選資源讀取。HTML 自帶 base 標籤不會在未提供基準網址時自行啟動網路讀取。

可以先按「載入示範」熟悉操作。示範同樣經過真正解析器，不是預先寫死的分析結果。

## HTML：從結構找元件

左側是 HTML5 解析後的可展開結構樹。可以搜尋標籤、id、class 和文字，點選節點或安全預覽中的元素，查看屬性、直接文字、父子階層與用途說明。

「看此元素片段」會顯示 HTML5 解析後、重新縮排的該元素及後代；它的行號不同於輸入原檔。「看原始 HTML」保留輸入文字。解析器可能補上 html／head／body／tbody 等省略元素，結構樹因此不一定逐字等同原始字串。

## CSS：規則與最後呈現分開看

CSS 分頁提供：

- 與選取元素相符的選擇器、宣告、important、來源檔案及行號。
- media／supports 等條件，及目前尺寸是否符合。container／scope 等條件標示需要另外判斷。
- 行內 style，以及安全預覽中瀏覽器計算出的 display、width、height、padding、margin、字體與排版資訊。

相符規則不代表它最後勝出；CSS cascade、瀏覽器預設和其他規則共同影響運算樣式。偽元素與 hover 等狀態不一定會出現在元素本身的匹配清單。

「自適應／768／375」調整預覽寬度，可觀察已取得 CSS 的 media query。窄螢幕上最大為可用寬度。

## JavaScript：用語法樹看實作

在獨立 Web Worker 使用 Prettier 內建的 Babel parser 解析語法樹，列出：

- 函式、箭頭函式、方法、參數、async 及來源位置。
- addEventListener／on* 指定、事件名稱、目標選擇器與 handler。
- document DOM 選擇器、DOM 屬性寫入與常見修改方法。
- fetch、常見 axios 呼叫與靜態可讀的 URL／method。
- localStorage／sessionStorage、計時器與模組依賴。

點「查看這段程式」會開啟原始碼並標記對應行。語法錯誤會顯示原因，原始碼仍可閱讀。JSON-LD 等資料腳本不當成 JavaScript 執行碼。

上述是靜態線索，不保證每個同名函式實際就是瀏覽器 API，也不推斷任意動態值、執行順序或網路回應。框架合成事件、shadow DOM、混淆程式和動態載入可能需要另外閱讀。import／dynamic import 依賴不自動展開。

## 安全預覽與取得範圍

預覽移除腳本、事件屬性、iframe、object、embed、base、重新導向 meta，以及外部圖片／字型／表單傳送等資源入口。僅保留可安全顯示的資料圖片與已取得的 CSS，不提供原頁互動執行。選取框線是分析器的提示，不屬於來源網頁。

網址模式使用新的本機 HTTP 連線，不攜帶瀏覽器的登入 Cookie。需要登入、阻擋自動讀取或內容主要由 JavaScript 建立的頁面可能無法完整分析；取得登入頁時，分析的是實際收到的登入頁 HTML。這個版本不操作真實瀏覽器登入，也不繞過網站存取限制。

CSS @import、JS import、跨來源 CDN 資源不會自動展開。失敗／未取得／語法錯誤都會列在讀取紀錄中。

## 限制與資料保存

- HTML 最多 2 MB、4000 元素、90 層巢狀。
- 外部資源最多 12 次讀取、單檔 768 KB、合計約 4 MB；各階段有逾時限制。
- 檔案上傳請求最多 8 MB，單次附加檔案最多 12 份。
- CSS 每份最多列出 1800 條規則；相符規則畫面一次顯示前 70 條。
- JavaScript 語法清單每類每檔最多保留 160 筆，數量統計仍記錄解析總數；語法樹節點上限與 Worker 12 秒逾時避免阻塞畫面。
- 大型元素片段截取前 200 KB，並顯示提示。

分析不寫入資料庫。後端只在記憶體保留最近三次分析，30 分鐘後或服務停止後失效；重新整理不保存輸入。需要留存時按「下載分析 JSON」，報告包含原始碼、來源與解析結果。

## 專案結構

```text
backend/
  app.py             Flask 路由、輸入限制、短期分析快取
  analyzer.py        HTML5 結構、CSS 規則、安全預覽
  fetcher.py         HTTP／HTTPS、重新導向與位址檢查
frontend/
  index.html
  styles.css
  app.js             結構樹、預覽、元素／樣式／JS 對照
  analysis-worker.js JavaScript 語法樹與程式碼排版
  vendor/            本機版 Prettier、parser 與授權文件
```

前端解析／排版套件隨專案附上，不依賴 CDN。Prettier 3.6.2 與其內建第三方套件的授權位於 frontend/vendor/LICENSE、THIRD-PARTY-NOTICES.md。


## CSS 排版練習工具

選取預覽元素後切換 CSS，可查看盒模型、實際邊界、父元素與定位線索。透過屬性選單比較一般選擇器的 !important、優先權及來源順序；複雜選擇器、layer、變數等會標示待確認，不宣稱完整重現瀏覽器 cascade。

在「動手改 CSS」輸入宣告並按「套用到預覽」，即可觀察變化。支援還原此元素、還原全部；重新分析會清除修改。修改不寫回來源 HTML、檔案或原始分析 JSON。編輯器只接受宣告，不接受含大括號的完整規則或外部資源；瀏覽器會忽略無效宣告。

回歸測試：設定 PLAYWRIGHT_MODULE、CHROMIUM_EXECUTABLE 和選用的 ANALYZER_URL 後，以 Node 執行 tests/css-lab.cjs。
