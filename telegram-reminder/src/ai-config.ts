// 需要支援 JSON Mode 的 LLM ID https://developers.cloudflare.com/workers-ai/features/json-mode/
// export const LLM_ID = "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"; // 排程回覆使用
export const LLM_ID = "@cf/meta/llama-3.1-8b-instruct"; // 排程回覆使用
export const LLM_TID = "@cf/meta/llama-3.1-8b-instruct"; // 解析提醒使用
// export const LLM_TID = "@cf/meta/llama-3.2-3b-instruct"; // 只改這裡即可
