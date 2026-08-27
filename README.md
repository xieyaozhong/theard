# THEARD — Threads × Shopee Affiliate AI

A maintainable, file-based content production system for creating Taiwan-style Threads posts, matching Shopee affiliate products, validating publishing payloads, and safely preparing posts for the Threads API.

## What is included

- Content Agent: generates short Traditional Chinese lifestyle captions.
- Product Agent: selects active products by topic/category and avoids recent reuse.
- Smart Topic Selector: rotates topics with priority and history penalties.
- Daily Production: creates three preview posts with four products each.
- URL Strategy: validates reply links and prefers official Shopee affiliate short links.
- Publisher Pipeline: validates content before any network call.
- Threads Publisher: uses the official Threads Graph API when explicitly enabled.
- Safe Runner: dry-run by default; real publishing needs explicit confirmation.
- Showcase Site: static immersive portfolio-style project page under `site/`.

## Quick start

```powershell
python --version
python -m unittest discover -s tests -v
python scripts/daily_production.py
python scripts/publisher_pipeline.py
python scripts/publisher_run.py
npm test
npm run build
```

Dry-run is the default. A real publish requires environment variables plus:

```powershell
python scripts/publisher_run.py --publish --confirm PUBLISH_THREADS_NOW
```

## Environment

Copy `.env.example` to `.env` and fill values locally. Never commit `.env`.

```text
THREADS_ACCESS_TOKEN=
THREADS_USER_ID=
THREADS_API_BASE_URL=https://graph.threads.net/v1.0

# Set these in the backend hosting environment, never in the public site.
THEARD_ADMIN_KEY=
THEARD_RATE_KEY=
ALLOWED_ORIGINS=https://xieyaozhong.github.io
```

## Showcase

Open `site/index.html` locally, or deploy `site/` with the included GitHub Pages workflow. The visual direction is inspired by contemporary creative-developer portfolios: large typography, numbered sections, strong contrast, motion, and an interactive canvas background — without copying another site's content or assets.

## 活動票務

- 首頁活動專區：`https://xieyaozhong.github.io/theard/#activities`
- AI Prompt Lab：`https://xieyaozhong.github.io/theard/workshop/`
- 公開抽票：`https://xieyaozhong.github.io/theard/draw/`
- 活動後台：`https://xieyaozhong.github.io/theard/admin/`
- 電子票與驗票：領票後由抽票頁開啟；驗票頁只查詢狀態，不會直接核銷。

票務前端仍由 GitHub Pages 提供，但活動、場次、一次性抽取碼、票券狀態與稽核紀錄都透過 `site/api.js` 連到 Cloudflare Worker + D1 共用資料服務。首頁活動專區也透過唯讀公開端點同步後台已發布／開放中的場次與剩餘票數，不會公開抽取碼、驗證 token、票號或參加者資料。`localStorage` 只保存使用者最近領取的票券畫面，不能作為後台票庫或核銷依據。

後台需要部署環境中的 `THEARD_ADMIN_KEY`。管理員輸入後，金鑰只保留在目前分頁的記憶體，重新整理或鎖定後即清除；不寫入 Git、公開前端或瀏覽器儲存空間。D1 邏輯綁定記錄於 `.openai/hosting.json`；正式密鑰由部署平台管理。

每個一次性抽取碼只對應一張指定場次的入場票；前台向共用資料服務完成原子領取後才播放揭曉動畫。後台以相同資料庫顯示場次、剩餘票、已領票與核銷狀態，因此不同裝置看到的是同一份資料。

為確保免費層 D1 也能在單一交易內完成整批發行，每批上限為 25 張；大量活動可連續分批發行並合併匯出。

## AI Prompt Lab

`site/workshop/` 是可以直接用於實體課程的瀏覽器工作台，不替參加者呼叫任何 AI，也不需要共用 API 金鑰。參加者先用提示詞組合器與限制輪盤建立同一份測試 prompt，複製到自己的 AI 工具生成，再把 2–3 份原始輸出貼回做匿名盲測、共同評分、投票與結構拆解。

工作台包含課程階段導航、講師計時器、提示詞完整度、互動任務輪盤、限制輪盤、跨 AI 輸出收集、盲測評分、團隊投票、Prompt Bingo、成果匯出與課後覆盤。頁面同時解釋模型家族／架構、訓練目標、系統指令、上下文／工具與取樣設定如何造成不同輸出，但不臆測任何產品未公開的內部資訊。

草稿與計時偏好可選擇只保存在目前裝置；貼回的 AI 輸出、投票與評分只留在當前分頁記憶體，不上傳到伺服器。現場仍應提醒參加者不要貼入個資、機密或受保護資料。
