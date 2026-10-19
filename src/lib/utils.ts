/**
 * أدوات مساعدة عامة لتطبيق توصيلة (Tawseela IQ)
 */

/**
 * تحويل الأرقام العربية والمشرقية والفارسية إلى أرقام إنجليزية معيارية
 */
export const normalizeArabicDigits = (input: string): string => {
  if (!input) return '';
  return input
    .replace(/[٠-٩]/g, (char) => (char.charCodeAt(0) - 1632).toString())
    .replace(/[۰-۹]/g, (char) => (char.charCodeAt(0) - 1776).toString());
};
