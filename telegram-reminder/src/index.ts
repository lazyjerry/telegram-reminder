import { Hono } from "hono";
import { env } from "hono/adapter";
import { parseReminder } from "./parseReminder";
import { sendTG, sendTGWithAi } from "./utils/tg-bot";
import { aiTools } from "./utils/aiTools";

type Env = {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_WEBHOOK_TOKEN: string;
	AI: Ai;
};

/* ---------- 全域說明文字：只修改這裡 ---------- */
const HELP_TEXT = ["📖 功能列表", "────────────────", "/start ‣ 訂閱並顯示說明", "/help  ‣ 查看本說明", "/hours HH HH ‣ 設定營業時間 [開始 結束] 記得要在指令後面輸入喔！", "/list  ‣ 列出全部排程", "/del <UUID> ‣ 刪除指定排程", "", "🔗 網址摘要功能：", "  • 直接貼上網址即可獲得約 300 字的繁體中文摘要", "", "自然語言排程範例：", "  • 早上 9 點提醒我開會", "  • 每小時 提醒伸展"].join("\n");

/* ---------- URL 檢測正則表達式 ---------- */
const URL_REGEX = /^(https?:\/\/[^\s]+)$/i;

const app = new Hono<{ Bindings: Env }>();

/* ---------- 共用 ---------- */
const TPE_ZONE = "Asia/Taipei";
const getTaipeiHour = () =>
	new Date().toLocaleString("en-GB", {
		timeZone: TPE_ZONE,
		hour12: false,
		hour: "2-digit",
	});

/**
 * 判斷目標小時 h ('00'–'23') 是否落在 open~close 之間
 * - 支援跨夜
 * - open === close 代表 24 小時營業
 */
const isWithinHours = (h: string, open: string, close: string): boolean => {
	const n = +h,
		s = +open,
		e = +close;

	console.log(`[isWithinHours] 檢查小時: ${h} (數值: ${n}), 開始: ${open} (數值: ${s}), 結束: ${close} (數值: ${e})`);

	if (s === e) {
		console.log("[isWithinHours] 24 小時營業，回傳 true");
		return true; // 24h
	}

	if (s < e) {
		const result = n >= s && n <= e;
		console.log(`[isWithinHours] 同日範圍 (${s}~${e})，結果: ${result}`);
		return result;
	}

	// 跨夜範圍：例如 20~05
	const result = n >= s || n <= e;
	console.log(`[isWithinHours] 跨夜範圍 (${s}~${e})，結果: ${result}`);
	return result;
};

/* ----- Webhook ---------- */
app.post("/webhook/:token", async (ctx) => {
	const { DB, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_TOKEN } = env(ctx);
	if (ctx.req.param("token") !== TELEGRAM_WEBHOOK_TOKEN) return ctx.text("403", 403);

	const { message: msg } = await ctx.req.json<any>();
	if (!msg || !msg.text) return ctx.json({ ok: true });

	const username = msg.chat.username;
	const chatId = msg.chat.id;
	const text = msg.text.trim();

	/* 0) 取使用者營業時間 */
	const userRow = (username && (await DB.prepare("SELECT open_hour, close_hour FROM users WHERE username = ?").bind(username).first<{ open_hour: string; close_hour: string }>())) || { open_hour: "00", close_hour: "23" };

	/* /help */
	if (text === "/help") {
		await sendTG(TELEGRAM_BOT_TOKEN, chatId, HELP_TEXT);
		return ctx.json({ ok: true });
	}

	/* 網址摘要功能 */
	const urlMatch = text.match(URL_REGEX);
	if (urlMatch) {
		const url = urlMatch[1];
		console.log("[webhook] 偵測到網址:", url);

		try {
			await sendTG(TELEGRAM_BOT_TOKEN, chatId, "🔍 正在分析網頁內容，請稍候...");

			const { AI } = env(ctx);
			const summary = await aiTools.fetchAndSummarizeUrl(AI, url);

			const response = [
				"📄 網頁摘要",
				"────────────────",
				`🏷️ 網站名稱：${summary.websiteName}`,
				`📂 網站屬性：${summary.websiteType}`,
				"",
				"📝 內容摘要：",
				summary.summary,
				"",
				`🔗 原始連結：${url}`,
			].join("\n");

			await sendTG(TELEGRAM_BOT_TOKEN, chatId, response);
		} catch (error: any) {
			console.error("[webhook] 網址摘要錯誤:", error.message);
			await sendTG(TELEGRAM_BOT_TOKEN, chatId, `⚠️ 無法分析該網址：${error.message}`);
		}

		return ctx.json({ ok: true });
	}

	/* /hours HH HH 或 營業時間 HH HH */
	const hourCmd = text.match(/^(?:\/hours|營業時間)\s+(\d{1,2})\s+(\d{1,2})$/i);
	if (hourCmd && username) {
		let [, open, close] = hourCmd.map((s) => s.padStart(2, "0"));

		/* --- 合法性檢查 --- */
		const isValid = (h: string) => /^\d{2}$/.test(h) && +h >= 0 && +h <= 23;
		if (!isValid(open) || !isValid(close)) {
			await sendTG(TELEGRAM_BOT_TOKEN, chatId, "⚠️ 請輸入有效的時間（00–23）");
			return ctx.json({ ok: true });
		}

		/* 24 小時營業：開關相同 */
		const isFullDay = open === close;

		/* 非 24h 時段需保證至少 1 小時 */
		if (!isFullDay) {
			const diff = (+close - +open + 24) % 24; // 跨夜時 +24
			if (diff === 0) {
				await sendTG(TELEGRAM_BOT_TOKEN, chatId, "⚠️ 開始與結束時間需至少相隔 1 小時，或輸入同一時間代表 24 小時營業");
				return ctx.json({ ok: true });
			}
		}

		/* --- 寫入資料庫 --- */
		await DB.prepare("UPDATE users SET open_hour = ?, close_hour = ? WHERE username = ?").bind(open, close, username).run();

		/* --- 組合回覆 --- */
		const msg = isFullDay ? "✅ 已更新營業時間：24 小時營業" : +open > +close ? `✅ 已更新營業時間：${open}:00 → 次日 ${close}:00 (跨夜)` : `✅ 已更新營業時間：${open}:00–${close}:00`;

		await sendTG(TELEGRAM_BOT_TOKEN, chatId, msg);
		return ctx.json({ ok: true });
	}

	if (text === "/hours" && username) {
		// 如果只輸入 /hours，則回傳目前營業時間
		// 如果是 24 小時營業，則顯示「24 小時營業」
		if (userRow.open_hour === userRow.close_hour) {
			await sendTG(TELEGRAM_BOT_TOKEN, chatId, "📅 目前營業時間：24 小時營業");
		} else {
			await sendTG(TELEGRAM_BOT_TOKEN, chatId, `📅 目前營業時間：${userRow.open_hour}:00–${userRow.close_hour}:00\n如果要修改，請在指令後面帶入小時，例如 /hours 10 23`);
		}
	}

	/* /list */
	if (text === "/list" && username) {
		const { results } = await DB.prepare("SELECT uuid, match_time, content FROM reminders WHERE username = ?").bind(username).all<{ uuid: string; match_time: string; content: string }>();

		if (!results.length) {
			await sendTG(TELEGRAM_BOT_TOKEN, chatId, "ℹ️ 目前沒有任何排程");
			return ctx.json({ ok: true });
		}

		const lines = results.map((r) => {
			const t = r.match_time === "*" ? "每小時" : `${r.match_time}:00`;
			return `• ${t} ⇒ ${r.content}\n  🆔 ${r.uuid}`;
		});
		await sendTG(TELEGRAM_BOT_TOKEN, chatId, `📋 您的排程：\n\n${lines.join("\n\n")}`);
		return ctx.json({ ok: true });
	}

	/* /start */
	if (text === "/start" && username) {
		await DB.prepare(
			`INSERT OR REPLACE INTO users
       (username, chat_id, open_hour, close_hour)
       VALUES (?, ?, COALESCE((SELECT open_hour FROM users WHERE username=?), '00'),
                       COALESCE((SELECT close_hour FROM users WHERE username=?), '23'))`
		)
			.bind(username, chatId, username, username)
			.run();

		await sendTG(TELEGRAM_BOT_TOKEN, chatId, ["✅ 已訂閱提醒！", "", HELP_TEXT, "", `目前營業時間：${userRow.open_hour}:00–${userRow.close_hour}:00`, "⚠ 提醒僅在營業時間內推送"].join("\n"));
		return ctx.json({ ok: true });
	}

	/* 刪除 UUID */
	const delMatch = text.match(/^\/del\s+([0-9a-fA-F-]{36})$/);
	if (delMatch && username) {
		const uuid = delMatch[1];
		const res = await DB.prepare("DELETE FROM reminders WHERE uuid = ? AND username = ?").bind(uuid, username).run();

		await sendTG(TELEGRAM_BOT_TOKEN, chatId, res.success && res.meta.changes ? `🗑 已刪除排程 ${uuid}` : "⚠ 找不到該排程或無權刪除");
		return ctx.json({ ok: true });
	}

	if (text === "/del" && username) {
		// 如果只輸入 /del，則回傳提示訊息並且返回目前的排程列表
		const { results } = await DB.prepare("SELECT uuid, match_time, content FROM reminders WHERE username = ?").bind(username).all<{ uuid: string; match_time: string; content: string }>();

		if (!results.length) {
			await sendTG(TELEGRAM_BOT_TOKEN, chatId, "ℹ️ 目前沒有任何排程可以刪除。請先新增排程");
			return ctx.json({ ok: true });
		}

		const lines = results.map((r) => {
			const t = r.match_time === "*" ? "每小時" : `${r.match_time}:00`;
			return `• ${t} ⇒ ${r.content}\n  /del ${r.uuid}`;
		});
		await sendTG(TELEGRAM_BOT_TOKEN, chatId, `⚠️ 您要刪除的排程（請複製貼上指令）：\n\n${lines.join("\n\n")}`);
		return ctx.json({ ok: true });
	}

	// 判斷如果開頭是 / 或 #，則視為指令
	if (text.startsWith("/") || text.startsWith("#")) {
		await sendTG(TELEGRAM_BOT_TOKEN, chatId, "⚠️ 請使用自然語言描述排程，例如：早上 8 點提醒我開會");
		return ctx.json({ ok: true });
	}

	/* 新增排程 */
	// 解析提醒時間和內容
	const { AI } = env(ctx);
	let { hour, content } = await parseReminder(AI, text);

	// 每小時關鍵詞
	const hourlyRE = /(00-23|每小時|every\s*hour|\/hourly|\/everyhour)/i;
	if (!hour && hourlyRE.test(text)) {
		hour = "*";
		if (!content) content = text.replace(hourlyRE, "").trim();
	}
	console.log("Parsed Reminder:", { hour, content }); // Debug: Log parsed hour and content
	// 如果沒有解析出 hour 或 content，則提示使用者

	if (!hour) {
		await sendTG(TELEGRAM_BOT_TOKEN, chatId, "⚠️ 解析錯誤，請先說明「何時」要提醒，例如：「早上 8 點」或「每小時」");
		return ctx.json({ ok: true });
	}
	if (!content) {
		await sendTG(TELEGRAM_BOT_TOKEN, chatId, "⚠️ 解析錯誤，請說明要提醒的「內容」");
		return ctx.json({ ok: true });
	}

	/* 營業時間限制：僅針對特定小時 */
	if (hour !== "*" && !isWithinHours(hour, userRow.open_hour, userRow.close_hour)) {
		await sendTG(TELEGRAM_BOT_TOKEN, chatId, `⚠ ${hour}:00 不在營業時間 ${userRow.open_hour}:00–${userRow.close_hour}:00 內，排程未新增`);
		return ctx.json({ ok: true });
	}

	const uuid = crypto.randomUUID();
	await DB.prepare("INSERT INTO reminders (uuid, username, content, match_time) VALUES (?, ?, ?, ?)").bind(uuid, username, content, hour).run();

	const desc = hour === "*" ? "每小時" : `${hour}:00 整`;
	await sendTG(TELEGRAM_BOT_TOKEN, chatId, `📝 已排程 ${desc} ⇒ ${content}\n🆔 ${uuid}\n🗑️如需刪除請輸入：\n\n/del ${uuid}`);
	return ctx.json({ ok: true });
});

/* ---------- GET /debug/:token?text=... ---------- */
app.get("/debug/:token", async (ctx) => {
	const { AI, TELEGRAM_WEBHOOK_TOKEN } = env(ctx);
	if (ctx.req.param("token") !== TELEGRAM_WEBHOOK_TOKEN) return ctx.text("403", 403);

	const txt = ctx.req.query("text") ?? "";
	const parsed = await parseReminder(AI, txt, TPE_ZONE); // ★ 呼叫同一支 parser
	return ctx.json({ input: txt, parsed });
});

/* ---------- /test/:token?hour=HH ---------- */
app.get("/test/:token", async (ctx) => {
	const { DB, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_TOKEN } = env(ctx);
	if (ctx.req.param("token") !== TELEGRAM_WEBHOOK_TOKEN) return ctx.text("403", 403);

	const qHour = ctx.req.query("hour");
	const hour = qHour && /^\d{1,2}$/.test(qHour) ? qHour.padStart(2, "0") : getTaipeiHour();

	const { results } = await DB.prepare(
		`SELECT r.content, r.match_time, u.chat_id, u.open_hour, u.close_hour
       FROM reminders r
       JOIN users u ON u.username = r.username
      WHERE r.match_time = ? OR r.match_time = '*'`
	)
		.bind(hour)
		.all<{ content: string; match_time: string; chat_id: number; open_hour: string; close_hour: string }>();

	// 解析提醒時間和內容
	const { AI } = env(ctx);

	for (const row of results) {
		const shouldSend = row.match_time === "*" ? isWithinHours(hour, row.open_hour, row.close_hour) : isWithinHours(hour, row.open_hour, row.close_hour);

		if (shouldSend) {
			ctx.executionCtx.waitUntil(sendTGWithAi(AI, TELEGRAM_BOT_TOKEN, row.chat_id, row.content, TPE_ZONE));
		}
	}

	return ctx.json({ ok: true, testHour: hour, sent: results.length });
});

/* ---------- Cron Job ---------- */
export default {
	async scheduled(_evt: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		const hour = getTaipeiHour();

		const { results } = await env.DB.prepare(
			`SELECT r.content, r.match_time, u.chat_id, u.open_hour, u.close_hour
         FROM reminders r
         JOIN users u ON u.username = r.username
        WHERE r.match_time = ? OR r.match_time = '*'`
		)
			.bind(hour)
			.all<{ content: string; match_time: string; chat_id: number; open_hour: string; close_hour: string }>();

		// 解析提醒時間和內容;

		for (const row of results) {
			const shouldSend = row.match_time === "*" ? isWithinHours(hour, row.open_hour, row.close_hour) : isWithinHours(hour, row.open_hour, row.close_hour);

			if (shouldSend) {
				ctx.waitUntil(sendTGWithAi(env.AI, env.TELEGRAM_BOT_TOKEN, row.chat_id, row.content, TPE_ZONE));
			}
		}
	},
	fetch: app.fetch,
};
