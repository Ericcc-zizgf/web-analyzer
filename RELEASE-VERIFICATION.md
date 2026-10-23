# 發布檢查（2026-10-23）

## 範圍

原版 web-analyzer 保留。發布版位於同一個 web-practice-lab 下的 web-analyzer-release，連接 Ericcc-zizgf/web-analyzer。
排除 .venv、快取、.DS_Store、test-results/analysis.json 與本機測試截圖。
原版自動掃描中「敏感檔案」命中虛擬環境的 CA 憑證組；不是使用者私鑰，環境整份排除。
針對專案來源（排除第三方套件、虛擬環境）掃描常見 OpenAI/GitHub/AWS 金鑰及私鑰格式，未發現匹配。檢查結果不代表所有可能秘密的保證。
保留第三方 parser 與原授權。沒有加入使用者上傳檔案或其他子專案。

## 已執行

- 原 Python 本機版 19 項單元／API 測試通過（使用原版既有虛擬環境，不打包環境）。
- Pages 新增與修改 JavaScript 的 node --check 語法檢查。
- 本機純靜態伺服器測試：示範解析產生 17 個 HTML 元素、10 條 CSS、3 個 JS 函式、2 個事件。
- 點選預覽按鈕後數字維持 0，來源 JS 沒有作為互動執行；能選取對應 HTML 節點。
- 查看選定按鈕的 CSS 盒模型、運算樣式與 JS 事件／handler。
- 查看元素片段可直接從瀏覽器記憶體取得，不呼叫 Flask。

- Pages 版 8 項瀏覽器測試通過：HTML/CSS 與片段、HTML 檔案及 CSS/JS 附加、缺少資源、腳本與資源移除、大小限制、同名附加檔案、拒絕 URL 模式、取消工作。測試頁為 tests/pages-check.html，透過純靜態伺服器開啟。

## 與原版差異

Pages 版停用 URL 抓取與外部資源讀取，接受貼上 HTML 及附加檔案。使用瀏覽器解析，未承諾與 BeautifulSoup/tinycss2 的錯誤回報、行號、正規化結果完全一致。
DOM 行號不提供，CSS 行號僅估算，預覽不載入圖片／SVG／影音，保留在 README。
本次未重跑原 Playwright 整套瀏覽器測試，也未在 Windows 實機測試。
