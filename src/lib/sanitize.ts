// وحدة تنقية وتأمين المدخلات (Input Sanitization)
// لحماية واجهات البحث والتطبيق من ثغرات الحقن (XSS, Injection)

/**
 * تنقية استعلامات البحث الجغرافي وحقول البحث
 * تزيل الوسوم وأكواد السكربت ومحاولات الحقن مع الحفاظ على الأحرف العربية والإنجليزية والأرقام
 */
export function sanitizeSearchQuery(query: unknown, maxLength = 100): string {
  if (typeof query !== 'string') return '';
  
  return query
    // إزالة رموز التحكم غير المرئية ومحارف Null
    .replace(/[\u0000-\u001F\u007F]/g, '')
    // إزالة وسوم الـ HTML والأكواد الخبيثة
    .replace(/<[^>]*>/g, '')
    // إزالة علامات الاقتباس والأقواس البرمجية المسببة للحقن
    .replace(/[<>'";\\{}`$]/g, '')
    // تقليم المسافات الزائدة
    .trim()
    // حصر الطول الأقصى
    .slice(0, maxLength);
}

/**
 * تنقية النصوص العامة (الملاحظات، الرسائل، الأسماء)
 */
export function sanitizeGeneralText(text: unknown, maxLength = 500): string {
  if (typeof text !== 'string') return '';

  return text
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, maxLength);
}
