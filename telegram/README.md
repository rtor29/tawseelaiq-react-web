# Telegram Bot — توصيلة IQ

## الملف: `telegramBot.js`
نسخة كاملة من البوت الموجود على السيرفر.

## المتغيرات المطلوبة
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
ADMIN_CHAT_ID=391762837
WEB_APP_URL=https://tawseelaiq.app
```

## الميزات الموجودة
- ✅ تسجيل الدخول بـ OTP (WhatsApp)
- ✅ تسجيل ركاب وسائقين
- ✅ طلب مشوار قصير بالموقع
- ✅ **الخطوط الدائمية** — يفتح WebApp داخل تيليغرام
- ✅ **حجز مقعد atomic** (`db.executeAtomicBooking`)
- ✅ إشعار السائق عند الحجز
- ✅ حماية Anti-spam + Rate limiting
- ✅ دعم 18 محافظة عراقية

## التكامل مع React Web App
عند النقر على زر **"فتح خريطة الخطوط الدائمية"** في البوت:
```
web_app: { url: 'https://tawseelaiq.app/?role=Customer&tripType=daily' }
```
هذا يفتح صفحة `DailyPage.tsx` داخل Telegram WebApp.

## التشغيل
```bash
# على السيرفر (مضمّن في server.js الحالي)
# لا تغيير مطلوب — البوت يعمل مع DB الموجودة

# للاختبار المحلي
TELEGRAM_BOT_TOKEN=xxx node telegramBot.js
```

## Webhook Setup
```bash
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -d "url=https://tawseelaiq.app/api/telegram/webhook"
```

## التوافق مع الـ React Web App
| ميزة | Bot | Web App |
|------|-----|---------|
| تسجيل دخول OTP | ✅ | ✅ `/login` |
| مشوار قصير | ✅ | ✅ `/map` |
| خطوط دائمية | ✅ WebApp | ✅ `/daily` |
| حجز مقعد | ✅ `book_<id>` callback | ✅ Modal |
| atomic booking | ✅ `db.executeAtomicBooking` | ✅ `POST /api/bookings/atomic-book` |
| لوحة السائق | ✅ `/myroutes` | ✅ `/driver` |
| إدارة | ✅ Admin chat | ✅ `/admin` |

## ما يحتاج Codex إكماله
1. **ربط WebApp بـ React**: عند فتح `https://tawseelaiq.app` داخل تيليغرام، تقرأ `window.Telegram.WebApp.initDataUnsafe` للحصول على `user.id`
2. **إضافة Webhook endpoint** في `server.js`:
   ```js
   if (req.url === '/api/telegram/webhook' && req.method === 'POST') {
     const bot = require('./modules/telegram/telegramBot');
     bot.processUpdate(body);
   }
   ```
3. **إشعارات Real-time**: عند حجز من الويب → إشعار للسائق عبر البوت
