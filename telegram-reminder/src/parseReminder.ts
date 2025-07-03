import * as chrono from "chrono-node";
import { aiTools, Parsed } from "./utils/aiTools";

/**
 * 以 chrono 解析自然語言時間；如果有時間則繼續呼叫 Workers AI (JSON Mode)
 * - 「早上 9 點提醒我開會」→ { hour: "09", content: "要開會" }
 * - 「每小時 記得要喝水」     → { hour: "*",  content: "記得要喝水" }
 */
export const parseReminder = async (ai: Ai, text: string): Promise<Parsed> => {
	console.log("[parseReminder] Received text:", text);

	const hit = chrono.zh.parse(text, { forwardDate: true })[0];
	console.log("[parseReminder] Chrono parse result:", hit);

	if (!hit) {
		console.log("[parseReminder] Chrono failed to parse, returning empty object.");
		return {};
	}

	try {
		const payload = await aiTools.parseReminder(ai, text);
		console.log("[parseReminder] aiTools.parseReminder payload:", payload);

		const { hour, content } = payload as Parsed;
		if (hour && content) {
			console.log("[parseReminder] Successfully parsed hour and content:", { hour, content });
			return { hour, content };
		}
	} catch (error) {
		console.log("[parseReminder] Error in aiTools.parseReminder:", error);
	}

	console.log("[parseReminder] Failed to parse reminder, returning empty object.");
	return {};
};
