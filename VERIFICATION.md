# 網頁分析器驗證

- 19 項 Python 單元／API 測試通過：HTML5 修復、CSS 宣告和條件、事件屬性、原始元素片段、附加檔案、輸入與大小限制、本機 CSRF、網址／DNS 位址限制、base 來源限制等。
- Chromium 整合測試：以真正 HTTP 測試頁讀取同來源 CSS／JS，解析函式、事件、fetch、儲存呼叫；語法錯誤可見，原始碼可排版與查看。
- 點選預覽元素可對應結構樹、屬性與 CSS，改為 375px 後確認 media query 生效。
- HTML 檔案上傳、獨立 CSS／JS 附加上傳、重新分析後不殘留上一份原始碼。
- 下載的 JSON 含真正 JavaScript 語法結果；示範函式數量由 AST 算出。
- 來源 script、HTML 事件屬性、外部圖片、CSS import、JS import 沒有在預覽發出請求或執行副作用。
- HTTP 重新導向、401、過大內容、跨來源重新導向攔截均驗證。
- 實際下載 https://example.com/ 公開 HTML，TLS 憑證檢查與 HTTPS 讀取成功。
- 390px 手機版沒有頁面水平溢出，沒有未處理頁面錯誤。

```sh
.venv/bin/python -B -m unittest discover -s tests -p 'test_api.py'
.venv/bin/python -B tests/verify.py
```

瀏覽器測試需已安裝 Node.js／Playwright，可透過 NODE_BINARY、PLAYWRIGHT_MODULE、CHROMIUM_EXECUTABLE 指定環境。測試使用暫存的本機網站與獨立瀏覽器內容，不呼叫模型或付費服務。
