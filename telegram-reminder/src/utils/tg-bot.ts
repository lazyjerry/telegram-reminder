import type { Ai } from "@cloudflare/ai"; // 2024-05+ 型別檔
import { LLM_ID } from "../ai-config";

export const sendTG = (token: string, id: number, text: string) =>
	fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ chat_id: id, text }),
	});

export const sendTGWithAi = async (ai: Ai, token: string, id: number, text: string, zone = "Asia/Taipei") => {
	// 透過 zone 取得當前時區的日期與時間 MM/DD HH:mm
	const now = new Date();
	const taipeiHour12 = now.toLocaleString("zh-TW", { timeZone: zone, hour12: true, hour: "2-digit" });
	// Debug: Log the current time in Taipei
	console.log("Current Taipei Time:", taipeiHour12);

	const prompt = "你是一個扮演老媽的角色，以下會提供一段包含目前的時間和要提醒的文字，請用一個很囉唆的老媽口吻提醒接下來要作的事情。請僅使用繁體中文、全型標點符號與適當的表情符號組成。\n\n" + `現在時間是 ${taipeiHour12}、提醒的文字：\n\n` + text;

	const resp: { response: string } = await ai.run(LLM_ID, {
		prompt: `${prompt}`,
		max_tokens: 512,
	});

	// Debug: Log the AI response
	console.log("AI Response:", resp.response);
	return await sendTG(token, id, `${resp.response}`);

	return null;
};
