import type { Ai } from "@cloudflare/ai"; // 2024-05+ 型別檔
import { LLM_ID } from "../ai-config";

export const sendTG = (token: string, id: number, text: string) =>
	fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ chat_id: id, text }),
	});

/** AI 隨機可用的最大 tokens 選項 */
const TOKEN_OPTS = [512, 1024, 2048] as const;

/**
 * 將 AI 原始輸出「脫水」成可安全顯示的文字
 */
const sanitize = (raw: string): string => {
	let txt = raw
		// 1) 先拔掉完整 <assistant>/<think> 標籤
		.replace(/<\/?(assistant|think)[^>]*>/gi, "")
		// 2) 若仍殘留「收尾標籤 + 雜訊」，只保留最後真正的內容
		.replace(/(?:<\/assistant>|<\/think>).*/gi, "")
		// 3) 去頭去尾多餘全半形空白與標點
		.replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "")
		// 4) 把多重空白壓成一格
		.replace(/\s{2,}/g, " ");

	return txt.trim();
};

/**
 * 產生提醒並推送 Telegram——已啟用 JSON Mode
 */
export const sendTGWithAi = async (ai: Ai, botToken: string, chatId: number, reminder: string, zone: string = TAIPEI_TZ) => {
	/* ---------- 1. 時間字串 ---------- */
	const now = new Date();
	const time12 = now.toLocaleString("zh-TW", {
		timeZone: zone,
		hour12: true,
		hour: "2-digit",
		minute: "2-digit",
	});

	/* ---------- 2. 系統與使用者訊息 ---------- */
	const messages = [
		{
			role: "system",
			content: "你是一個正式的中文角色扮演機器人，只能輸出 JSON 內的 reply 欄位文字，" + "不得出現任何 <assistant>、<think> 或額外標籤。",
		},
		{
			role: "user",
			content: ["請扮演「口頭禪是『為你好』的亞洲父母」，成就至上、紀律嚴明。", "規則：1.僅用繁體中文；2.全型標點+0–3個表情符號；", "3.內容需同時包含『時間』與『提醒文字』；4.時間採中文 12 小時制。", `時間：${time12}`, `提醒的文字：${reminder}`].join("\n"),
		},
	];

	/* ---------- 3. JSON Mode Schema ---------- */
	const schema = {
		type: "object",
		properties: {
			reply: { type: "string", description: "最終要送出的提醒訊息" },
		},
		required: ["reply"],
		additionalProperties: false,
	};

	/* ---------- 4. 呼叫 Workers AI（JSON Mode） ---------- */
	let cleanReply = "AI 錯誤，請確認原因修復。";
	try {
		const resp = await ai.run(LLM_ID, {
			messages,
			response_format: { type: "json_schema", json_schema: schema },
			max_tokens: TOKEN_OPTS[Math.floor(Math.random() * TOKEN_OPTS.length)],
		});

		console.log("AI Response:", resp); // Debug: Log the AI response

		// Workers AI 回傳內容在 choices[0].message.content (字串狀 JSON)
		const payload =
			typeof resp.response === "string"
				? JSON.parse(resp.response) // 有時 model 會把 JSON 當字串回傳
				: resp.response; // 大部分情況已是物件

		const reply = payload.reply; // ← schema 裡定義的欄位

		/* ---------- 5. 雙重保險清洗 ---------- */
		cleanReply = sanitize(reply);
	} catch (e) {
		console.error("AI Error:", e);
		// cleanReply 添加錯誤原因
		cleanReply = `AI 錯誤，請確認原因：${e.message} 記得修復喔。`;
	}

	/* ---------- 6. 發送 Telegram ---------- */
	return sendTG(botToken, chatId, cleanReply);
};
