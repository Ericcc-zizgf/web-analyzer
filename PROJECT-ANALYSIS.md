# 專案資料夾分析

## 使用方法

1. 沿用原本的 `start.command` 啟動方式，或執行 `python3 -m http.server 5241 --bind 127.0.0.1 --directory docs` 開啟瀏覽器版。
2. 在頁面頂端按「選擇網頁專案資料夾」，選擇包含原始碼的根資料夾。
3. 分析完成後，左側展開目錄，或搜尋檔名／職責；右側顯示該檔案的用途、依據、函式、引用與原始碼。
4. 點引用檔名可跳到相關檔案。「哪些檔案引用它」可以往回追溯。
5. 按「下載專案 JSON」保存機器可讀報告；按「下載專案說明 Markdown」保存可閱讀筆記。
6. 改動原始碼後重新選擇資料夾。分析期間可取消。

## 判斷依據

HTML 依頁面標題與資源標籤辨識；CSS 依選擇器、@media、@import 與 url 辨識；JS／TS／JSX 使用既有隨專案提供的 Babel parser 解析函式、匯出、import／require、Worker、DOM、事件、fetch 與瀏覽器儲存。Python 以 def 與路由裝飾器辨識；不使用完整 Python AST。README、套件與設定檔另外依類型標示。證據不足時保留一般分類，或明示依命名推測。

引用解析使用完整的相對路徑，支援省略 JS／TS 等副檔名與 index 模組。同名不同資料夾不會以 basename 混在一起。套件與外部網址不列為缺檔；別名、伺服器根路徑與執行時產生的路徑需要人工確認。HTML／CSS 的文字比對可能包含註解或範例，不是框架打包器的依賴圖。

不執行來源、不讀取任意系統路徑、不自動連線原專案的 API，也不會把原始碼傳給外部 AI。讀到 README 或註解中的指令只作資料處理。

## 程式分工

兩份介面各有相同的四個檔案：

- `project-core.js`：檔案排除、大小限制、靜態分析、職責與引用解析；亦供 Node 測試。
- `project-worker.js`：在 Worker 載入隨專案提供的 Babel parser，避免解析佔住 UI 執行緒。
- `project-ui.js`：資料夾選取、取消、目錄樹、詳情、搜尋與報告匯出。
- `project.css`：專案地圖與窄螢幕版面。

`frontend/index.html` 與 `docs/index.html` 載入上述模組。未更動原有單頁分析器、後端 API、第三方 parser 或授權。

## 測試

```sh
node tests/project-core.cjs
python -m unittest discover -s tests -p test_api.py
```

Python 測試需要先依 requirements.txt 安裝依賴。資料夾核心測試涵蓋 JS／TS／JSX、可選鏈事件、同名路徑、缺失引用、套件、CSS 資源、語法錯誤、排除前不讀取敏感檔名、大小限制及取消。
