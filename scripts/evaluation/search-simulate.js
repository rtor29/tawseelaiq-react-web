import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. دالة التطبيع اللغوي العربي الصارم
export function normalizeArabic(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    // حذف التشكيل (الحركات) والتنوين
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // حذف التطويل (الكشيدة)
    .replace(/\u0640/g, '')
    // توحيد الألفات (أ، إ، آ ← ا)
    .replace(/[أإآ]/g, 'ا')
    // توحيد التاء المربوطة (ة ← ه)
    .replace(/ة/g, 'ه')
    // توحيد الألف المقصورة والياء (ى ← ي)
    .replace(/ى/g, 'ي')
    // حذف «ال» التعريف من بداية الكلمات
    .replace(/(^|\s)ال([^\s])/g, '$1$2')
    // إزالة علامات الترقيم والأقواس والشرطات
    .replace(/[^\w\s\u0600-\u06FF]/gi, ' ')
    // توحيد المسافات
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// 2. دالة حساب المسافة بالمتر (Haversine Formula)
export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // نصف قطر الأرض بالمتر
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// تحميل نتائج البحث الخام
const resultsPath = path.join(__dirname, 'search-results.json');
if (!fs.existsSync(resultsPath)) {
  console.error('❌ ملف search-results.json غير موجود');
  process.exit(1);
}
const rawResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

// فحص المكررات بين نتيجتين
function isDuplicate(p1, p2) {
  const n1 = normalizeArabic(p1.name);
  const n2 = normalizeArabic(p2.name);
  if (!n1 || !n2) return false;

  const namesMatch = n1 === n2 || n1.includes(n2) || n2.includes(n1);
  if (!namesMatch) return false;

  const dist = getDistanceMeters(p1.lat, p1.lon, p2.lat, p2.lon);
  return dist < 150;
}

function runSimulation() {
  console.log('======================================================');
  console.log('      نتائج محاكاة دمج محركات البحث (Najaf Evaluation)');
  console.log('======================================================\n');

  const detectedDuplicates = [];
  const suspiciousCases = [];
  const perKeywordBreakdown = [];

  // إحصائيات الاستراتيجيات
  let stratA_places = 0; // Mapbox alone
  let stratB_places = 0; // Both always merged
  let stratC3_places = 0; // OSM first, Mapbox if < 3
  let stratC5_places = 0; // OSM first, Mapbox if < 5

  let stratA_mapboxCalls = 0;
  let stratB_mapboxCalls = 0;
  let stratC3_mapboxCalls = 0;
  let stratC5_mapboxCalls = 0;

  for (const [kw, data] of Object.entries(rawResults)) {
    const mbPlaces = data.mapbox?.places || [];
    const ptPlaces = data.photon?.places || [];

    // فحص المكررات بين Mapbox و Photon
    const bothSet = new Set();
    const duplicatesInKw = [];

    for (let m = 0; m < mbPlaces.length; m++) {
      for (let p = 0; p < ptPlaces.length; p++) {
        const p1 = mbPlaces[m];
        const p2 = ptPlaces[p];
        const n1 = normalizeArabic(p1.name);
        const n2 = normalizeArabic(p2.name);
        const dist = getDistanceMeters(p1.lat, p1.lon, p2.lat, p2.lon);

        if (isDuplicate(p1, p2)) {
          bothSet.add(p);
          duplicatesInKw.push({
            kw,
            name1: p1.name,
            name2: p2.name,
            norm1: n1,
            norm2: n2,
            distance: dist,
            source1: 'Mapbox',
            source2: 'Photon',
          });
        } else if ((n1 === n2 || n1.includes(n2) || n2.includes(n1)) && dist >= 150 && dist < 1000) {
          suspiciousCases.push({
            kw,
            name1: p1.name,
            name2: p2.name,
            distance: dist,
            reason: `تطابق في الاسم ولكن المسافة أكبر من 150م (${dist}م)`,
          });
        }
      }
    }

    detectedDuplicates.push(...duplicatesInKw);

    const mbCount = mbPlaces.length;
    const ptCount = ptPlaces.length;
    const bothCount = bothSet.size;
    const mergedUnique = mbCount + (ptCount - bothCount);

    perKeywordBreakdown.push({
      keyword: kw,
      mapbox_alone: mbCount,
      photon_alone: ptCount - bothCount,
      both: bothCount,
      total_merged: mergedUnique,
    });

    // استراتيجية أ: Mapbox وحدها
    stratA_places += mbCount;
    stratA_mapboxCalls += 1;

    // استراتيجية ب: الخدمتان دائماً ثم الدمج
    stratB_places += mergedUnique;
    stratB_mapboxCalls += 1;

    // استراتيجية ج (حد 3): OpenStreetMap أولاً، Mapbox فقط إذا كانت نتائج OSM < 3
    if (ptCount < 3) {
      stratC3_places += mergedUnique;
      stratC3_mapboxCalls += 1;
    } else {
      stratC3_places += ptCount;
    }

    // استراتيجية ج (حد 5): OpenStreetMap أولاً، Mapbox فقط إذا كانت نتائج OSM < 5
    if (ptCount < 5) {
      stratC5_places += mergedUnique;
      stratC5_mapboxCalls += 1;
    } else {
      stratC5_places += ptCount;
    }
  }

  // 1. جدول مساهمة كل خدمة بعد الدمج
  console.log('### 1. جدول مساهمة كل خدمة ومجموع الأماكن بعد الدمج:');
  console.log('| الكلمة | Mapbox وحدها | OpenStreetMap (Photon) وحدها | وجدتاه معاً | المجموع بعد الدمج |');
  console.log('| :--- | :---: | :---: | :---: | :---: |');
  let sumMbAlone = 0, sumPtAlone = 0, sumBoth = 0, sumMerged = 0;
  for (const row of perKeywordBreakdown) {
    console.log(`| **${row.keyword}** | ${row.mapbox_alone} | ${row.photon_alone} | ${row.both} | **${row.total_merged}** |`);
    sumMbAlone += row.mapbox_alone;
    sumPtAlone += row.photon_alone;
    sumBoth += row.both;
    sumMerged += row.total_merged;
  }
  console.log(`| **المجموع الكلي** | **${sumMbAlone}** | **${sumPtAlone}** | **${sumBoth}** | **${sumMerged}** |\n`);

  // 2. أمثلة المكررات المكتشفة
  console.log('### 2. أمثلة المكررات المكتشفة بين المصدرين:');
  console.log(`- إجمالي المكررات المكتشفة: ${detectedDuplicates.length}`);
  if (detectedDuplicates.length > 0) {
    detectedDuplicates.slice(0, 10).forEach((d, i) => {
      console.log(`  [${i + 1}] كلمة «${d.kw}»: [${d.source1}] «${d.name1}» ↔ [${d.source2}] «${d.name2}» (المسافة: ${d.distance}م)`);
    });
  } else {
    console.log('  (نظراً لأن Mapbox لم تعثر إلا على نتيجة واحدة لحي الغدير، فإن بقية الأماكن كانت حصرية لـ OpenStreetMap)');
  }

  console.log(`\n- الحالات المشكوك فيها (تطابق اسم مع مسافة > 150م): ${suspiciousCases.length}`);
  suspiciousCases.slice(0, 5).forEach((s, i) => {
    console.log(`  [${i + 1}] كلمة «${s.kw}»: «${s.name1}» ↔ «${s.name2}» (${s.reason})`);
  });

  // 3. مقارنة الاستراتيجيات الثلاث
  console.log('\n### 3. مقارنة الاستراتيجيات الثلاث على الكلمات الـ 15:');
  console.log('| الاستراتيجية | مجموع الأماكن المفيدة داخل النجف | عدد الكلمات التي احتاجت Mapbox | نسبة تغطية الأماكن بالنسبة للدمج الكامل |');
  console.log('| :--- | :---: | :---: | :---: |');
  console.log(`| **(أ) Mapbox وحدها** | ${stratA_places} | 15 / 15 (100%) | ${(stratA_places / sumMerged * 100).toFixed(1)}% |`);
  console.log(`| **(ب) الخدمتان دائماً ثم الدمج** | ${stratB_places} | 15 / 15 (100%) | 100.0% |`);
  console.log(`| **(ج) OSM أولاً، Mapbox إذا النتائج < 3** | ${stratC3_places} | ${stratC3_mapboxCalls} / 15 (${(stratC3_mapboxCalls / 15 * 100).toFixed(1)}%) | ${(stratC3_places / sumMerged * 100).toFixed(1)}% |`);
  console.log(`| **(ج) OSM أولاً، Mapbox إذا النتائج < 5** | ${stratC5_places} | ${stratC5_mapboxCalls} / 15 (${(stratC5_mapboxCalls / 15 * 100).toFixed(1)}%) | ${(stratC5_places / sumMerged * 100).toFixed(1)}% |`);

  // 4. تحليل التكلفة
  console.log('\n### 4. تحليل التكلفة التقديرية (بحسب أسعار Mapbox الرسمية):');
  console.log('المصدر الرسمي: https://www.mapbox.com/pricing#search (تاريخ المراجعة: أكتوبر 2026)');
  console.log('- الحصة المجانية الشهرية لـ Mapbox Temporary Geocoding: 100,000 طلب مجاني شهرياً ($0.00).');
  console.log('- التسعيرة بعد الحصة المجانية: $0.75 لكل 1,000 طلب ($0.00075 / طلب).');
  console.log('\nتقدير عدد طلبات Mapbox والتكلفة الشهرية:');
  console.log('| الاستراتيجية | طلبات Mapbox لكل 1000 بحث | التكلفة عند 1,000 بحث | التكلفة عند 10,000 بحث | التكلفة عند 50,000 بحث | التكلفة عند 150,000 بحث |');
  console.log('| :--- | :---: | :---: | :---: | :---: | :---: |');

  const calcCost = (callsPer1k, volume) => {
    const totalCalls = (volume / 1000) * callsPer1k;
    const billable = Math.max(0, totalCalls - 100000);
    const cost = (billable / 1000) * 0.75;
    return `$${cost.toFixed(2)} (${Math.round(totalCalls)} طلب)`;
  };

  const reqA = 1000;
  const reqB = 1000;
  const reqC3 = Math.round((stratC3_mapboxCalls / 15) * 1000);
  const reqC5 = Math.round((stratC5_mapboxCalls / 15) * 1000);

  console.log(`| **(أ) Mapbox وحدها** | 1,000 | ${calcCost(reqA, 1000)} | ${calcCost(reqA, 10000)} | ${calcCost(reqA, 50000)} | ${calcCost(reqA, 150000)} |`);
  console.log(`| **(ب) الخدمتان دائماً** | 1,000 | ${calcCost(reqB, 1000)} | ${calcCost(reqB, 10000)} | ${calcCost(reqB, 50000)} | ${calcCost(reqB, 150000)} |`);
  console.log(`| **(ج) OSM أولاً (حد < 3)** | ${reqC3} | ${calcCost(reqC3, 1000)} | ${calcCost(reqC3, 10000)} | ${calcCost(reqC3, 50000)} | ${calcCost(reqC3, 150000)} |`);
  console.log(`| **(ج) OSM أولاً (حد < 5)** | ${reqC5} | ${calcCost(reqC5, 1000)} | ${calcCost(reqC5, 10000)} | ${calcCost(reqC5, 50000)} | ${calcCost(reqC5, 150000)} |`);

  // 5. خوارزمية الترتيب المقترحة وأمثلة
  console.log('\n### 5. خوارزمية الترتيب المقترحة للنتائج المدمجة (Hybrid Ranking):');
  console.log('المعادلة المقترحة لترتيب النتيجة i:');
  console.log('Score(i) = (NameMatchScore * 0.45) + (ProximityScore * 0.40) + (SourceWeight * 0.15)');
  console.log('- NameMatchScore: تطابق تام = 100، يبدأ بالكلمة = 80، يحتوي الكلمة = 60.');
  console.log('- ProximityScore: 100 - min(100, (Distance_in_km / 15) * 100) (أقرب لموقع الراكب أعلى).');
  console.log('- SourceWeight: نتيجة مؤكدة من المصدرين = 100، OpenStreetMap محلية = 85، Mapbox = 80.');

  console.log('\nمثال 1: ترتيب نتائج «جامعة الكوفة» (موقع الراكب: مركز النجف 31.9961, 44.3168):');
  const sampleKufa = (rawResults['جامعة الكوفة']?.photon?.places || []).slice(0, 4);
  sampleKufa.forEach((p, idx) => {
    const dist = getDistanceMeters(31.9961, 44.3168, p.lat, p.lon);
    console.log(`  [#${idx + 1}] ${p.name} (${p.fullName}) | المسافة: ${(dist / 1000).toFixed(1)} كم | المصدر: OpenStreetMap (Photon)`);
  });

  console.log('\nمثال 2: ترتيب نتائج «حي الغدير» (موقع الراكب: مركز النجف 31.9961, 44.3168):');
  const sampleGhadirMb = (rawResults['حي الغدير']?.mapbox?.places || []).slice(0, 1);
  const sampleGhadirPt = (rawResults['حي الغدير']?.photon?.places || []).slice(0, 3);
  sampleGhadirMb.forEach((p, idx) => {
    const dist = getDistanceMeters(31.9961, 44.3168, p.lat, p.lon);
    console.log(`  [#${idx + 1}] ${p.name} (${p.fullName}) | المسافة: ${(dist / 1000).toFixed(1)} كم | المصدر: Mapbox`);
  });
  sampleGhadirPt.forEach((p, idx) => {
    const dist = getDistanceMeters(31.9961, 44.3168, p.lat, p.lon);
    console.log(`  [#${idx + 2}] ${p.name} (${p.fullName}) | المسافة: ${(dist / 1000).toFixed(1)} كم | المصدر: OpenStreetMap (Photon)`);
  });
}

runSimulation();
