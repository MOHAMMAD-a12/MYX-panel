#!/usr/bin/env bash
# Deploy خودکار MYX panel فقط با CLOUDFLARE_API_TOKEN
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?Set the CLOUDFLARE_API_TOKEN repository secret.}"
WORKER_NAME="${WORKER_NAME:-myx-panel}"
API="https://api.cloudflare.com/client/v4"
AUTH=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")

if ! [[ "$WORKER_NAME" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "Invalid worker name. Use lowercase letters, numbers and hyphens." >&2
  exit 1
fi

check_response() {
  local label="$1" response="$2"
  if ! jq -e '.success == true' >/dev/null 2>&1 <<<"$response"; then
    echo "Cloudflare API error during $label:" >&2
    jq '.errors // .' >&2 <<<"$response" || echo "$response" >&2
    exit 1
  fi
}

MYX_UUID="$(cat /proc/sys/kernel/random/uuid)"
export MYX_UUID
node scripts/build-standalone.mjs

printf '\n[1/4] Detecting Cloudflare account...\n'
ACCOUNTS="$(curl -sS "${AUTH[@]}" "$API/accounts")"
check_response "account detection" "$ACCOUNTS"
ACCOUNT_ID="$(jq -r '.result[0].id // empty' <<<"$ACCOUNTS")"
if [[ -z "$ACCOUNT_ID" ]]; then
  echo "No Cloudflare account is accessible by this token." >&2
  exit 1
fi
echo "Account detected: $ACCOUNT_ID"

printf '\n[2/4] Preparing workers.dev subdomain...\n'
SUBDOMAIN_RESPONSE="$(curl -sS "${AUTH[@]}" "$API/accounts/$ACCOUNT_ID/workers/subdomain")"
SUBDOMAIN="$(jq -r '.result.subdomain // empty' <<<"$SUBDOMAIN_RESPONSE")"
if [[ -z "$SUBDOMAIN" ]]; then
  SUBDOMAIN="myx-panel-${RANDOM}${RANDOM}"
  CREATED="$(curl -sS -X PUT "${AUTH[@]}" -H 'Content-Type: application/json' \
    --data "{\"subdomain\":\"$SUBDOMAIN\"}" "$API/accounts/$ACCOUNT_ID/workers/subdomain")"
  check_response "subdomain creation" "$CREATED"
fi
echo "Workers subdomain: $SUBDOMAIN"

printf '\n[3/4] Uploading MYX panel worker...\n'
METADATA="$(jq -nc --arg uuid "$MYX_UUID" '{
  main_module: "myx-panel.js",
  compatibility_date: "2025-06-01",
  bindings: [{ type: "plain_text", name: "UUID", text: $uuid }]
}')"
UPLOAD="$(curl -sS -X PUT "${AUTH[@]}" \
  --form "metadata=${METADATA};type=application/json" \
  --form "myx-panel.js=@.build/myx-panel.js;type=application/javascript+module" \
  "$API/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME")"
check_response "worker upload" "$UPLOAD"

printf '\n[4/4] Enabling workers.dev URL...\n'
ENABLED="$(curl -sS -X POST "${AUTH[@]}" -H 'Content-Type: application/json' \
  --data '{"enabled":true}' "$API/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME/subdomain")"
check_response "workers.dev activation" "$ENABLED"

PANEL_URL="https://${WORKER_NAME}.${SUBDOMAIN}.workers.dev"
cat <<EOF

✅ MYX panel deployed successfully!

Panel:        $PANEL_URL
Subscription: $PANEL_URL/sub
Connection:   $PANEL_URL/info

EOF

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## ✅ MYX panel is ready"
    echo
    echo "- **Panel:** [$PANEL_URL]($PANEL_URL)"
    echo "- **Subscription:** \`$PANEL_URL/sub\`"
    echo "- **Worker:** \`$WORKER_NAME\`"
    echo "- Open the panel and use the **☁️ Cloudflare Worker** preset."
  } >> "$GITHUB_STEP_SUMMARY"
fi
