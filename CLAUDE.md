# CLAUDE.md

Telegram 提醒機器人，跑在 Cloudflare Workers（Hono + D1 + Workers AI），cron 定時推送。

## 專案位置

Worker 程式碼在 **`telegram-reminder/` 子目錄**（不是 repo 根目錄）。所有 `wrangler` / 套件指令都要在該子目錄下執行。

## 指令（重要：用 wrangler，不要用 `pnpm deploy`）

```bash
cd telegram-reminder

wrangler deploy --minify          # 部署（正式）
wrangler dev                      # 本地開發
npx wrangler deploy --dry-run --outdir /tmp/wr-dry   # 只驗證打包，不部署
```

### `pnpm deploy` 是陷阱

`deploy` 是 **pnpm 內建子命令**（workspace 套件部署），不會執行 package.json 的 deploy 腳本，在本專案會直接報錯。要透過腳本請用 `pnpm run deploy`（含 `run`），或直接 `wrangler deploy --minify`。`npm run deploy` 可正常運作。

### 型別檢查

專案**沒有安裝 TypeScript**，靠 esbuild（wrangler）打包，型別錯誤不會擋部署。驗證打包用 `wrangler deploy --dry-run`；IDE 的型別提示僅供參考。

## AI 用法（已全面拋棄 JSON Mode）

所有 Workers AI 呼叫都走**純文字**，模型統一 `@cf/meta/llama-3.1-8b-instruct-fast`（見 `src/ai-config.ts`）。多欄位需求（如網址摘要）**拆成多次純文字呼叫**，不要用 `response_format` / `json_schema`。

原因：Cloudflare JSON Mode 在可用模型上不穩——`-fast` 模型回 `8007 Grammar error: Invalid type: json_schema`（文件謊報支援），70b-fp8-fast 長輸出回 `5024 JSON Mode couldn't be met`。

## 提醒排程機制

- cron `0,30 * * * *`（每整點與半點），定義在 `wrangler.jsonc`。
- 時間鍵用 `getTaipeiTimeKey()`（回 `HH:00`/`HH:30`），比對用 `DUE_QUERY`：精確 `HH:MM` 隨時觸發；`*`（每小時）與舊 `HH` 格式**只在整點(:00)**觸發，避免半點重複。
- 自然語言排程的「時間」由 chrono-node 解析（`src/parseReminder.ts`），「內容」由一次純文字 AI 呼叫擷取。

## 網頁測試端點

```
GET /test/<TELEGRAM_WEBHOOK_TOKEN>?hour=HH
```

`hour` 視為 `HH:00`；不帶則用現在台北時間鍵。會實際推送 Telegram。

## Secrets 與 Webhook

`TELEGRAM_BOT_TOKEN`（BotFather 提供）、`TELEGRAM_WEBHOOK_TOKEN`（自訂密鑰，`uuidgen` 產生）用 `wrangler secret put` 設定。

⚠️ **改了 `TELEGRAM_WEBHOOK_TOKEN` 後一定要重新註冊 webhook**，否則 Telegram 打舊網址會被 worker 回 403、所有指令靜默（但 cron 仍會推送，造成「提醒正常、指令無反應」的假象）：

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://telegram-reminder.jlib-cf.workers.dev/webhook/<目前的_TELEGRAM_WEBHOOK_TOKEN>"
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"   # 檢查註冊狀態與 last_error
```
