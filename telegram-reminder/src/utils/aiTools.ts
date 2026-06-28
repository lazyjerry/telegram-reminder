import type { Ai } from "@cloudflare/ai";
import { LLM } from "../ai-config";

const sanitize = (raw: string): string => {
	let txt = raw
		.replace(/<\/?(assistant|think)[^>]*>/gi, "")
		.replace(/(?:<\/assistant>|<\/think>).*/gi, "")
		.replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "")
		.replace(/\s{2,}/g, " ");
	return txt.trim();
};

export type Parsed = { hour?: string; content?: string };

export type UrlSummary = {
	websiteName: string;
	websiteType: string;
	summary: string;
};

export const aiTools = {
	extractContent,
	callAi,
	sendTGWithAi,
	fetchAndSummarizeUrl,
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
			content: "你是一個正式的中文角色扮演機器人，直接輸出要送出的提醒訊息文字（純文字，不要 JSON），" + "不得出現任何 <assistant>、<think> 或額外標籤。",
		},
		{
			role: "user",
			content: promptLines.join("\n"),
		},
	];

	/** AI 隨機可用的最大 tokens 選項 */
	const TOKEN_OPTS = [512, 1024, 2048] as const;
	let cleanReply = "AI 錯誤，請確認原因修復。";
	try {
		console.log("[sendTGWithAi] 呼叫 callAi（純文字模式）");
		const reply = await callAi(ai, LLM, messages, TOKEN_OPTS[Math.floor(Math.random() * TOKEN_OPTS.length)]);
		console.log("[sendTGWithAi] callAi 回傳:", reply);

		cleanReply = sanitize(reply);
		console.log("[sendTGWithAi] 清理後 reply:", cleanReply);

		// 防止靜默失敗：AI 回傳空白時 Telegram 會拒收空訊息，改送 fallback
		if (!cleanReply) {
			console.warn("[sendTGWithAi] AI 回傳空白，改用 fallback。reply:", reply);
			cleanReply = `⏰ ${time12} 提醒：${reminder}`;
		}
	} catch (e) {
		console.error("AI Error:", e);
		cleanReply = `AI 錯誤，請確認原因：${e.message} 記得修復喔。`;
	}
	console.log("[sendTGWithAi] 結束，回傳:", cleanReply);
	return cleanReply;
}

/**
 * 從提醒指令擷取「要被提醒的內容」（去除時間詞），回傳純文字。
 * 時間由呼叫端的 chrono 解析，不在此處理。
 */
async function extractContent(ai: Ai, text: string): Promise<string> {
	console.log("[extractContent] 開始，text:", text);
	const content = await askText(
		ai,
		"你是一個文字解析工具，只輸出「要被提醒的事情」這段純文字，去掉時間詞，不要任何解釋、引號或標籤。",
		["從這句提醒指令中擷取「要被提醒的內容」（去除時間詞，只留事情本身）：", `指令：${text}`].join("\n"),
		128
	);
	console.log("[extractContent] 回傳:", content);
	return content;
}

/** 純文字呼叫 Workers‑AI，最多重試 3 次；trim 後非空即成功。
 *  三次仍失敗則把所有錯誤訊息串成一段文字後 throw 出去。
 */
async function callAi(ai: Ai, modelId: string, messages: any, max_tokens: number): Promise<string> {
	const MAX_RETRY = 3;
	const errs: string[] = [];

	for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
		try {
			console.log(`[callAi] (${attempt}/${MAX_RETRY}) model=${modelId}`);
			const resp = await ai.run(modelId, { messages, max_tokens });

			let rawResponse = typeof resp.response === "string" ? resp.response : JSON.stringify(resp.response);
			console.log(`[callAi] Raw response:`, rawResponse.substring(0, 200));

			const text = rawResponse.trim();
			if (text) return text; // 成功
			throw new Error("空白文字回應");
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

/** 單值純文字呼叫：包 callAi + sanitize，供多欄位拆成多次呼叫重用 */
async function askText(ai: Ai, system: string, user: string, max_tokens: number): Promise<string> {
	const messages = [
		{ role: "system", content: system },
		{ role: "user", content: user },
	];
	return sanitize(await callAi(ai, LLM, messages, max_tokens));
}

/** 從 HTML 抽取 meta 描述與 JSON-LD 文字。
 *  SPA（Threads / IG / X 等）的伺服器 HTML 不含正文，可用內文常只藏在這些 meta 標籤裡。
 */
function extractMetaText(html: string): string {
	const parts: string[] = [];
	const decode = (s: string) =>
		s
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#0?39;/g, "'")
			.replace(/&#x27;/gi, "'");

	// og:description / twitter:description / 一般 description；屬性順序兩種寫法都接
	const metaPropFirst = /<meta[^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["'][^>]*content=["']([^"']*)["']/gi;
	const metaContentFirst = /<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["'](?:og:description|twitter:description|description)["']/gi;
	let m: RegExpExecArray | null;
	while ((m = metaPropFirst.exec(html))) if (m[1].trim()) parts.push(decode(m[1].trim()));
	while ((m = metaContentFirst.exec(html))) if (m[1].trim()) parts.push(decode(m[1].trim()));

	// JSON-LD 內的 articleBody / description / text / headline
	const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	while ((m = ldRe.exec(html))) {
		try {
			const collect = (o: any) => {
				if (!o || typeof o !== "object") return;
				for (const k of ["articleBody", "description", "text", "headline"]) {
					if (typeof o[k] === "string" && o[k].trim()) parts.push(o[k].trim());
				}
				for (const v of Object.values(o)) if (v && typeof v === "object") collect(v);
			};
			collect(JSON.parse(m[1].trim()));
		} catch {
			/* JSON-LD 格式不正確就略過 */
		}
	}

	return [...new Set(parts)].join("\n").trim();
}

/**
 * 抓取網頁內容並生成繁體中文摘要
 * @param ai - Cloudflare Workers AI 實例
 * @param url - 要抓取的網址
 * @returns 包含網站名稱、類型和摘要的物件
 */
async function fetchAndSummarizeUrl(ai: Ai, url: string): Promise<UrlSummary> {
	console.log("[fetchAndSummarizeUrl] 開始抓取網址:", url);

	let pageContent = "";
	let pageTitle = "";
	let metaDesc = "";
	let fetchFailed = false;

	try {
		// 抓取網頁內容
		const response = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; TelegramBot/1.0)",
				"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const html = await response.text();
		console.log("[fetchAndSummarizeUrl] 成功抓取網頁，長度:", html.length);

		// 提取標題
		const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
		pageTitle = titleMatch ? titleMatch[1].trim() : "";

		// 先抽 meta / JSON-LD（SPA 正文常只藏在這裡，需在砍 script 前取）
		metaDesc = extractMetaText(html);

		// 移除 script、style 等標籤，提取純文字
		pageContent = html
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
			.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
			.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
			.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
			.replace(/<!--[\s\S]*?-->/g, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/\s+/g, " ")
			.trim();

		// 限制內容長度：輸入過長會增加 JSON Mode 約束生成的失敗率（5024），4000 字足夠摘要
		if (pageContent.length > 4000) {
			pageContent = pageContent.substring(0, 4000) + "...";
		}

		console.log("[fetchAndSummarizeUrl] 提取標題:", pageTitle);
		console.log("[fetchAndSummarizeUrl] 提取內容長度:", pageContent.length);
	} catch (error: any) {
		console.error("[fetchAndSummarizeUrl] 抓取網頁失敗:", error.message);
		fetchFailed = true;
		pageContent = "";
	}

	// meta 描述通常比正文乾淨，放前面；兩者擇優併成有效內容
	const effectiveContent = [metaDesc, pageContent].filter(Boolean).join("\n").trim();

	// 守衛：抓取失敗、或有效內容過短/等於標題（SPA 只回 boilerplate）時，
	// 直接回報無法取得，不呼叫摘要 AI——既省 token，也擋掉空輸入幻覺（捏造情節）。
	const normalized = effectiveContent.replace(/\s/g, "");
	const contentTooThin = fetchFailed || normalized.length < 40 || normalized === (pageTitle || "").replace(/\s/g, "");

	if (contentTooThin) {
		console.warn("[fetchAndSummarizeUrl] 內容不足，跳過摘要 AI。fetchFailed:", fetchFailed, "有效長度:", normalized.length);
		return {
			websiteName: pageTitle || "未知網站",
			websiteType: "未知類型",
			summary: "無法取得網頁內容。此頁面可能需要登入，或內容由前端 JavaScript 動態載入，無法直接擷取文字。",
		};
	}

	// 使用 AI 生成摘要
	// 三欄位拆成 3 次純文字呼叫並行；各自帶 fallback，部分失敗不影響其他欄位
	const pageCtx = [`網址：${url}`, `網頁標題：${pageTitle || "無法取得"}`, `網頁內容：${effectiveContent}`].join("\n");

	const [websiteName, websiteType, summary] = await Promise.all([
		askText(ai, "你是網頁分析工具，只輸出網站名稱這幾個字，不要任何解釋或標點。", `根據以下資訊推斷網站名稱：\n${pageCtx}`, 64).catch((e: any) => {
			console.error("[fetchAndSummarizeUrl] 網站名稱失敗:", e?.message ?? e);
			return pageTitle || "未知網站";
		}),
		askText(ai, "你是網頁分析工具，只輸出一個網站類型詞（例如：新聞網站、部落格、電商網站、SaaS平台、論壇、政府機關、企業官網、教育平台、工具網站、社群網站），不要其他文字。", `判斷以下網頁的類型：\n${pageCtx}`, 32).catch((e: any) => {
			console.error("[fetchAndSummarizeUrl] 網站屬性失敗:", e?.message ?? e);
			return "未知類型";
		}),
		askText(
			ai,
			"你是專業的網頁內容分析工具。嚴格規則：1.只能根據實際提供的網頁內容撰寫，嚴禁臆測、推論或虛構任何未出現在內容中的情節、人物、場景或評論；2.只輸出一段約 250-300 字的繁體中文摘要純文字，不要標題、不要條列、不要 JSON；3.若提供的內容不足以判斷，直接輸出「網頁內容不足，無法生成摘要」，禁止編造。",
			`為以下網頁內容寫摘要：\n${pageCtx}`,
			1024
		).catch((e: any) => {
			console.error("[fetchAndSummarizeUrl] 摘要失敗:", e?.message ?? e);
			return `無法生成摘要：${e?.message ?? e}`;
		}),
	]);

	console.log("[fetchAndSummarizeUrl] 三欄位:", { websiteName, websiteType, summary });
	return { websiteName, websiteType, summary };
}
