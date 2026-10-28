#!/usr/bin/env bash
# ==============================================================================
# سكربت بناء ونشر واجهة توصيله - بيئة الاختبار (Staging Web Build & Deploy)
# المسار: scripts/build-staging.sh
# يبني بـ VITE_GENDER_FILTER=true إلى مجلد dist-staging المستقل
# وينسخه حصراً إلى /var/www/tawseela-web-staging
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

OUT_DIR="dist-staging"
TARGET_DIR="/var/www/tawseela-web-staging"
SSH_TARGET="${DEPLOY_SERVER:-root@173.212.206.86}"

# ضمان أمني قاطع: منع استهداف مسار الإنتاج تحت أي ظرف
if [ "${TARGET_DIR}" = "/var/www/tawseela-web" ]; then
    echo "❌ خطأ فادح: ممنوع استهداف مسار الإنتاج في سكربت Staging!"
    exit 1
fi

echo "======================================================"
echo "  بدء بناء واجهة Staging (Tawseela Web - Staging)"
echo "  المجلد المستقل: ${OUT_DIR}"
echo "  الهدف المنشور: ${TARGET_DIR}"
echo "======================================================"

# 1. تنظيف مجلد البناء المستقل
rm -rf "${OUT_DIR}"

# 2. تعيين متغيرات البيئة الخاصة بـ Staging وتفعيل فلتر الجنس والصفحة الموحدة ومحرك الخرائط maplibre
export VITE_GENDER_FILTER="true"
export VITE_UNIFIED_HOME="true"
export VITE_MAP_ENGINE="maplibre"
export NODE_ENV="production"

# 3. فحص الأنواع وبناء الحزم إلى مجلد dist-staging المستقل
echo ">>> [1/3] فحص الأنواع وبناء حزم Staging..."
npx tsc -b
npx vite build --outDir "${OUT_DIR}"

# 4. التحقق الصارم من مخرجات البناء ووجود gender-btn-female
echo ">>> [2/3] فحص سلامة أصول Staging المنشأة..."
if [ ! -f "${OUT_DIR}/index.html" ]; then
    echo "❌ خطأ فادح: ملف index.html غير موجود في ${OUT_DIR}!"
    exit 1
fi

if ! grep -rq "gender-btn-female" "${OUT_DIR}/assets/"; then
    echo "❌ خطأ فادح: لم يتم العثور على gender-btn-female داخل ${OUT_DIR}/assets/!"
    exit 1
fi
echo "✓ تم التحقق: gender-btn-female موجود داخل أصول ${OUT_DIR}."

# 5. النشر الحصري إلى /var/www/tawseela-web-staging
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
echo "✓ تم بناء ونشر واجهة Staging بنجاح إلى ${TARGET_DIR}!"
echo "======================================================"
