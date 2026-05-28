#!/usr/bin/env bash
# Backup Firestore thủ công vào Cloud Storage.
# Dùng trước khi: migration data, script destructive, deploy lớn.
#
# Usage: bash scripts/backup-firestore.sh [tag]
#   tag: optional, vd. "before-migration-X". Default = timestamp.

PROJECT="green-pool-system"
BUCKET="gs://green-pool-system.firebasestorage.app/firestore-backups"
TAG="${1:-$(date +%Y-%m-%d_%H%M%S)}"

echo "═══════════════════════════════════════════════════════"
echo "💾 Backup Firestore → ${BUCKET}/${TAG}"
echo "═══════════════════════════════════════════════════════"

# Check gcloud
if ! command -v gcloud &> /dev/null; then
  echo ""
  echo "❌ Chưa có gcloud CLI. Cài bằng:"
  echo "   brew install --cask google-cloud-sdk"
  echo "   gcloud auth login"
  echo "   gcloud config set project ${PROJECT}"
  exit 1
fi

# Set project
gcloud config set project "$PROJECT" 2>/dev/null

# Start export (async — Google sẽ chạy nền)
echo ""
echo "→ Đang gọi Firestore export…"
OUTPUT=$(gcloud firestore export "${BUCKET}/${TAG}" --project "$PROJECT" 2>&1)
STATUS=$?

if [ $STATUS -eq 0 ]; then
  echo "✓ Export job đã start. Google đang backup nền (~1-5 phút tuỳ size data)."
  echo ""
  echo "Theo dõi tại:"
  echo "  https://console.cloud.google.com/firestore/databases/-default-/import-export?project=${PROJECT}"
  echo ""
  echo "Khi xong, data nằm trong:"
  echo "  ${BUCKET}/${TAG}/"
  echo ""
  echo "Liệt kê backups đã có:"
  echo "  gsutil ls ${BUCKET}/"
else
  echo "✗ Lỗi: $OUTPUT"
  exit 1
fi
