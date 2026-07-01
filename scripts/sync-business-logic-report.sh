#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_report="${repo_root}/docs/knowledge-skill/業務邏輯分析與流程圖-001/report.md"
target_report="${repo_root}/BUSINESS_LOGIC.md"
readme="${repo_root}/README.md"
readme_link='> 完整業務邏輯與 Mermaid 流程圖：[`BUSINESS_LOGIC.md`](./BUSINESS_LOGIC.md)'

cp "${source_report}" "${target_report}"

if ! grep -Fqx "${readme_link}" "${readme}"; then
  tmp_file="$(mktemp)"
  trap 'rm -f "${tmp_file}"' EXIT

  awk -v link="${readme_link}" '
    !inserted && $0 == "⸻" {
      print link
      print ""
      inserted = 1
    }
    { print }
    END {
      if (!inserted) {
        exit 1
      }
    }
  ' "${readme}" > "${tmp_file}"

  mv "${tmp_file}" "${readme}"
  trap - EXIT
fi
