// قائمة محافظات العراق الـ 18 الرسمية مع مراكزها الجغرافية وخوارزمية الكشف الذكي

export interface Governorate {
  id: string;
  name: string;
  sub: string;
  lat: number;
  lng: number;
}

export const IRAQ_GOVERNORATES: Governorate[] = [
  { id: 'baghdad', name: 'بغداد', sub: 'العاصمة بغداد', lat: 33.3152, lng: 44.3661 },
  { id: 'najaf', name: 'النجف الأشرف', sub: 'محافظة النجف الأشرف', lat: 31.9961, lng: 44.3168 },
  { id: 'basra', name: 'البصرة', sub: 'محافظة البصرة', lat: 30.5081, lng: 47.7835 },
  { id: 'erbil', name: 'أربيل', sub: 'محافظة أربيل', lat: 36.1911, lng: 44.0092 },
  { id: 'nineveh', name: 'نينوى (الموصل)', sub: 'محافظة نينوى', lat: 36.3489, lng: 43.1577 },
  { id: 'karbala', name: 'كربلاء المقدسة', sub: 'محافظة كربلاء المقدسة', lat: 32.6160, lng: 44.0249 },
  { id: 'babil', name: 'بابل (الحلة)', sub: 'محافظة بابل', lat: 32.4833, lng: 44.4333 },
  { id: 'sulaymaniyah', name: 'السليمانية', sub: 'محافظة السليمانية', lat: 35.5669, lng: 45.4226 },
  { id: 'kirkuk', name: 'كركوك', sub: 'محافظة كركوك', lat: 35.4681, lng: 44.3922 },
  { id: 'anbar', name: 'الأنبار (الرمادي)', sub: 'محافظة الأنبار', lat: 33.4244, lng: 43.3039 },
  { id: 'diyala', name: 'ديالى (بعقوبة)', sub: 'محافظة ديالى', lat: 33.7464, lng: 44.6433 },
  { id: 'dhiqar', name: 'ذي قار (الناصرية)', sub: 'محافظة ذي قار', lat: 31.0579, lng: 46.2573 },
  { id: 'wasit', name: 'واسط (الكوت)', sub: 'محافظة واسط', lat: 32.5089, lng: 45.8197 },
  { id: 'maysan', name: 'ميسان (العمارة)', sub: 'محافظة ميسان', lat: 31.8447, lng: 47.1444 },
  { id: 'qadisiyah', name: 'القادسية (الديوانية)', sub: 'محافظة القادسية', lat: 31.9922, lng: 44.9250 },
  { id: 'muthanna', name: 'المثنى (السماوة)', sub: 'محافظة المثنى', lat: 31.3167, lng: 45.2833 },
  { id: 'saladin', name: 'صلاح الدين (تكريت)', sub: 'محافظة صلاح الدين', lat: 34.6000, lng: 43.6833 },
  { id: 'duhok', name: 'دهوك', sub: 'محافظة دهوك', lat: 36.8679, lng: 42.9984 },
];

/**
 * كشف المحافظة تلقائياً بناءً على اسم المنطقة الراجع من Geocoding العكسي أو الإحداثيات الهندسية
 */
export function detectGovernorate(lat: number, lng: number, addressText?: string): Governorate {
  if (addressText) {
    const text = addressText.toLowerCase();
    for (const gov of IRAQ_GOVERNORATES) {
      const pureName = gov.name
        .split('(')[0]
        .replace('محافظة', '')
        .replace('المقدسة', '')
        .replace('الأشرف', '')
        .trim();
      if (text.includes(pureName.toLowerCase())) {
        return gov;
      }
    }
  }

  // في حال تعذر المطابقة بالاسم، نحدد أقرب مركز محافظة بالمسافة الإقليدية
  let closestGov = IRAQ_GOVERNORATES[0];
  let minDistance = Infinity;

  for (const gov of IRAQ_GOVERNORATES) {
    const dLat = gov.lat - lat;
    const dLng = gov.lng - lng;
    const distSq = dLat * dLat + dLng * dLng;
    if (distSq < minDistance) {
      minDistance = distSq;
      closestGov = gov;
    }
  }

  return closestGov;
}
