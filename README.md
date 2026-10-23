# 網頁分析器

用 HTML 結構樹、CSS 規則與 JavaScript 語法樹，理解網頁如何組成。提供 GitHub Pages 瀏覽器版與 Python 本機版。

**[開啟線上版](https://ericcc-zizgf.github.io/web-analyzer/)** · [原始碼](https://github.com/Ericcc-zizgf/web-analyzer) · [Python 本機版完整操作說明](LOCAL-README.md)

![網頁分析器畫面](docs/assets/preview.png)

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

瀏覽器版與本機版不是完全相同的解析器：DOM 不提供原始行號；CSS 行號是第一次找到選擇器的位置估算，可能不精確；瀏覽器 CSSOM 可能直接略過無效語法，未必提供 Python 版相同的錯誤訊息。複雜規則、動態腳本、框架事件與執行時樣式都需要另外閱讀。

## 線上版如何使用

1. 開啟線上版，按「載入示範」查看可操作的分析結果。
2. 自己分析時，選「貼上 HTML」或「上傳檔案」。可以分析視覺化網頁器匯出的 HTML。
3. 若 HTML 引用獨立 CSS／JS，在「附加檔案與基準網址」選入對應檔案。Pages 版只使用附加檔案，不會自動讀取網址，基準網址與遠端讀取選項停用。
4. 點「分析網頁」，選結構樹或預覽中的元素，再切換 HTML／CSS／JavaScript 對照。
5. 用「看此元素片段」查看選中元件的原始碼；用「動手改 CSS」練習排版，修改只影響預覽。
6. 需要保存時按「下載分析 JSON」。報告包含你輸入的原始碼，分享報告前請自行檢查內容。

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
