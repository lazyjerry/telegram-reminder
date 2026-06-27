// 需要支援 JSON Mode 的 LLM ID https://developers.cloudflare.com/workers-ai/features/json-mode/
// 注意：llama-3.2-*-vision 為受限模型（gated），需同意授權且禁止 EU 使用，會回傳 5016
// 注意：llama-3.1-8b-instruct 已於 2026-05-30 下架（5028），改用 3.3 現役模型
export const LLM_ID = "@cf/meta/llama-3.1-8b-instruct-fast"; // 排程回覆使用
export const LLM_TID = "@cf/meta/llama-3.1-8b-instruct-fast"; // 解析提醒使用
