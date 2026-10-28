// ==============================================================================
// وحدة حساب الوصول التقديري الحقيقي (Real ETA Calculator)
// تعتمد المسافة بالهافرسين ومعامل الطرق 1.4 وسرعة 25 كم/س دون أي طلبات Mapbox
// ==============================================================================

/**
 * حساب المسافة بالهافرسين بين إحداثيتين بالكيلومتر
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371; // نصف قطر الأرض بالكيلومتر
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * حساب زمن الوصول بالدقائق وفق معادلة النظام المعتمدة:
 * المسافة بالهافرسين × معامل طرق 1.4 / سرعة مدينة 25 كم/ساعة (+ دقيقة واحدة)
 * الحد الأدنى: 2 دقيقة، مع التقريب للأعلى (Math.ceil)
 */
export function calculateEtaMinutes(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const distanceKm = haversineDistanceKm(lat1, lon1, lat2, lon2);
  const roadDistanceKm = distanceKm * 1.4;
  const travelMinutes = (roadDistanceKm / 25) * 60;
  const totalMinutes = travelMinutes + 1;
  const t = Math.max(2, Math.ceil(totalMinutes));
  return t;
}

/**
 * صياغة النص المعروض للنطاق التقديري: «t - (t+2) دقائق»
 * مثال: «3 - 5 دقائق»
 */
export function formatEtaRange(t: number): string {
  return `${t} - ${t + 2} دقائق`;
}
