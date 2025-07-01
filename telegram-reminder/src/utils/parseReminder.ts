import * as chrono from "chrono-node";
import type { Ai } from "@cloudflare/ai";
import { LLM_TID } from "../ai-config";

type Parsed = { hour?: string; content?: string };

/**
 * 以 chrono 解析自然語言時間；如果有時間則繼續呼叫 Workers AI (JSON Mode)
 * - 「早上 9 點提醒我開會」→ { hour: "09", content: "要開會" }
 * - 「每小時 記得要喝水」     → { hour: "*",  content: "記得要喝水" }
 */
export const parseReminder = async (ai: Ai, text: string, zone = "Asia/Taipei"): Promise<Parsed> => {
	/* ---------- 1) 先試 chrono-node ---------- */

	const hit = chrono.zh.parse(text, { forwardDate: true })[0];
	if (!hit) {
		// 解析失敗，回傳空物件
		return {};
	}

	/* ---------- 2) fallback：Workers AI (JSON Mode) ---------- */
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
	try {
		const resp = await ai.run(LLM_TID, {
			messages,
			response_format: { type: "json_schema", json_schema: schema },
			max_tokens: 256,
		});

		// Workers AI 在 JSON Mode 下，回傳物件或字串皆有可能
		const payload = typeof resp.response === "string" ? JSON.parse(resp.response) : resp.response;

		const { hour, content } = payload as Parsed;
		if (hour && content) return { hour, content };
	} catch (error) {
		// 可以根據需要記錄錯誤
	}

	// 若仍解析失敗，回傳空物件，交由上層決定後續行為
	return {};
};
