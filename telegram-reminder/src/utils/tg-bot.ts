import type { Ai } from "@cloudflare/ai"; // 2024-05+ 型別檔
import { aiTools } from "./aiTools";

export const sendTG = (token: string, id: number, text: string) => {
	console.log(`[sendTG] Sending message to chat_id: ${id}`);
	return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ chat_id: id, text }),
	});
};

/**
 * 產生提醒並推送 Telegram——已啟用 JSON Mode
 */
export const sendTGWithAi = async (ai: Ai, botToken: string, chatId: number, reminder: string, zone: string) => {
	console.log(`[sendTGWithAi] Preparing to send reminder: "${reminder}" to chat_id: ${chatId} in zone: ${zone}`);
	/* ---------- 時間字串 ---------- */
	const now = new Date();
	const time12 = now.toLocaleString("zh-TW", {
		timeZone: zone,
		hour12: true,
		hour: "2-digit",
		minute: "2-digit",
	});
	console.log(`[sendTGWithAi] Current time (12hr): ${time12}`);

	let cleanReply = await aiTools.sendTGWithAi(ai, reminder, time12);
	console.log(`[sendTGWithAi] AI generated reply: "${cleanReply}"`);
	/* ---------- 發送 Telegram ---------- */
	const result = await sendTG(botToken, chatId, cleanReply);
	console.log(`[sendTGWithAi] Message sent to Telegram`);
	return result;
};
