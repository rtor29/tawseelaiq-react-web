// أدوات تنسيق عربية

export function estimatedFareIqd(km: number): number {
  return Math.round(3000 + km * 450);
}

export function formatIqd(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} د.ع`;
}

export function proximityLabel(distanceKm: number): string {
  if (distanceKm <= 0.5) {
    const meters = Math.round(distanceKm * 1000);
    return `قريب جداً بـ 500 متر 🟢 (${meters > 0 ? meters : 350} م)`;
  }
  if (distanceKm <= 3.0) return `قريب من منطقتك 🟢 (${distanceKm.toFixed(1)} كم)`;
  if (distanceKm <= 8.0) return `بعيد 🔴 (${distanceKm.toFixed(1)} كم)`;
  return `بعيد جداً 🟣 (${distanceKm.toFixed(1)} كم)`;
}

export function proximityColor(distanceKm: number): string {
  if (distanceKm <= 3.0) return '#10B981'; // قريب
  if (distanceKm <= 8.0) return '#EF4444'; // بعيد
  return '#8B5CF6'; // بعيد جداً
}

export function coordinatesLabel(lat: number, lon: number): string {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}
