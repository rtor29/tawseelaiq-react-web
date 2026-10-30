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

# ------------------------------------------------------------------------------
# سحب آخر نسخة من GitHub عند تمرير --pull (للبناء على الخادم بيد Antigravity)
# بلا reset --hard وبلا force: يتوقف إن كانت الشجرة غير نظيفة أو تعذّر التقديم السريع
# ------------------------------------------------------------------------------
# الفرع الذي تبني منه staging. الإنتاج يبني من main دائماً، وstaging قد يبني من
# فرع ميزة كي تُجرَّب وحدها بلا أن تدخل أي نشرة إنتاج. مثال:
#   STAGING_BRANCH=nav-demo bash scripts/build-staging.sh --pull
STAGING_BRANCH="${STAGING_BRANCH:-main}"

if [ "${1:-}" = "--pull" ]; then
    echo ">>> [0/3] سحب آخر نسخة من origin/${STAGING_BRANCH}..."
    if ! git diff --quiet || ! git diff --cached --quiet; then
        echo "❌ خطأ فادح: شجرة العمل غير نظيفة. تم إلغاء البناء."
        git status --porcelain --untracked-files=no
        exit 1
    fi
    if ! git fetch origin "${STAGING_BRANCH}"; then
        echo "❌ خطأ فادح: فشل سحب التحديثات من GitHub. تم إلغاء البناء."
        exit 1
    fi
    # الانتقال إلى الفرع المطلوب إن لم نكن عليه، بلا reset ولا force
    CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    if [ "$CURRENT_BRANCH" != "${STAGING_BRANCH}" ]; then
        if git show-ref --verify --quiet "refs/heads/${STAGING_BRANCH}"; then
            git checkout "${STAGING_BRANCH}" || { echo "❌ تعذّر الانتقال إلى ${STAGING_BRANCH}."; exit 1; }
        else
            git checkout -b "${STAGING_BRANCH}" "origin/${STAGING_BRANCH}" || { echo "❌ تعذّر إنشاء ${STAGING_BRANCH}."; exit 1; }
        fi
    fi
    if ! git merge --ff-only "origin/${STAGING_BRANCH}"; then
        echo "❌ خطأ فادح: تعذّر التقديم السريع إلى origin/${STAGING_BRANCH}. تم إلغاء البناء."
        exit 1
    fi
    if ! npm ci --no-audit --no-fund; then
        echo "❌ خطأ فادح: فشل تثبيت الحزم. تم إلغاء البناء."
        exit 1
    fi

    # bash يقرأ السكربت وهو يُنفَّذ، والسحب غيّر هذا الملف نفسه للتوّ. فما بقي من
    # أسطر يُقرأ من النسخة القديمة: كود جديد بمفاتيح قديمة، وهو خطأ صامت لا يظهر
    # في أي فحص. فنعيد تشغيل النسخة الجديدة، مرة واحدة بحارس، وبلا --pull.
    if [ -z "${TAWSEELA_BUILD_REEXEC:-}" ]; then
        echo ">>> أُعيد التشغيل بالنسخة المسحوبة من السكربت..."
        export TAWSEELA_BUILD_REEXEC=1
        exec bash "$0"
    fi
fi

echo "COMMIT_BEING_BUILT=$(git rev-parse --short HEAD)"
echo "BUILD_BRANCH=$(git rev-parse --abbrev-ref HEAD)"

# 1. تنظيف مجلد البناء المستقل
rm -rf "${OUT_DIR}"

# 2. تعيين متغيرات البيئة الخاصة بـ Staging وتفعيل فلتر الجنس والصفحة الموحدة ومحرك الخرائط maplibre
export VITE_GENDER_FILTER="true"
export VITE_UNIFIED_HOME="true"
export VITE_MAP_ENGINE="maplibre"
export VITE_SEARCH_V2="true"
export VITE_NAV_DEMO="true"
export VITE_MAP_STYLE="https://tiles.openfreemap.org/styles/liberty"
export VITE_NAVIGATION_STYLE="https://tiles.openfreemap.org/styles/liberty"
export NODE_ENV="production"

# تُطبع لتظهر في تقرير النشر: مفاتيح البناء الفعلية، لا المتوقعة
echo "BUILD_FLAGS: MAP_ENGINE=${VITE_MAP_ENGINE:-mapbox} SEARCH_V2=${VITE_SEARCH_V2:-unset} NAV_DEMO=${VITE_NAV_DEMO:-unset}"

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

if ! grep -rq "Overture Maps Foundation" "${OUT_DIR}/assets/"; then
    echo "❌ خطأ فادح: شاشة البحث V2 أو إشارة مصادر الأماكن غير موجودة في ${OUT_DIR}/assets/!"
    exit 1
fi
echo "✓ تم التحقق: شاشة البحث V2 وإشارة المصادر موجودتان في أصول ${OUT_DIR}."

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
