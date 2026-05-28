#!/usr/bin/env bash
# Auto upload secrets — fix: dùng temp file cho value + echo "n" cho prompt apphosting.yaml.

PROJECT="green-pool-system"
ENV_FILE="$HOME/Desktop/GreenPool_ERP/.env.local"
SA_FILE="$HOME/Desktop/GreenPool_ERP/secrets/firebase-admin-sa.json"

echo "═══════════════════════════════════════════════════════"
echo "🚀 Firebase Auto Deploy — Green Pool ERP"
echo "═══════════════════════════════════════════════════════"
echo ""

[ ! -f "$ENV_FILE" ] && { echo "❌ Không thấy $ENV_FILE"; exit 1; }
[ ! -f "$SA_FILE" ] && { echo "❌ Không thấy $SA_FILE"; exit 1; }
echo "✓ Files OK"
echo ""

get_env_val() {
  grep "^${1}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-
}

upload_secret() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "  ⊝ $name: trống — bỏ qua"
    return 0
  fi
  echo -n "  → $name … "
  # Fix: ghi value ra temp file, pipe "n" vào stdin để trả lời prompt "Add to apphosting.yaml?"
  local tmpfile
  tmpfile=$(mktemp)
  printf '%s' "$value" > "$tmpfile"
  echo "n" | firebase apphosting:secrets:set "$name" \
    --project "$PROJECT" --data-file "$tmpfile" --force > /tmp/fb_secret.log 2>&1
  local status=$?
  rm -f "$tmpfile"
  if [ $status -eq 0 ]; then
    echo "✓"
  else
    # Có khả năng secret đã được create thành công nhưng exit code != 0 vì prompt phụ
    if grep -q "Created secret" /tmp/fb_secret.log 2>/dev/null; then
      echo "✓ (đã tạo, bỏ qua prompt phụ)"
    else
      echo "✗ — chi tiết:"
      tail -5 /tmp/fb_secret.log | sed 's/^/      /'
    fi
  fi
}

echo "📤 Upload secrets…"
echo ""

upload_secret "NEXT_PUBLIC_FIREBASE_API_KEY"             "$(get_env_val NEXT_PUBLIC_FIREBASE_API_KEY)"
upload_secret "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"         "$(get_env_val NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)"
upload_secret "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"      "$(get_env_val NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)"
upload_secret "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID" "$(get_env_val NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID)"
upload_secret "NEXT_PUBLIC_FIREBASE_APP_ID"              "$(get_env_val NEXT_PUBLIC_FIREBASE_APP_ID)"

# FIREBASE_PRIVATE_KEY chứa \n — extract qua python để giữ nguyên format
PK=$(python3 -c "import json; print(json.load(open('$SA_FILE'))['private_key'], end='')")
upload_secret "FIREBASE_PRIVATE_KEY" "$PK"

upload_secret "GEMINI_API_KEY"    "$(get_env_val GEMINI_API_KEY)"
upload_secret "ANTHROPIC_API_KEY" "$(get_env_val ANTHROPIC_API_KEY)"
upload_secret "GROQ_API_KEY"      "$(get_env_val GROQ_API_KEY)"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "Verify list secrets qua gcloud:"
gcloud secrets list --project "$PROJECT" 2>/dev/null | head -15 || \
  echo "  (gcloud chưa cài — anh xem qua Console: https://console.cloud.google.com/security/secret-manager?project=$PROJECT)"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Tiếp theo (browser):"
echo "  https://console.firebase.google.com/project/$PROJECT/apphosting"
