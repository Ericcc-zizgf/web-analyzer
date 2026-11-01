# BUG 修復與驗證紀錄（2026-11-02）

本次檢查涵蓋資料夾掃描、HTML/CSS 引用、入口推測、多頁背景分析、JavaScript 元素關聯、取消／重選操作、單頁解析、Flask API、網址讀取與安全預覽。這是可重現問題的修復與回歸驗證，不代表所有可能輸入都沒有 BUG。

## 已修正的問題

| 範圍 | 修前失敗 | 修後行為 |
| --- | --- | --- |
| 根目錄 | 資料夾真的叫「專案」時，路徑多保留一層 | 根目錄判斷與顯示名稱分開 |
| HTML 引用 | `data-src` 被當 `src`；大寫或無引號標籤漏讀 | 依精確屬性與字串邊界讀取，跳過註解與 raw-text 偽標籤 |
| HTML base | 引用圖忽略 `<base>`，與網頁解析結果矛盾 | 引用圖與頁面使用一致的 URL 基準；template 裡的假 base 不影響活動頁面 |
| 路徑對應 | 圖片／頁面引用會錯猜成同名 `.js` | 只有模組匯入使用模組副檔名候選 |
| 大型清單 | 函式／引用截斷卻看不出來 | 保留總數、truncated 與診斷文字 |
| CSS 匯入 | 字串裡的 `@import` 被改寫成另一份 CSS | 只處理字串／註解外的頂層 import，另有限制展開工作量 |
| 入口判斷 | script、屬性值或 template 裡的假 HTML 影響評分 | 使用活動頁面標籤線索 |
| HTML 屬性 | 瀏覽器版遺失 html/head/body 屬性 | 保留正確 wrapper 屬性，忽略註解、腳本與 template 中的假 wrapper |
| CSS 預覽 | 小於號 escape 錯誤；後端 CSS 的 `</style>` 可污染 DOM | 使用正確 CSS escape，來源內容保持不變 |
| 預覽大小 | 重複資源繞過區塊限制、展開成極大內容 | 按實際區塊計數，並限制展開來源／預覽容量 |
| CSS media／script type | 後端把同路徑不同語意的標籤合併 | 共用下載內容，但保留各標籤媒體條件、類型和順序 |
| 壞網址 | malformed resource/base 使整頁回 500 | 逐資源顯示錯誤，保留其餘分析 |
| URL 驗證 | `:0` 被當預設埠號，控制字元可能先被 urllib 移除 | 正規化前驗證原始輸入；拒絕不合法埠號／控制字元 |
| API token | 非 ASCII token 使 compare_digest 回 500 | 回 403 |
| 取消／重選 | 舊讀檔進度覆寫取消或新專案狀態 | 用執行序號隔離；取消也清空 picker，允許重選 |
| Worker 更新 | 新 UI 可能搭配舊 Worker | Worker URL 帶入版本 query，HTML 資產同步更新 |
| JS 元素關聯 | 變數重新賦值後，事件仍錯綁舊元素 | 對可能重賦值採保守判斷，並處理同名變數作用域 |
| 元素片段 | 預先複製每個祖先的完整子樹，巢狀大文件重複佔用記憶體 | 按需產生，輸出最多 200,000 字元並明示截斷；保留 template／註解 |

## 驗證門檻

| 門檻 | 驗證方式 | 結果 |
| --- | --- | --- |
| 掃描與路徑 | `node tests/project-core.cjs` | 通過 |
| 入口與 CSS 匯入 | `node tests/project-page.cjs` | 通過 |
| 取消、重選、晚到的讀檔／Worker／頁面結果 | `node tests/project-ui-state.cjs` | 通過 |
| DOM alias、重賦值、分支／閉包／解構／迴圈、作用域、回呼 | `node tests/worker.cjs` | 通過 |
| 後端 API 與 fetcher | Python unittest discovery，34 項 | 通過 |
| 原有瀏覽器單頁功能 | `tests/pages-check.html`，8 項 | 通過 |
| 多頁分析、引用隔離、片段快取、取消與大小限制 | `tests/project-connected-check.html`，6 項 | 通過 |
| wrapper、CSS escape、media、展開容量、片段截斷／template | `tests/bug-regression.html`，6 項 | 通過 |
| 真實互動 | 載入示範、點元素查看事件、CSS 練習套用／還原 | 已操作確認 |
| 真實網址 | Flask 讀取本機 HTTP fixture，含重複 CSS media 與壞 IPv6 資源 | 能完成其餘分析，CSS 條件保留 |

## 重跑方式

```sh
node tests/project-core.cjs
node tests/project-page.cjs
node tests/project-ui-state.cjs
node tests/worker.cjs
python -m unittest discover -s tests -p 'test_*.py'
```

Python 需先安裝 requirements.txt。瀏覽器測試可在專案根目錄啟動 `python3 -m http.server 5242 --bind 127.0.0.1`，依序開啟上述三個 tests/*.html 並按「執行測試」。測試只使用合成資料，不包含公司原始碼、密鑰或測試下載產物。

## 仍有的產品範圍限制

不執行來源程式；框架動態畫面、伺服器業務流程、執行時組合路徑與尚未支援的別名不會被完整還原。入口仍是附有依據的推測。容量、元素、函式與引用清單上限仍適用；已略過、截斷和不確定項目需保留提示。尚未用使用者的真實公司系統做完整效能與準確率驗收。
