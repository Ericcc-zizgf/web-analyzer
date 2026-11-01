# 專案資料夾分析

## 使用方法

1. 沿用原本的 `start.command` 啟動方式，或執行 `python3 -m http.server 5241 --bind 127.0.0.1 --directory docs` 開啟瀏覽器版。
2. 在頁面頂端按「選擇網頁專案資料夾」，選擇包含原始碼的根資料夾。
3. 結構分析後立即自動分析入口網頁，不必再次上傳。下方工作台直接顯示預覽、HTML 結構樹、CSS 與 JavaScript。多個 HTML 可用「分析網頁」選單切換。
4. 在「檔案結構與職責」展開目錄，或搜尋檔名／職責；右側顯示檔案的用途、依據、函式、引用與原始碼。HTML 檔案另有「直接分析這個網頁」按鈕。
5. 點引用檔名可跳到相關檔案。「哪些檔案引用它」可以往回追溯。
6. 按「下載專案 JSON」保存機器可讀報告；按「下載專案說明 Markdown」保存可閱讀筆記。
7. 改動原始碼後重新選擇資料夾。分析期間可取消。

## 判斷依據

HTML 依頁面標題與資源標籤辨識；CSS 依選擇器、@media、@import 與 url 辨識；JS／TS／JSX 使用既有隨專案提供的 Babel parser 解析函式、匯出、import／require、Worker、DOM、事件、fetch 與瀏覽器儲存。Python 以 def 與路由裝飾器辨識；不使用完整 Python AST。README、套件與設定檔另外依類型標示。證據不足時保留一般分類，或明示依命名推測。

引用解析使用完整的相對路徑，支援省略 JS／TS 等副檔名與 index 模組。同名不同資料夾不會以 basename 混在一起。套件與外部網址不列為缺檔；別名、伺服器根路徑與執行時產生的路徑需要人工確認。HTML／CSS 的文字比對可能包含註解或範例，不是框架打包器的依賴圖。

不執行來源、不讀取任意系統路徑、不自動連線原專案的 API，也不會把原始碼傳給外部 AI。讀到 README 或註解中的指令只作資料處理。

## 程式分工

兩份介面共用相同的資料夾分析模組：

- `project-core.js`：檔案排除、大小限制、靜態分析、職責與引用解析；亦供 Node 測試。
- `project-worker.js`：在 Worker 載入隨專案提供的 Babel parser，避免解析佔住 UI 執行緒。
- `project-ui.js`：資料夾選取、取消、目錄樹、詳情、搜尋、頁面切換與報告匯出。
- `project-page.js`：從記憶體快照選入口、對應相對路徑、處理 base、展開 JS 模組及一般 CSS @import。
- `static-analyzer.js`：單頁瀏覽器解析與安全預覽；本機版的資料夾模式也使用此解析器，檔案不傳送至 Flask。
- `project.css`：專案地圖與窄螢幕版面。

`frontend/index.html` 與 `docs/index.html` 載入上述模組。`app.js` 透過 PageWorkbench 串接既有網頁工作台，資料夾結果與元素片段使用瀏覽器的報告快取。本機版單獨輸入 HTML／網址時仍走原有 Flask API。後端 API、第三方 parser 與授權未變更。

## 測試

```sh
node tests/project-core.cjs
node tests/project-page.cjs
python -m unittest discover -s tests -p test_api.py
```

Python 測試需要先依 requirements.txt 安裝依賴。資料夾核心測試涵蓋 JS／TS／JSX、可選鏈事件、同名路徑、缺失引用、套件、CSS 資源、語法錯誤、排除前不讀取敏感檔名、大小限制及取消。

## 自動整頁分析的範圍

只讀取當次選取的快照，不執行原專案、不自動啟動開發伺服器。優先根目錄 index.html／index.htm，再選較淺的子目錄 index 或其他 HTML。找不到可讀取 HTML 時保留專案結構說明，清除上一個專案的網頁結果並提示原因。

一般相對路徑、根路徑、HTML base、查詢字串與可確認的本機 JS 模組可對應。套件、別名及執行時組合路徑未展開；CSS @import 支援一般媒體條件，循環與過深匯入會停止，layer／supports 條件暫未展開。由 JS 匯入的 CSS 只列來源，不猜測打包器的樣式套用順序。React／Vue 等框架的動態畫面不執行。圖片與字型仍不載入。

單頁 HTML 限 2 MB，依賴單檔 768 KB、合計含 HTML 最多 8 MB、依賴最多 60 份，且最多 60 個樣式／腳本分析區塊。CSS 展開最多 20 層、每份展開內容約 2 MB，避免循環與重複匯入造成過大輸入。CSS 匯入後的規則行號屬合併樣式估算，原檔仍可從專案地圖查看。

透過 HTTP 伺服器開啟 `tests/project-connected-check.html`，按「執行測試」可驗證資料夾整頁分析、跨頁同名檔隔離、片段讀取、缺失依賴、取消與大小限制。`tests/pages-check.html` 保留原本 8 項單頁測試。
