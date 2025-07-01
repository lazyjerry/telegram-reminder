import * as chrono from "chrono-node";
import type { Ai } from "@cloudflare/ai"; // 2024-05+ 型別檔
import { LLM_TID } from "../ai-config";

type Parsed = { hour?: string; content?: string };

/**
 * 先用 chrono 嘗試；失敗則呼叫 Workers AI
 * @param ai  Workers AI 物件 (env.AI)
 * @param text 使用者輸入
 * @param zone 時區
 */
export const parseReminder = async (
	ai: Ai, // ★ 新增
	text: string,
	zone = "Asia/Taipei"
): Promise<Parsed> => {
	/* ---------- 1) 先試 chrono-node ---------- */
	const hit = chrono.zh.parse(text, { forwardDate: true })[0];
	if (hit) {
		const utc = hit.date();
		const tzHour = new Date(utc.getTime() + (Intl.DateTimeFormat(undefined, { timeZone: zone }).resolvedOptions().timeZone === zone ? 0 : 8 * 3600 * 1000)).getHours();

		const hour = String(tzHour).padStart(2, "0");
		const content = text.slice(hit.index! + hit.text.length).trim() || "提醒！";
		return { hour, content };
	}

	/* ---------- 2) fallback：Workers AI LLM ---------- */
	const prompt = '你是一個文字解析的工具，不需要多作回應，只要直接輸出的 JSON String，欄位: "hour" = 00–23 兩位數或 * ，"content" = 去除時間後剩餘提醒文字\n\n' + "請解析以下文字，並回傳 JSON 格式的字串，包含兩個欄位：\n" + text;
	// Debug: Log the prompt being sent to the AI
	console.log("AI Prompt:", prompt);
	const resp: { response: string } = await ai.run(LLM_TID, { prompt, max_tokens: 512 });

	try {
		console.log("AI Response:", resp.response); // Debug: Log the AI response
		// 嘗試解析 AI 回應 移除 ```json 和 ``` 之間的部分 整理換行等讓他更容易被解析
		resp.response = resp.response.replace(/```json\s*([\s\S]*?)```/g, "$1").trim();
		resp.response = resp.response.replace(/`\s*([\s\S]*?)`/g, "$1").trim();
		// 移除換行
		resp.response = resp.response.replace(/\n/g, "").trim();
		console.log("Parsed AI Response bef:", resp.response); // Debug: Log the parsed response
		const { hour, content } = JSON.parse(resp.response);
		console.log("Parsed AI Response:", { hour, content }); // Debug: Log the parsed response
		if (hour && content) return { hour, content };
	} catch (_) {
		// fallthrough
		console.log("AI Response error:", _.message); // Debug: Log the AI response
	}

	return {};
};
