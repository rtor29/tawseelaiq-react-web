# تعليمات بناء ونشر الواجهة (Deployment Guide)

- **بيئة الاختبار (Staging):** لتحديث ونشر واجهة staging مع مفاتيح الميزات التجريبية نفّذ `npm run build-staging` (المخرج: `dist-staging` -> `/var/www/tawseela-web-staging`).
- **بيئة الإنتاج (Production):** لنشر واجهة الإنتاج القياسية المعتمدة نفّذ `npm run build-production` (المخرج: `dist` -> `/var/www/tawseela-web`).

## سياسة التراجع المعتمدة (Rollback Policy)
ممنوع منعاً باتاً استعمال `git reset --hard` أو `git push --force` أو نسخ واجهة الإنتاج إلى staging أو العكس.
الصيغة الوحيدة المسموحة للتراجع:
1. في المستودع المحلي: `git revert <commit>`
2. رفع التراجع: `git push origin main`
3. إعادة البناء والنشر بالسكربت المخصص للبيئة:
   - لـ Staging: `npm run build-staging`
   - للإنتاج: `npm run build-production`

