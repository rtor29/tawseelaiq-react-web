#!/usr/bin/env bash
# ==============================================================================
# سكربت النشر الآلي لتطبيق توصيله (Tawseela Web Production Deployment Script)
# ==============================================================================
set -e

# ألوان المخرجات في الطرفية
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}    بدء عملية نشر تطبيق توصيله ويب إلى الإنتاج    ${NC}"
echo -e "${BLUE}======================================================${NC}"

# 1. التحقق من مسار المشروع
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 2. بناء ملفات الإنتاج المحدثة
echo -e "\n${YELLOW}[1/5] جاري بناء نسخة الإنتاج النهائية (npm run build)...${NC}"
npm run build

if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo -e "${RED}خطأ: فشل توليد مجلد dist أو ملف index.html غير موجود!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ تم بناء ملفات الإنتاج بنجاح.${NC}"

# 3. إعداد مسار الهدف على خادم الويب
TARGET_DIR="/var/www/tawseela-web"
NGINX_CONF_SRC="$SCRIPT_DIR/nginx/tawseela-vps.conf"
NGINX_CONF_DEST="/etc/nginx/sites-available/tawseela-web"

# تحديد ما إذا كان السكربت يعمل مباشرة على السيرفر (Linux) أو محلياً
if [ "$(uname)" = "Linux" ] && [ -d "/etc/nginx" ]; then
    echo -e "\n${YELLOW}[2/5] تم الكشف عن بيئة الخادم (Linux / Nginx)...${NC}"

    # إنشاء المجلد إذا لم يكن موجوداً
    echo -e "${BLUE}إنشاء مجلد النشر $TARGET_DIR...${NC}"
    sudo mkdir -p "$TARGET_DIR"

    # نسخ ملفات dist مع الحذف للملفات القديمة غير المستخدمة
    echo -e "${BLUE}مزامنة ملفات dist إلى $TARGET_DIR...${NC}"
    sudo cp -r dist/* "$TARGET_DIR/"

    # ضبط الصلاحيات المناسبة لخادم الويب Nginx
    echo -e "${BLUE}ضبط صلاحيات المستخدم www-data...${NC}"
    sudo chown -R www-data:www-data "$TARGET_DIR"
    sudo chmod -R 755 "$TARGET_DIR"

    # 4. تثبيت ملف إعداد Nginx وتفعيله
    echo -e "\n${YELLOW}[3/5] تحديث إعدادات Nginx...${NC}"
    if [ -f "$NGINX_CONF_SRC" ]; then
        sudo cp "$NGINX_CONF_SRC" "$NGINX_CONF_DEST"
        if [ ! -f "/etc/nginx/sites-enabled/tawseela-web" ]; then
            sudo ln -s "$NGINX_CONF_DEST" /etc/nginx/sites-enabled/
        fi
    fi

    # 5. اختبار صحة ملفات تكوين Nginx
    echo -e "\n${YELLOW}[4/5] اختبار ملفات تكوين Nginx (nginx -t)...${NC}"
    sudo nginx -t

    # 6. إعادة تحميل خادم Nginx بدون أي انقطاع في الخدمة (Zero-Downtime Reload)
    echo -e "\n${YELLOW}[5/5] إعادة تحميل خادم Nginx...${NC}"
    sudo systemctl reload nginx
    echo -e "${GREEN}✓ تم إعادة تحميل Nginx بنجاح.${NC}"

    echo -e "\n${GREEN}======================================================${NC}"
    echo -e "${GREEN}   تهانينا! تم نشر تطبيق توصيله بنجاح وهو يعمل الآن  ${NC}"
    echo -e "${GREEN}   الرابط: https://tawseelaiq.app                      ${NC}"
    echo -e "${GREEN}======================================================${NC}"

else
    # بيئة محلية (مثل macOS) - عرض خيارات الرفع عن بعد
    echo -e "\n${YELLOW}[2/3] تم الكشف عن بيئة تطوير محلية ($(uname)).${NC}"
    echo -e "${BLUE}يمكنك رفع مجلد dist مباشرة إلى خادمك عبر الأمر التالي:${NC}"
    echo -e "\n${GREEN}rsync -avz --delete dist/ root@YOUR_SERVER_IP:/var/www/tawseela-web/${NC}"
    echo -e "${GREEN}scp nginx/tawseela-vps.conf root@YOUR_SERVER_IP:/etc/nginx/sites-available/tawseela-web${NC}"
    echo -e "${GREEN}ssh root@YOUR_SERVER_IP 'sudo nginx -t && sudo systemctl reload nginx'${NC}\n"

    echo -e "${GREEN}✓ ملفات dist جاهزة ومحدثة بالكامل للنشر في المسار: $SCRIPT_DIR/dist${NC}"
fi
