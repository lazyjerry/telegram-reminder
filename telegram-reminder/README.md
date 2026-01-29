# Telegram 提醒機器人

一個基於 Cloudflare Workers 的 Telegram 提醒機器人，支援自然語言排程與網址摘要功能。

## 功能特色

- 📅 自然語言排程提醒（如：「早上 9 點提醒我開會」）
- ⏰ 每小時定時提醒
- 🔗 網址摘要功能 - 貼上網址即可獲得約 300 字繁體中文摘要
- 🕐 自訂營業時間（僅在設定時段內推送提醒）

## 網址摘要功能截圖

![網址摘要功能](./screenshots/url-summary.png)

## 安裝與開發

```txt
npm install
npm run dev
```

## 部署

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
