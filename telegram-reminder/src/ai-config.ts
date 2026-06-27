// 全面採純文字生成，不再使用 JSON Mode（多欄位需求改拆成多次純文字呼叫）。
// 為何不用 JSON Mode：
//   - llama-3.1-8b-instruct-fast / llama-3.1-70b-instruct 文件雖列為支援，實測 response_format=json_schema
//     會回 "Grammar error: Invalid type: json_schema"（8007/400），屬 Cloudflare 文件謊報。詳見 cloudflare-docs #27786
//   - llama-3.3-70b-instruct-fp8-fast 走 JSON Mode 長輸出時會回 "JSON Mode couldn't be met"（5024）
//   純文字（不帶 response_format）在 8b-fast 上正常、快速，故統一使用。
export const LLM = "@cf/meta/llama-3.1-8b-instruct-fast";
