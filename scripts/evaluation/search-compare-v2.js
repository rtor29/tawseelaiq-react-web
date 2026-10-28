import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. تحميل مضلع محافظة النجف من iraq-governorates.json
const govPath = path.join(__dirname, 'iraq-governorates.json');
const govData = JSON.parse(fs.readFileSync(govPath, 'utf8'));
const najafFeature = govData.features.find(
  (f) => f.properties?.id === 'najaf' || f.properties?.name_en === 'An-Najaf'
);

function pointInPoly(x, y, ring) {
  let inside = false;
  let p1x = ring[0][0];
  let p1y = ring[0][1];
  for (let i = 1; i <= ring.length; i++) {
    const p2x = ring[i % ring.length][0];
    const p2y = ring[i % ring.length][1];
    if (y > Math.min(p1y, p2y) && y <= Math.max(p1y, p2y) && x <= Math.max(p1x, p2x)) {
      const xinters = p1y !== p2y ? ((y - p1y) * (p2x - p1x)) / (p2y - p1y) + p1x : p1x;
      if (p1x === p2x || x <= xinters) {
        inside = !inside;
      }
    }
    p1x = p2x;
    p1y = p2y;
  }
  return inside;
}

function isInsideNajaf(lon, lat) {
  if (!najafFeature || !najafFeature.geometry) return false;
  const geom = najafFeature.geometry;
  if (geom.type === 'Polygon') {
    if (pointInPoly(lon, lat, geom.coordinates[0])) {
      for (let i = 1; i < geom.coordinates.length; i++) {
        if (pointInPoly(lon, lat, geom.coordinates[i])) return false;
      }
      return true;
    }
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (pointInPoly(lon, lat, poly[0])) {
        let inHole = false;
        for (let i = 1; i < poly.length; i++) {
          if (pointInPoly(lon, lat, poly[i])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEYWORDS = [
  'صيدلية',
  'عيادة',
  'مستشفى',
  'كلية',
  'جامعة الكوفة',
  'طبيب أسنان',
  'مختبر',
  'سوق',
  'مول',
  'فندق',
  'مطعم',
  'جامع',
  'حي الأمير',
  'حي الغدير',
  'شارع الكوفة',
];

function getMapboxToken() {
  if (process.env.VITE_MAPBOX_TOKEN) return process.env.VITE_MAPBOX_TOKEN;
  try {
    const envProd = fs.readFileSync(path.join(__dirname, '../../.env.production'), 'utf8');
    const m = envProd.match(/VITE_MAPBOX_TOKEN=(.+)/);
    if (m && m[1]) return m[1].trim();
  } catch {}
  return '';
}

const MAPBOX_TOKEN = getMapboxToken();

// معاملات تطبيق توصيله الحرفية من tawseela-web/src/lib/mapbox.ts (دالة searchPlaces)
const APP_PROXIMITY = '44.3168,31.9961'; // النجف الأشرف
const APP_COUNTRY = 'iq';
const APP_LANG = 'ar';
const APP_TYPES = 'poi,address,neighborhood,locality';
const APP_LIMIT = 8;

async function fetchMapboxApp(keyword) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    keyword
  )}.json?access_token=${MAPBOX_TOKEN}&country=${APP_COUNTRY}&language=${APP_LANG}&types=${APP_TYPES}&proximity=${APP_PROXIMITY}&autocomplete=true&fuzzyMatch=true&limit=${APP_LIMIT}`;

  const t0 = performance.now();
  const res = await fetch(url);
  const latency = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`Mapbox HTTP ${res.status}`);
  const json = await res.json();

  const places = (json.features || []).map((f) => {
    const lon = f.center[0];
    const lat = f.center[1];
    const name =
      f.text_ar ||
      (f.place_name_ar ? f.place_name_ar.split(',')[0].trim() : '') ||
      f.text ||
      (f.place_name ? f.place_name.split(',')[0].trim() : '');
    const fullName = f.place_name_ar || f.place_name || name;
    return {
      id: f.id,
      name,
      fullName,
      lon,
      lat,
      inside_najaf: isInsideNajaf(lon, lat),
    };
  });

  return { places, latency, rawUrl: url.replace(MAPBOX_TOKEN, 'pk.***') };
}

// تحميل نتائج Photon السابقة أو إرسال طلب جديد إذا تطلب الأمر
const prevResultsPath = path.join(__dirname, 'search-results.json');
const prevData = fs.existsSync(prevResultsPath)
  ? JSON.parse(fs.readFileSync(prevResultsPath, 'utf8'))
  : {};

async function getPhotonResults(keyword) {
  if (prevData[keyword]?.photon?.places) {
    const places = prevData[keyword].photon.places.map((p) => ({
      ...p,
      inside_najaf: isInsideNajaf(p.lon, p.lat),
    }));
    return { places, latency: prevData[keyword].photon.latency_ms || 300, fromCache: true };
  }

  // طلب جديد إذا لم تكن موجودة
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
    keyword
  )}&lang=default&bbox=42.9358,29.8501,44.7797,32.3588&lat=31.9961&lon=44.3168&limit=15`;
  const t0 = performance.now();
  const res = await fetch(url, { headers: { 'User-Agent': 'Tawseela-evaluation/1.0' } });
  const latency = Math.round(performance.now() - t0);
  const json = await res.json();
  const places = (json.features || []).map((f) => {
    const lon = f.geometry.coordinates[0];
    const lat = f.geometry.coordinates[1];
    const p = f.properties || {};
    const name = p.name || p.street || p.city || keyword;
    const parts = [name, p.street, p.district, p.city, p.country].filter(Boolean);
    const fullName = parts.join('، ');
    return {
      name,
      fullName,
      lon,
      lat,
      inside_najaf: isInsideNajaf(lon, lat),
    };
  });
  await sleep(1100);
  return { places, latency, fromCache: false };
}

function normalizeName(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/^ال/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function distMeters(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function main() {
  console.log('======================================================================');
  console.log('   بدء إعادة مقارنة البحث بنفس خدمة ومعاملات تطبيق توصيله حرفياً');
  console.log('======================================================================\n');

  const comparisonData = {};
  const allMapboxNajafPlaces = [];
  const allPhotonNajafPlaces = [];

  for (const kw of KEYWORDS) {
    console.log(`>>> جاري تقييم الكلمة: "${kw}"...`);
    const mbRes = await fetchMapboxApp(kw);
    const phRes = await getPhotonResults(kw);

    const mbNajaf = mbRes.places.filter((p) => p.inside_najaf);
    const phNajaf = phRes.places.filter((p) => p.inside_najaf);

    mbNajaf.forEach((p) => allMapboxNajafPlaces.push({ ...p, keyword: kw }));
    phNajaf.forEach((p) => allPhotonNajafPlaces.push({ ...p, keyword: kw }));

    comparisonData[kw] = {
      keyword: kw,
      mapbox: {
        rawUrl: mbRes.rawUrl,
        latency_ms: mbRes.latency,
        total_count: mbRes.places.length,
        najaf_count: mbNajaf.length,
        top_3_raw: mbRes.places.slice(0, 3).map((p) => ({
          name: p.name,
          fullName: p.fullName,
          coordinates: [p.lon, p.lat],
          inside_najaf: p.inside_najaf,
        })),
        all_places: mbRes.places,
      },
      photon: {
        latency_ms: phRes.latency,
        total_count: phRes.places.length,
        najaf_count: phNajaf.length,
        top_3_raw: phRes.places.slice(0, 3).map((p) => ({
          name: p.name,
          fullName: p.fullName,
          coordinates: [p.lon, p.lat],
          inside_najaf: p.inside_najaf,
        })),
        all_places: phRes.places,
      },
    };

    console.log(
      `   * Mapbox: إجمالي ${mbRes.places.length} | في النجف ${mbNajaf.length} | زمن ${mbRes.latency}ms`
    );
    console.log(
      `   * Photon: إجمالي ${phRes.places.length} | في النجف ${phNajaf.length} | زمن ${phRes.latency}ms\n`
    );

    await sleep(200);
  }

  // محاكاة الدمج وإحصاء الأماكن الفريدة
  console.log('======================================================================');
  console.log('   محاكاة الدمج وحساب مساهمة Mapbox الفريدة فوق Photon في النجف');
  console.log('======================================================================');

  const deduplicatedPhoton = [];
  for (const p of allPhotonNajafPlaces) {
    const norm = normalizeName(p.name);
    const exists = deduplicatedPhoton.some((dp) => {
      const dNorm = normalizeName(dp.name);
      const dDist = distMeters(p.lon, p.lat, dp.lon, dp.lat);
      return (dNorm === norm || dNorm.includes(norm) || norm.includes(dNorm)) && dDist < 100;
    });
    if (!exists) deduplicatedPhoton.push(p);
  }

  // فحص كم مكاناً فريداً تضيفه Mapbox داخل النجف لم يجده Photon
  const uniqueAddedByMapbox = [];
  for (const mbP of allMapboxNajafPlaces) {
    const mbNorm = normalizeName(mbP.name);
    const matchInPhoton = deduplicatedPhoton.some((phP) => {
      const phNorm = normalizeName(phP.name);
      const d = distMeters(mbP.lon, mbP.lat, phP.lon, phP.lat);
      return (phNorm === mbNorm || phNorm.includes(mbNorm) || mbNorm.includes(phNorm)) && d < 200;
    });
    if (!matchInPhoton) {
      uniqueAddedByMapbox.push(mbP);
    }
  }

  console.log(`\n- إجمالي أماكن Mapbox داخل النجف (الكلمات الـ 15): ${allMapboxNajafPlaces.length}`);
  console.log(`- إجمالي أماكن Photon داخل النجف (الكلمات الـ 15): ${allPhotonNajafPlaces.length}`);
  console.log(`- أماكن Photon الفريدة داخل النجف: ${deduplicatedPhoton.length}`);
  console.log(
    `- الأماكن الفريدة داخل النجف التي تضيفها Mapbox فوق Photon: ${uniqueAddedByMapbox.length}`
  );
  if (uniqueAddedByMapbox.length > 0) {
    console.log('  الأسماء الحرفية المضافة:');
    uniqueAddedByMapbox.forEach((p) =>
      console.log(`    * [${p.keyword}] ${p.name} (${p.fullName}) [${p.lon}, ${p.lat}]`)
    );
  } else {
    console.log('  (صفر أماكن إضافية — Mapbox لم يضف أي مكان داخل النجف غير موجود في Photon)');
  }

  const outputV2 = {
    executed_at: new Date().toISOString(),
    evaluation_criteria: {
      mapbox_url_template:
        'https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json?country=iq&language=ar&types=poi,address,neighborhood,locality&proximity=44.3168,31.9961&autocomplete=true&fuzzyMatch=true&limit=8',
      keywords_count: KEYWORDS.length,
      najaf_polygon_source: 'iraq-governorates.json (IQ-NA)',
    },
    results: comparisonData,
    summary: {
      mapbox_total_inside_najaf: allMapboxNajafPlaces.length,
      photon_total_inside_najaf: allPhotonNajafPlaces.length,
      photon_unique_inside_najaf: deduplicatedPhoton.length,
      unique_places_added_by_mapbox_over_photon_count: uniqueAddedByMapbox.length,
      unique_places_added_by_mapbox_over_photon_names: uniqueAddedByMapbox.map((p) => ({
        keyword: p.keyword,
        name: p.name,
        fullName: p.fullName,
        coordinates: [p.lon, p.lat],
      })),
    },
  };

  const outPath = path.join(__dirname, 'search-compare-v2.json');
  fs.writeFileSync(outPath, JSON.stringify(outputV2, null, 2));
  console.log(`\n✓ تم حفظ كافة البيانات في: ${outPath}`);
}

main().catch((err) => {
  console.error('Execution error:', err);
  process.exit(1);
});
