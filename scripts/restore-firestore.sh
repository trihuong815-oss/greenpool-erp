#!/usr/bin/env bash
# Restore Firestore từ backup. CỰC kỳ cẩn thận — sẽ ghi đè dữ liệu hiện tại.
#
# Usage:
#   bash scripts/restore-firestore.sh                      # liệt kê các backup
#   bash scripts/restore-firestore.sh <tag>                # restore từ tag cụ thể
#   bash scripts/restore-firestore.sh <tag> <collection>   # chỉ restore 1 collection

PROJECT="green-pool-system"
BUCKET="gs://green-pool-system.firebasestorage.app/firestore-backups"

# Liệt kê backups nếu không truyền tag
if [ -z "$1" ]; then
  echo "═══════════════════════════════════════════════════════"
  echo "📂 Các backup hiện có (gần nhất ở dưới):"
  echo "═══════════════════════════════════════════════════════"
  gsutil ls "${BUCKET}/" 2>/dev/null | sort
  echo ""
  echo "Restore: bash $0 <tag>"
  echo "VD: bash $0 2026-05-28_080000"
  exit 0
fi

TAG="$1"
COLLECTION="$2"
SOURCE="${BUCKET}/${TAG}"

echo "═══════════════════════════════════════════════════════"
echo "⚠️  RESTORE Firestore — sẽ GHI ĐÈ dữ liệu hiện tại"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Source: $SOURCE"
if [ -n "$COLLECTION" ]; then
  echo "Collection: $COLLECTION (chỉ restore collection này)"
else
  echo "Collection: TẤT CẢ (toàn bộ Firestore)"
fi
echo ""

# Verify source tồn tại
if ! gsutil ls "${SOURCE}/" > /dev/null 2>&1; then
  echo "❌ Không thấy backup tại ${SOURCE}/"
  echo ""
  echo "Liệt kê backup hiện có: bash $0"
  exit 1
fi

# Confirm
echo "⚠️ Dữ liệu hiện tại của các collection bị restore sẽ bị THAY THẾ."
echo "Bạn có chắc? Gõ 'YES' (in hoa) để tiếp tục:"
read -r CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Đã hủy."
  exit 0
fi

# Khuyến nghị backup trước khi restore
echo ""
echo "→ Backup hiện tại trước (an toàn nếu restore sai)…"
NOW_TAG="pre-restore-$(date +%Y-%m-%d_%H%M%S)"
gcloud firestore export "${BUCKET}/${NOW_TAG}" --project "$PROJECT" 2>&1 | tail -3

# Run restore
echo ""
echo "→ Bắt đầu restore…"
if [ -n "$COLLECTION" ]; then
  gcloud firestore import "$SOURCE" --collection-ids="$COLLECTION" --project "$PROJECT"
else
  gcloud firestore import "$SOURCE" --project "$PROJECT"
fi

echo ""
echo "✓ Restore job đã start (chạy nền). Theo dõi:"
echo "  https://console.cloud.google.com/firestore/databases/-default-/import-export?project=${PROJECT}"
