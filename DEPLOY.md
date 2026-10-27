# تعليمات بناء ونشر الواجهة (Deployment Guide)

- **بيئة الاختبار (Staging):** لتحديث ونشر واجهة staging مع مفاتيح الميزات التجريبية نفّذ `npm run build-staging` (المخرج: `dist-staging` -> `/var/www/tawseela-web-staging`).
- **بيئة الإنتاج (Production):** لنشر واجهة الإنتاج القياسية المعتمدة نفّذ `npm run build-production` (المخرج: `dist` -> `/var/www/tawseela-web`).
