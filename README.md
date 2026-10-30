# Gitea Contribution Review v1.4.3

單一 HTML，僅保留合併者／主線最終結果模式。無後端、持久儲存或 Debug 紀錄，手動匯出 CSV。

## 使用

輸入 Gitea URL、帳號密碼（或 Token）、日期與逾時秒數，載入組織／專案清單後勾選 repo 開始分析。無 OTP、Git email 或模式選擇欄位。Email 自動讀取登入帳號；無 email 時仍可核對 PR merged_by，但無法歸屬的提交不納入，結果標示受限。

統計各 repo 預設分支第一 parent 歷史。已驗證合併 SHA 的 PR 以 merged_by 判斷歸屬；其他提交使用 committer email。一般 merge 對第一 parent，squash 計最終一筆，rebase 逐筆計主線提交；包含直接提交與 initial commit。日期仍以 Committer date 篩選並顯示台灣時間。只解析 PR body 的 Organization/Repository#number。不掃完整 PR 清單、不讀 PR patch。缺少 message 線索時，issue 關聯可能缺失。

變更量＝新增＋刪除；未知欄位不補零。缺失行數顯示原因，總計僅包含已知部分。這是合併／提交結果，不代表單一原作者工時或績效。跨 repo 的相同內容可能重複。

保留即時進度、停止、必要錯誤訊息與逾時設定（預設 180 秒，30–1800 秒）。舊版 Gitea 缺統計時讀取 commit 原始 diff；同源 cookie 可重用瀏覽器登入。帳密不存入 URL、CSV 或本地儲存，HTTP 傳輸未加密。

## 部署

將 `gitea_contribution.html` 放置於 Apache 網站根目錄下的部署子目錄，網址為「站台網址／部署子目錄／gitea_contribution」。部署子目錄可自行命名，亦可沿用既有目錄與網址，程式不綁定任何個人帳號或目錄名稱。Gitea 預設為 `http://drc:8080/gitea`。Traefik 保留路徑並路由至 Apache；無副檔名網址需 Apache rewrite（mod_rewrite、AllowOverride FileInfo）：

```apache
RewriteEngine On
RewriteRule ^gitea_contribution$ gitea_contribution.html [L]
```

## 驗證

```sh
npm test
npm run test:git
```

涵蓋主線／開發分支去重、merged_by 優先歸屬、一般 merge／squash／rebase／直接提交、移除控制項、自動 email、取消及清空；真實 Git diff 比對涵蓋 root commit、特殊檔名與二進位變更。尚未於公司 Gitea 執行自動化測試。

工作紀錄的專案篩選支援 checkbox 多選、全選與清除選取。預設顯示全部；清除後顯示空結果。明細、各視圖、總計與 CSV 皆依所選專案及其他篩選條件更新，不重新呼叫 Gitea。重新查詢或清空資料時恢復全部顯示。

專案篩選只從實際工作紀錄產生選項，不列出只有被選來搜尋、但沒有紀錄的 repo。卡片顯示組織、專案名稱及本次紀錄筆數，支援整張點選與名稱搜尋；名稱搜尋只縮小選項清單，不改動勾選或工作紀錄。全選／清除操作所有有紀錄專案。切換勾選保留鍵盤焦點與清單捲動位置。
