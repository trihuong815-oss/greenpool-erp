#!/usr/bin/env bash
# Grant App Hosting backend access tới các secrets đã upload.
# Cần chạy 1 lần sau khi backend được tạo.

PROJECT="green-pool-system"
BACKEND="greenpool-erp"

echo "🔐 Grant access secrets cho backend: $BACKEND"
echo ""

for secret in \
  NEXT_PUBLIC_FIREBASE_API_KEY \
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
  NEXT_PUBLIC_FIREBASE_APP_ID \
  FIREBASE_PRIVATE_KEY \
  GEMINI_API_KEY
do
  echo -n "  → $secret … "
  firebase apphosting:secrets:grantaccess "$secret" \
    --backend "$BACKEND" \
    --project "$PROJECT" > /tmp/fb_grant.log 2>&1
  if [ $? -eq 0 ]; then
    echo "✓"
  else
    if grep -q "already" /tmp/fb_grant.log; then
      echo "✓ (đã có quyền)"
    else
      echo "✗"
      tail -3 /tmp/fb_grant.log | sed 's/^/      /'
    fi
  fi
done

echo ""
echo "✅ Xong. Trigger rebuild bằng cách push commit mới hoặc rollout lại:"
echo ""
echo "  Cách 1 — push commit rỗng:"
echo "    cd ~/Desktop/GreenPool_ERP"
echo "    git commit --allow-empty -m 'Trigger rebuild after secret grant'"
echo "    git push origin main"
echo ""
echo "  Cách 2 — qua Firebase Console:"
echo "    https://console.firebase.google.com/project/$PROJECT/apphosting/$BACKEND/rollouts"
echo "    → bấm nút 'Create rollout' hoặc 'Retry'"
