// 需要支援 JSON Mode 的 LLM ID https://developers.cloudflare.com/workers-ai/features/json-mode/
// 注意：llama-3.2-*-vision 為受限模型（gated），需同意授權且禁止 EU 使用，會回傳 5016
// 注意：llama-3.1-8b-instruct 已於 2026-05-30 下架（5028），改用 3.3 現役模型
// 注意：llama-3.1-8b-instruct-fast / llama-3.1-70b-instruct 文件雖列為支援 JSON Mode，
//       實測 response_format=json_schema 會回 "Grammar error: Invalid type: json_schema"（8007/400），
//       屬 Cloudflare 文件謊報。但純文字（不帶 response_format）生成正常，故可用於 LLM_REPLY。
//       詳見 cloudflare-docs issue #27786

// 角色扮演回覆：純文字輸出、不走 JSON Mode，可用未支援 JSON Mode 的快速小模型
export const LLM_REPLY = "@cf/meta/llama-3.1-8b-instruct-fast";
// 網址摘要使用（需 JSON Mode 多欄位輸出）
export const LLM_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
// 解析提醒使用（需 JSON Mode 多欄位輸出）
export const LLM_TID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
