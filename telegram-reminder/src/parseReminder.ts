import * as chrono from "chrono-node";
import { aiTools, Parsed } from "./utils/aiTools";

/**
 * 以 chrono 解析自然語言時間；如果有時間則繼續呼叫 Workers AI (JSON Mode)
 * - 「早上 9 點提醒我開會」→ { hour: "09", content: "要開會" }
 * - 「每小時 記得要喝水」     → { hour: "*",  content: "記得要喝水" }
 */
export const parseReminder = async (ai: Ai, text: string): Promise<Parsed> => {
	console.log("[parseReminder] Received text:", text);

	// forwardDate 須放第三參數（options）；放第二參數會被當 reference 而失效
	const hit = chrono.zh.parse(text, undefined, { forwardDate: true })[0];
	console.log("[parseReminder] Chrono parse result:", hit);

	if (!hit) {
		console.log("[parseReminder] Chrono failed to parse, returning empty object.");
		return {};
	}

	// 時間取自 chrono；無小時則視為無法排程
	const h = hit.start.get("hour");
	if (h == null) {
		console.log("[parseReminder] Chrono 未解析到小時，returning empty object.");
		return {};
	}
	const hour = String(h).padStart(2, "0");

	try {
		const content = await aiTools.extractContent(ai, text);
		if (hour && content) {
			console.log("[parseReminder] Parsed:", { hour, content });
			return { hour, content };
		}
	} catch (error) {
		console.log("[parseReminder] Error in extractContent:", error);
	}

	console.log("[parseReminder] Failed to parse reminder, returning empty object.");
	return {};
};
