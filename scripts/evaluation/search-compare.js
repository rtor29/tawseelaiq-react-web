import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. قراءة التوكن بأمان من ملف .env دون طباعته
function getMapboxToken() {
  const envPaths = [
    path.join(__dirname, '../../taxi-wisam/.env'),
    path.join(__dirname, '../.env'),
    path.join(__dirname, '../../../taxi-wisam/.env'),
    '/var/www/taxi-wisam/.env'
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      const match = fs.readFileSync(p, 'utf8').match(/^MAPBOX_TOKEN=(.*)$/m);
      if (match) return match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return process.env.VITE_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN || '';
}

// 2. تحميل مضلع محافظة النجف للتحقق الهندسي الدقيق
const govPath = path.join(__dirname, 'iraq-governorates.json');
if (!fs.existsSync(govPath)) {
  console.error('❌ خطأ: ملف iraq-governorates.json غير موجود في scripts/evaluation/');
  process.exit(1);
}
const govData = JSON.parse(fs.readFileSync(govPath, 'utf8'));
const najafFeature = govData.features.find((f) => f.properties.id === 'najaf');

function pointInPoly(x, y, poly) {
  let inside = false;
  const n = poly.length;
  let p1x = poly[0][0];
  let p1y = poly[0][1];
  for (let i = 1; i <= n; i++) {
    const p2 = poly[i % n];
    const p2x = p2[0];
    const p2y = p2[1];
    if (y > Math.min(p1y, p2y) && y <= Math.max(p1y, p2y) && x <= Math.max(p1x, p2x)) {
      if (p1y !== p2y) {
        const xinters = ((y - p1y) * (p2x - p1x)) / (p2y - p1y) + p1x;
        if (p1x === p2x || x <= xinters) {
          inside = !inside;
        }
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

function isArabic(text) {
  return /[\u0600-\u06FF]/.test(text || '');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const NAJAF_BBOX = '42.9358,29.8501,44.7797,32.3588'; // minLon,minLat,maxLon,maxLat
const NAJAF_PROXIMITY = '44.3168,31.9961'; // lon,lat
const USER_AGENT = 'Tawseela-evaluation/1.0 (contact@tawseelaiq.app)';

async function fetchMapbox(keyword, token) {
  if (!token) throw new Error('Missing Mapbox Token');
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(keyword)}.json?access_token=${token}&country=iq&language=ar&types=poi,address,neighborhood,locality&bbox=${NAJAF_BBOX}&proximity=${NAJAF_PROXIMITY}&autocomplete=true&fuzzyMatch=true&limit=10`;
  const t0 = performance.now();
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const latency = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`Mapbox HTTP ${res.status}`);
  const json = await res.json();
  const places = (json.features || []).map((f) => {
    const lon = f.center[0];
    const lat = f.center[1];
    const name = f.text_ar || f.text || (f.place_name_ar ? f.place_name_ar.split(',')[0].trim() : '') || (f.place_name ? f.place_name.split(',')[0].trim() : '');
    const fullName = f.place_name_ar || f.place_name || name;
    return {
      name,
      fullName,
      lon,
      lat,
      inside_najaf: isInsideNajaf(lon, lat),
    };
  });
  return { places, latency };
}

async function fetchPhoton(keyword) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(keyword)}&lang=default&bbox=${NAJAF_BBOX}&lat=31.9961&lon=44.3168&limit=15`;
  const t0 = performance.now();
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const latency = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
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
  return { places, latency };
}

async function fetchNominatim(keyword) {
  const viewbox = '42.9358,32.3588,44.7797,29.8501';
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(keyword)}&format=json&countrycodes=iq&accept-language=ar&viewbox=${viewbox}&bounded=1&limit=15`;
  const t0 = performance.now();
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ar' } });
  const latency = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const json = await res.json();
  const places = (Array.isArray(json) ? json : []).map((item) => {
    const lon = parseFloat(item.lon);
    const lat = parseFloat(item.lat);
    const rawName = item.name || (item.display_name ? item.display_name.split(',')[0].trim() : keyword);
    return {
      name: rawName,
      fullName: item.display_name || rawName,
      lon,
      lat,
      inside_najaf: isInsideNajaf(lon, lat),
    };
  });
  return { places, latency };
}

async function main() {
  const token = getMapboxToken();
  if (!token) {
    console.error('❌ تعذر العثور على توكن Mapbox.');
    process.exit(1);
  }
  console.log('✓ تم العثور على توكن Mapbox بنجاح (pk.***)');
  console.log('✓ تم تحميل مضلع النجف الأشرف بنجاح.');
  console.log('>>> بدء تقييم محركات البحث الـ 3 على 15 كلمة...');

  const results = {};

  for (let i = 0; i < KEYWORDS.length; i++) {
    const kw = KEYWORDS[i];
    console.log(`\n[${i + 1}/${KEYWORDS.length}] جاري تقييم: «${kw}»...`);
    results[kw] = {};

    // 1. Mapbox
    try {
      const mb = await fetchMapbox(kw, token);
      const inNajaf = mb.places.filter((p) => p.inside_najaf);
      const top5 = inNajaf.slice(0, 5).map((p) => p.name);
      const arabicCount = inNajaf.filter((p) => isArabic(p.name)).length;
      results[kw].mapbox = {
        total_count: mb.places.length,
        najaf_count: inNajaf.length,
        top_5_names: top5,
        is_arabic: arabicCount > 0,
        arabic_ratio: inNajaf.length > 0 ? `${arabicCount}/${inNajaf.length}` : '0/0',
        latency_ms: mb.latency,
        places: inNajaf,
      };
      console.log(`  - Mapbox: ${inNajaf.length}/${mb.places.length} داخل النجف | ${mb.latency}ms`);
    } catch (err) {
      console.error(`  ❌ Mapbox Error on «${kw}»:`, err.message);
      results[kw].mapbox = { error: err.message, total_count: 0, najaf_count: 0, top_5_names: [], places: [] };
    }

    await sleep(1100);

    // 2. Photon
    try {
      const pt = await fetchPhoton(kw);
      const inNajaf = pt.places.filter((p) => p.inside_najaf);
      const top5 = inNajaf.slice(0, 5).map((p) => p.name);
      const arabicCount = inNajaf.filter((p) => isArabic(p.name)).length;
      results[kw].photon = {
        total_count: pt.places.length,
        najaf_count: inNajaf.length,
        top_5_names: top5,
        is_arabic: arabicCount > 0,
        arabic_ratio: inNajaf.length > 0 ? `${arabicCount}/${inNajaf.length}` : '0/0',
        latency_ms: pt.latency,
        places: inNajaf,
      };
      console.log(`  - Photon: ${inNajaf.length}/${pt.places.length} داخل النجف | ${pt.latency}ms`);
    } catch (err) {
      console.error(`  ❌ Photon Error on «${kw}»:`, err.message);
      results[kw].photon = { error: err.message, total_count: 0, najaf_count: 0, top_5_names: [], places: [] };
    }

    await sleep(1100);

    // 3. Nominatim
    try {
      const nm = await fetchNominatim(kw);
      const inNajaf = nm.places.filter((p) => p.inside_najaf);
      const top5 = inNajaf.slice(0, 5).map((p) => p.name);
      const arabicCount = inNajaf.filter((p) => isArabic(p.name)).length;
      results[kw].nominatim = {
        total_count: nm.places.length,
        najaf_count: inNajaf.length,
        top_5_names: top5,
        is_arabic: arabicCount > 0,
        arabic_ratio: inNajaf.length > 0 ? `${arabicCount}/${inNajaf.length}` : '0/0',
        latency_ms: nm.latency,
        places: inNajaf,
      };
      console.log(`  - Nominatim: ${inNajaf.length}/${nm.places.length} داخل النجف | ${nm.latency}ms`);
    } catch (err) {
      console.error(`  ❌ Nominatim Error on «${kw}»:`, err.message);
      results[kw].nominatim = { error: err.message, total_count: 0, najaf_count: 0, top_5_names: [], places: [] };
    }

    await sleep(1100);
  }

  // حفظ النتائج الخام بدون أي أسرار أو توكنات
  const outPath = path.join(__dirname, 'search-results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n======================================================`);
  console.log(`✓ تم حفظ جميع النتائج الخام بنجاح في: ${outPath}`);
  console.log(`======================================================`);
}

main().catch(console.error);
