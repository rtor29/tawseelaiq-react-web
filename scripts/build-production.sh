#!/usr/bin/env bash
# ==============================================================================
# سكربت بناء ونشر واجهة توصيله - بيئة الإنتاج (Production Web Build & Deploy)
# المسار: scripts/build-production.sh
# يبني بلا أي مفاتيح staging إلى مجلد dist المستقل
# وينسخه حصراً إلى /var/www/tawseela-web
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

OUT_DIR="dist"
TARGET_DIR="/var/www/tawseela-web"
SSH_TARGET="${DEPLOY_SERVER:-root@173.212.206.86}"

# ضمان أمني قاطع: منع استهداف مسار staging تحت أي ظرف
if [ "${TARGET_DIR}" = "/var/www/tawseela-web-staging" ]; then
    echo "❌ خطأ فادح: ممنوع استهداف مسار Staging في سكربت Production!"
    exit 1
fi

echo "======================================================"
echo "  بدء بناء واجهة الإنتاج (Tawseela Web - Production)"
echo "  المجلد المستقل: ${OUT_DIR}"
echo "  الهدف المنشور: ${TARGET_DIR}"
echo "======================================================"

# 1. تنظيف مجلد البناء المستقل
rm -rf "${OUT_DIR}"

# 2. التأكد التام من عدم تفعيل أي مفاتيح staging
unset VITE_GENDER_FILTER
export NODE_ENV="production"

# 3. فحص الأنواع وبناء الحزم إلى مجلد dist المستقل
echo ">>> [1/3] فحص الأنواع وبناء حزم الإنتاج..."
npx tsc -b
npx vite build --outDir "${OUT_DIR}"

# 4. التحقق الصارم من مخرجات البناء وعدم تسرب gender-btn-female
echo ">>> [2/3] فحص سلامة أصول الإنتاج المنشأة..."
if [ ! -f "${OUT_DIR}/index.html" ]; then
    echo "❌ خطأ فادح: ملف index.html غير موجود في ${OUT_DIR}!"
    exit 1
fi

if grep -rq "gender-btn-female" "${OUT_DIR}/assets/"; then
    echo "❌ خطأ فادح: تم رصد gender-btn-female في بناء الإنتاج! إيقاف النشر."
    exit 1
fi
echo "✓ تم التحقق: بناء الإنتاج سليم وخالٍ من ميزات Staging التجريبية."

# 5. النشر الحصري إلى /var/www/tawseela-web
echo ">>> [3/3] نشر أصول ${OUT_DIR} إلى ${TARGET_DIR}..."
if [ "$(uname)" = "Linux" ] && [ -d "${TARGET_DIR}" ]; then
    rsync -avz --delete "${OUT_DIR}/" "${TARGET_DIR}/"
    if id www-data >/dev/null 2>&1; then
        chown -R www-data:www-data "${TARGET_DIR}" || true
    fi
else
    rsync -avz --delete "${OUT_DIR}/" "${SSH_TARGET}:${TARGET_DIR}/"
fi

echo "======================================================"
echo "✓ تم بناء ونشر واجهة الإنتاج بنجاح إلى ${TARGET_DIR}!"
echo "======================================================"
