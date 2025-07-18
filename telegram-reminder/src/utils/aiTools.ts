import type { Ai } from "@cloudflare/ai";
import { LLM_ID, LLM_TID } from "../ai-config";

const sanitize = (raw: string): string => {
	let txt = raw
		.replace(/<\/?(assistant|think)[^>]*>/gi, "")
		.replace(/(?:<\/assistant>|<\/think>).*/gi, "")
		.replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "")
		.replace(/\s{2,}/g, " ");
	return txt.trim();
};

export type Parsed = { hour?: string; content?: string };

export const aiTools = {
	parseReminder,
	callAi,
	sendTGWithAi,
};

/**
 * 發送 Telegram 訊息，並使用 AI 生成提醒內容
 * @param ai - Cloudflare Workers AI 實例
 * @param reminder - 用戶輸入的提醒內容
 * @param time12 - 當前時間的 12 小時制格式（例如 "上午 10:30"）
 * @returns 清理過的 AI 回覆內容
 *
 */
async function sendTGWithAi(ai: Ai, reminder: string, time12: string): Promise<string> {
	console.log("[sendTGWithAi] 開始，reminder:", reminder, "time12:", time12);
	const promptLines = ["請扮演一位亞洲父母，角色設定如下：", "- 嚴厲、講求紀律，對時間與規矩非常敏感", "- 成就至上，視孩子的未來為己任", "- 語氣關切但強硬，經常以「你知道的，這是為你好！」或是「你要懂得感恩」等類似的情緒勒索語義作結", "- 偏好用命令式語氣給出提醒與指示", "- 偶爾會加上一兩句過去的辛酸歷程，強化正當性", "規則：1.僅用繁體中文；2.使用全型標點符號；3.每句可附加 0–3 個表情符號，但不能破壞嚴肅口吻；", "4.回應內容需同時包含『時間』與『提醒文字』；5.時間請使用中文 12 小時制（例如：下午三點、早上七點）；", `時間：${time12}`, `提醒的文字：${reminder}`];
	const messages = [
		{
			role: "system",
			content: "你是一個正式的中文角色扮演機器人，只能輸出 JSON 內的 reply 欄位文字，" + "不得出現任何 <assistant>、<think> 或額外標籤。",
		},
		{
			role: "user",
			content: promptLines.join("\n"),
		},
	];

	const schema = {
		type: "object",
		properties: {
			reply: { type: "string", description: "最終要送出的提醒訊息" },
		},
		required: ["reply"],
		additionalProperties: false,
	};

	/** AI 隨機可用的最大 tokens 選項 */
	const TOKEN_OPTS = [512, 1024, 2048] as const;
	let cleanReply = "AI 錯誤，請確認原因修復。";
	try {
		console.log("[sendTGWithAi] 呼叫 callAi");
		const payload = await callAi(ai, LLM_ID, messages, { type: "json_schema", json_schema: schema }, TOKEN_OPTS[Math.floor(Math.random() * TOKEN_OPTS.length)]);
		console.log("[sendTGWithAi] callAi 回傳:", payload);

		const reply = payload.reply;

		cleanReply = sanitize(reply);
		console.log("[sendTGWithAi] 清理後 reply:", cleanReply);
	} catch (e) {
		console.error("AI Error:", e);
		cleanReply = `AI 錯誤，請確認原因：${e.message} 記得修復喔。`;
	}
	console.log("[sendTGWithAi] 結束，回傳:", cleanReply);
	return cleanReply;
}

/**
 * 解析提醒指令，並回傳物件 { hour: "00–23 或 *", content: "提醒內容" }
 */
async function parseReminder(ai: Ai, text: string): Promise<string> {
	console.log("[parseReminder] 開始，text:", text);
	const messages = [
		{
			role: "system",
			content: "你是一個文字解析工具，只能輸出 JSON 物件，不得帶其他文字或標籤。",
		},
		{
			role: "user",
			content: ["需求：讀取一句繁體中文的「提醒指令」。", '輸出 JSON 物件，格式：{ "hour": "00–23 或 *", "content": "提醒內容" }。', '如果文字包含「每小時」請回 "hour": "*"，否則回解析到的 24 小時制兩位數時。', "提醒內容請分辨語意，將指令中「需要被提醒的內容」擷取出來。", "用戶交代給你一段需要被提醒的時間與內容，請擷取出時間和需要被提醒的內容", `指令：${text}`].join("\n"),
		},
	];

	const schema = {
		type: "object",
		properties: {
			hour: {
				type: "string",
				description: "24 小時制兩位數 (00–23) 或 * 表示每小時",
			},
			content: { type: "string", description: "去除時間後的提醒文字" },
		},
		required: ["hour", "content"],
		additionalProperties: false,
	};
	console.log("[parseReminder] 呼叫 callAi");
	const payload = await callAi(ai, LLM_TID, messages, schema, 256);
	console.log("[parseReminder] callAi 回傳:", payload);
	return payload;
}

/** 呼叫 Workers‑AI，若回傳非 JSON 或發生錯誤最多重試 3 次。
 *  若最終仍失敗，將所有錯誤訊息串成一段文字後 throw 出去。
 */
async function callAi(ai: Ai, modelId: string, messages: any, schema: any, max_tokens: number): Promise<any> {
	const MAX_RETRY = 3;
	const errs: string[] = [];

	for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
		try {
			console.log(`[callAi] (${attempt}/${MAX_RETRY}) model=${modelId}`);
			const resp = await ai.run(modelId, {
				messages,
				response_format: { type: "json_schema", json_schema: schema },
				max_tokens,
			});

			const payload = typeof resp.response === "string" ? JSON.parse(resp.response) : resp.response;

			if (payload && typeof payload === "object") return payload; // 成功
			throw new Error("無效 JSON 內容");
		} catch (err: any) {
			const msg = err?.message ?? String(err);
			errs.push(`(${attempt}) ${msg}`);
			console.error(`[callAi] Error attempt ${attempt}:`, msg);

			if (attempt < MAX_RETRY) {
				// 短暫等待再重試
				await new Promise((r) => setTimeout(r, 100));
			}
		}
	}

	// 三次仍失敗，合併錯誤訊息
	const errorText = ["AI 回傳失敗，錯誤列表：", ...errs].join("\n");
	throw new Error(errorText);
}
