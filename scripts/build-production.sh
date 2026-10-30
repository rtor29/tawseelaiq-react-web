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

# ------------------------------------------------------------------------------
# سحب آخر نسخة من GitHub عند تمرير --pull (للبناء على الخادم بيد Antigravity)
# بلا reset --hard وبلا force: يتوقف إن كانت الشجرة غير نظيفة أو تعذّر التقديم السريع
# ------------------------------------------------------------------------------
if [ "${1:-}" = "--pull" ]; then
    echo ">>> [0/3] سحب آخر نسخة من origin/main..."
    if ! git diff --quiet || ! git diff --cached --quiet; then
        echo "❌ خطأ فادح: شجرة العمل غير نظيفة. تم إلغاء البناء."
        git status --porcelain --untracked-files=no
        exit 1
    fi
    if ! git fetch origin main; then
        echo "❌ خطأ فادح: فشل سحب التحديثات من GitHub. تم إلغاء البناء."
        exit 1
    fi
    if ! git merge --ff-only origin/main; then
        echo "❌ خطأ فادح: تعذّر التقديم السريع إلى origin/main. تم إلغاء البناء."
        exit 1
    fi
    if [ -z "${TAWSEELA_BUILD_REEXEC:-}" ]; then
        if ! npm ci --no-audit --no-fund; then
            echo "❌ خطأ فادح: فشل تثبيت الحزم. تم إلغاء البناء."
            exit 1
        fi
    fi

    # bash يقرأ السكربت وهو يُنفَّذ، والسحب غيّر هذا الملف نفسه للتوّ. فما بقي من
    # أسطر يُقرأ من النسخة القديمة: كود جديد بمفاتيح قديمة، وهو خطأ صامت لا يظهر
    # في أي فحص. فنعيد تشغيل النسخة الجديدة، مرة واحدة بحارس، وبلا --pull.
    if [ -z "${TAWSEELA_BUILD_REEXEC:-}" ]; then
        echo ">>> أُعيد التشغيل بالنسخة المسحوبة من السكربت..."
        export TAWSEELA_BUILD_REEXEC=1
        # الرايات تُمرَّر كما هي: بدونها تتخطّى التمريرة الثانية كتلة --pull كلها،
        # ومعها تبديل الفرع، فيُبنى الفرع الخطأ ويبدو كل شيء ناجحاً.
        exec bash "$0" "$@"
    fi
fi

echo "COMMIT_BEING_BUILT=$(git rev-parse --short HEAD)"

# 1. تنظيف مجلد البناء المستقل
rm -rf "${OUT_DIR}"

# 2. تفعيل مفاتيح فلتر الجنس والصفحة الموحدة لبيئة الإنتاج
export VITE_GENDER_FILTER="true"
export VITE_UNIFIED_HOME="true"
# شاشة البحث V2 على خدمة الأماكن المفتوحة. تتطلب PLACES_SEARCH_ENABLED=true وجدول places في قاعدة الإنتاج.
export VITE_SEARCH_V2="true"
export NODE_ENV="production"

# تُطبع لتظهر في تقرير النشر: مفاتيح البناء الفعلية، لا المتوقعة
echo "BUILD_FLAGS: MAP_ENGINE=${VITE_MAP_ENGINE:-mapbox} SEARCH_V2=${VITE_SEARCH_V2:-unset} NAV_DEMO=${VITE_NAV_DEMO:-unset}"

# 3. فحص الأنواع وبناء الحزم إلى مجلد dist المستقل
echo ">>> [1/3] فحص الأنواع وبناء حزم الإنتاج..."
npx tsc -b
npx vite build --outDir "${OUT_DIR}"

# 4. التحقق الصارم من مخرجات البناء ووجود gender-btn-female ومعرف اللوحة الموحدة
echo ">>> [2/3] فحص سلامة أصول الإنتاج المنشأة..."
if [ ! -f "${OUT_DIR}/index.html" ]; then
    echo "❌ خطأ فادح: ملف index.html غير موجود في ${OUT_DIR}!"
    exit 1
fi

if ! grep -rq "gender-btn-female" "${OUT_DIR}/assets/"; then
    echo "❌ خطأ فادح: لم يتم العثور على gender-btn-female داخل ${OUT_DIR}/assets/!"
    exit 1
fi
echo "✓ تم التحقق: gender-btn-female متوفر في بناء الإنتاج."

if ! grep -rq "unified-panel-open-card" "${OUT_DIR}/assets/"; then
    echo "❌ خطأ فادح: لم يتم العثور على معرّف اللوحة الموحدة (unified-panel-open-card) داخل ${OUT_DIR}/assets/!"
    exit 1
fi
echo "✓ تم التحقق: معرّف اللوحة الموحدة (unified-panel-open-card) متوفر في بناء الإنتاج."

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
