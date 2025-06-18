import * as chrono from "chrono-node";

export const parseReminder = (text: string, zone = "Asia/Taipei") => {
	const hit = chrono.zh.parse(text, { forwardDate: true })[0];
	if (!hit) return {};

	// 轉台灣時間後取小時
	const utc = hit.date();
	const tzHour = new Date(
		utc.getTime() + (Intl.DateTimeFormat(undefined, { timeZone: zone }).resolvedOptions().timeZone === zone ? 0 : 8 * 3600 * 1000) // 台北 +08
	).getHours();

	const hour = String(tzHour).padStart(2, "0");
	const content = text.slice(hit.index! + hit.text.length).trim() || "提醒！";
	return { hour, content };
};
