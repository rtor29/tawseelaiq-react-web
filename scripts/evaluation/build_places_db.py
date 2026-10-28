#!/usr/bin/env python3
"""
منظومة دمج وتقييم مصادر البيانات المفتوحة للأماكن في العراق
(OpenStreetMap + Overture Maps + Foursquare Open Source Places)
المسار: scripts/evaluation/build_places_db.py
"""

import sys
import os
import json
import re
import math
import time
from difflib import SequenceMatcher
import duckdb
import osmium
from shapely.geometry import shape, Point
from shapely.prepared import prep

DATA_DIR = "/Users/mu_it/Documents/ newTaxi/data-eval"
GOV_GEOJSON = "/Users/mu_it/Documents/ newTaxi/tawseela-web/scripts/evaluation/iraq-governorates.json"

OSM_PBF = os.path.join(DATA_DIR, "iraq-latest.osm.pbf")
OVERTURE_PARQUET = os.path.join(DATA_DIR, "overture-iraq.parquet")
FSQ_PARQUET = os.path.join(DATA_DIR, "foursquare-iraq.parquet")

MERGED_CSV = os.path.join(DATA_DIR, "places_eval_iraq.csv")
MERGED_PARQUET = os.path.join(DATA_DIR, "places_eval_iraq.parquet")
STATS_JSON = os.path.join(DATA_DIR, "places_eval_stats.json")

# ----------------------------------------------------------------------
# 1. تطبيع النصوص العربية وفق المعايير الحاكمة
# ----------------------------------------------------------------------
def normalize_arabic(text: str) -> str:
    if not text:
        return ""
    # 1. حذف التشكيل والتطويل
    text = re.sub(r'[\u064B-\u065F\u0670\u0640]', '', text)
    # 2. توحيد الألف
    text = re.sub(r'[أإآٱ]', 'ا', text)
    # 3. التاء المربوطة إلى هاء
    text = re.sub(r'ة', 'ه', text)
    # 4. الألف المقصورة إلى ياء
    text = re.sub(r'ى', 'ي', text)
    # 5. تطبيع حروف فارسية/كردية متفرقة
    text = text.replace('پ', 'ب').replace('چ', 'ج').replace('ڤ', 'ف').replace('گ', 'ك')
    # 6. حذف ال التعريف من بداية الكلمات (لكلمات طولها >= 4 أحرف)
    words = text.split()
    norm_words = []
    for w in words:
        if w.startswith('ال') and len(w) >= 4:
            w = w[2:]
        norm_words.append(w)
    text = ' '.join(norm_words)
    # 7. حذف علامات الترقيم وتوحيد المسافات
    text = re.sub(r'[^\w\s]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()

def has_arabic_char(text: str) -> bool:
    if not text:
        return False
    return bool(re.search(r'[\u0600-\u06FF]', text))

# ----------------------------------------------------------------------
# 2. الفئات الموحدة الـ 14
# ----------------------------------------------------------------------
CATEGORIES = [
    'صيدلية',
    'عيادة/طبيب',
    'مستشفى',
    'مختبر',
    'جامعة/كلية',
    'مدرسة',
    'سوق/متجر',
    'مول',
    'فندق',
    'مطعم/مقهى',
    'جامع/مسجد',
    'حي',
    'شارع',
    'أخرى'
]

def classify_place(name: str, raw_cat: str) -> str:
    n = (name or '').lower()
    c = (raw_cat or '').lower()
    combined = f"{n} {c}"

    # 1. صيدلية
    if 'صيدل' in n or 'pharmacy' in c or 'drugstore' in c or 'chemist' in c:
        return 'صيدلية'

    # 2. مستشفى
    if 'مستشف' in n or 'hospital' in c:
        return 'مستشفى'

    # 3. مختبر
    if 'مختبر' in n or 'laboratory' in c or 'lab' in c:
        return 'مختبر'

    # 4. عيادة / طبيب
    if 'عياد' in n or 'طبيب' in n or 'دكتور' in n or 'اسنان' in n or 'clinic' in c or 'doctor' in c or 'dentist' in c:
        return 'عيادة/طبيب'

    # 5. جامعة / كلية
    if 'جامع' in n and ('كوف' in n or 'بابل' in n or 'بغداد' in n or 'نهرين' in n or 'تكنول' in n or 'اهلي' in n or 'اسلامي' in n or 'كليه' in n or 'جامعه' in n):
        return 'جامعة/كلية'
    if 'جامعه' in n or 'كليه' in n or 'معهد' in n or 'university' in c or 'college' in c:
        return 'جامعة/كلية'

    # 6. مدرسة
    if 'مدرس' in n or 'ثانوي' in n or 'اعدادي' in n or 'ابتدائي' in n or 'روض' in n or 'school' in c or 'kindergarten' in c:
        return 'مدرسة'

    # 7. مول
    if 'مول' in n or 'mall' in c or 'shopping_mall' in c or 'مركز تسوق' in n:
        return 'مول'

    # 8. فندق
    if 'فندق' in n or 'hotel' in c or 'motel' in c or 'hostel' in c or 'resort' in c:
        return 'فندق'

    # 9. مطعم / مقهى
    if any(k in n for k in ['مطعم', 'كافيه', 'مقهى', 'مقهي', 'شاورما', 'برغر', 'مشاوي', 'كباب', 'بيتزا', 'حلويات', 'عصائر']) or any(k in c for k in ['restaurant', 'cafe', 'coffee', 'fast_food', 'bakery', 'food']):
        return 'مطعم/مقهى'

    # 10. جامع / مسجد
    if any(k in n for k in ['جامع', 'مسجد', 'حسينية', 'حسينيه', 'مرقد', 'مزار', 'مقام', 'امام ']) or 'mosque' in c or 'place_of_worship' in c:
        return 'جامع/مسجد'

    # 11. حي
    if 'حي ' in n or any(k in c for k in ['suburb', 'neighbourhood', 'neighborhood', 'quarter', 'locality', 'village']):
        return 'حي'

    # 12. شارع
    if 'شارع' in n or 'طريق' in n or 'highway' in c or 'road' in c or 'street' in c:
        return 'شارع'

    # 13. سوق / متجر
    if any(k in n for k in ['سوق', 'متجر', 'ماركت', 'بقالة', 'معرض', 'محل']) or any(k in c for k in ['shop', 'store', 'supermarket', 'grocery', 'market', 'retail']):
        return 'سوق/متجر'

    return 'أخرى'

# ----------------------------------------------------------------------
# 3. تحميل مضلعات المحافظات للربط المكاني الدقيق
# ----------------------------------------------------------------------
def load_governorates(path: str):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    govs = []
    for feat in data['features']:
        props = feat['properties']
        code = props.get('code') or props.get('id') or props.get('ref')
        poly = shape(feat['geometry'])
        govs.append({
            'code': code,
            'name_en': props.get('name_en') or props.get('name'),
            'name_ar': props.get('name_ar'),
            'bbox': poly.bounds, # minx, miny, maxx, maxy
            'prepared': prep(poly),
            'poly': poly
        })
    return govs

def get_governorate(govs, lon: float, lat: float) -> str:
    p = Point(lon, lat)
    for g in govs:
        minx, miny, maxx, maxy = g['bbox']
        if minx <= lon <= maxx and miny <= lat <= maxy:
            if g['prepared'].contains(p):
                return g['code']
    return None

# ----------------------------------------------------------------------
# 4. حساب المسافة بـ Haversine
# ----------------------------------------------------------------------
def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# ----------------------------------------------------------------------
# 5. استخراج OpenStreetMap
# ----------------------------------------------------------------------
class OsmExtractHandler(osmium.SimpleHandler):
    def __init__(self, govs):
        super().__init__()
        self.govs = govs
        self.places = []

    def check_and_add(self, osm_id, osm_type, tags, lon, lat):
        if not (38.5 <= lon <= 48.8 and 29.0 <= lat <= 37.5):
            return
        name = tags.get('name') or tags.get('name:ar') or tags.get('name:en')
        if not name:
            return
        gov = get_governorate(self.govs, lon, lat)
        if not gov:
            return # خارج حدود مضلعات المحافظات

        arabic_name = tags.get('name:ar') or (name if has_arabic_char(name) else None)
        
        # تحديد الفئة الخام
        raw_cat = ''
        for k in ['amenity', 'shop', 'healthcare', 'tourism', 'office', 'place', 'leisure', 'highway', 'building']:
            if k in tags:
                raw_cat = f"{k}={tags[k]}"
                break

        unified_cat = classify_place(name, raw_cat)
        norm_name = normalize_arabic(arabic_name or name)

        self.places.append({
            'source_id': f"osm:{osm_type}:{osm_id}",
            'source': 'osm',
            'original_name': name,
            'arabic_name': arabic_name,
            'normalized_name': norm_name,
            'unified_category': unified_cat,
            'lat': lat,
            'lon': lon,
            'governorate_code': gov,
            'confidence': 1.0
        })

    def node(self, n):
        tags = n.tags
        if any(k in tags for k in ['amenity', 'shop', 'healthcare', 'tourism', 'office', 'place', 'leisure', 'highway']):
            self.check_and_add(n.id, 'node', tags, n.location.lon, n.location.lat)

    def way(self, w):
        tags = w.tags
        if any(k in tags for k in ['amenity', 'shop', 'healthcare', 'tourism', 'office', 'place', 'leisure', 'highway', 'building']):
            if len(w.nodes) > 0:
                # حساب مركز المسار التقريبي
                try:
                    lats = [n.lat for n in w.nodes if n.valid()]
                    lons = [n.lon for n in w.nodes if n.valid()]
                    if lats and lons:
                        avg_lat = sum(lats) / len(lats)
                        avg_lon = sum(lons) / len(lons)
                        self.check_and_add(w.id, 'way', tags, avg_lon, avg_lat)
                except:
                    pass

def extract_osm(pbf_path: str, govs):
    print(">>> [1/4] جاري استخراج الأماكن من OpenStreetMap...")
    t0 = time.time()
    idx = osmium.index.create_map('sparse_mem_array')
    lh = osmium.NodeLocationsForWays(idx)
    handler = OsmExtractHandler(govs)
    reader = osmium.io.Reader(pbf_path)
    osmium.apply(reader, lh, handler)
    print(f"  ✓ تم استخراج {len(handler.places):,} مكاناً داخل حدود العراق من OSM في {time.time()-t0:.2f} ثانية.")
    return handler.places

# ----------------------------------------------------------------------
# 6. استخراج Overture Maps
# ----------------------------------------------------------------------
def extract_overture(parquet_path: str, govs):
    print(">>> [2/4] جاري استخراج الأماكن من Overture Maps...")
    t0 = time.time()
    con = duckdb.connect()
    
    # قراءة الحقول المطلوبة مباشرة
    rows = con.execute(f"""
        SELECT 
            id,
            names.primary AS primary_name,
            names.common['ar'] AS ar_common,
            basic_category,
            taxonomy.primary AS tax_primary,
            confidence,
            bbox.xmin AS lon_min,
            bbox.xmax AS lon_max,
            bbox.ymin AS lat_min,
            bbox.ymax AS lat_max
        FROM read_parquet('{parquet_path}')
        WHERE names.primary IS NOT NULL
    """).fetchall()

    places = []
    for r in rows:
        ov_id, pri_name, ar_common, basic_cat, tax_pri, conf, lon_min, lon_max, lat_min, lat_max = r
        lon = (lon_min + lon_max) / 2.0
        lat = (lat_min + lat_max) / 2.0

        gov = get_governorate(govs, lon, lat)
        if not gov:
            continue

        name = pri_name
        arabic_name = ar_common or (name if has_arabic_char(name) else None)
        raw_cat = f"{basic_cat or ''} {tax_pri or ''}"
        unified_cat = classify_place(name, raw_cat)
        norm_name = normalize_arabic(arabic_name or name)

        places.append({
            'source_id': f"overture:{ov_id}",
            'source': 'overture',
            'original_name': name,
            'arabic_name': arabic_name,
            'normalized_name': norm_name,
            'unified_category': unified_cat,
            'lat': lat,
            'lon': lon,
            'governorate_code': gov,
            'confidence': float(conf or 0.8)
        })

    print(f"  ✓ تم استخراج {len(places):,} مكاناً داخل حدود العراق من Overture في {time.time()-t0:.2f} ثانية.")
    return places

# ----------------------------------------------------------------------
# 7. استخراج Foursquare Open Source Places
# ----------------------------------------------------------------------
def extract_foursquare(parquet_path: str, govs):
    print(">>> [3/4] جاري استخراج الأماكن من Foursquare...")
    t0 = time.time()
    con = duckdb.connect()

    rows = con.execute(f"""
        SELECT 
            fsq_place_id,
            name,
            latitude,
            longitude,
            fsq_category_labels
        FROM read_parquet('{parquet_path}')
        WHERE name IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
    """).fetchall()

    places = []
    for r in rows:
        fsq_id, name, lat, lon, cat_labels = r
        gov = get_governorate(govs, lon, lat)
        if not gov:
            continue

        arabic_name = name if has_arabic_char(name) else None
        raw_cat = ' '.join(cat_labels) if cat_labels else ''
        unified_cat = classify_place(name, raw_cat)
        norm_name = normalize_arabic(arabic_name or name)

        places.append({
            'source_id': f"fsq:{fsq_id}",
            'source': 'foursquare',
            'original_name': name,
            'arabic_name': arabic_name,
            'normalized_name': norm_name,
            'unified_category': unified_cat,
            'lat': lat,
            'lon': lon,
            'governorate_code': gov,
            'confidence': 0.85
        })

    print(f"  ✓ تم استخراج {len(places):,} مكاناً داخل حدود العراق من Foursquare في {time.time()-t0:.2f} ثانية.")
    return places

# ----------------------------------------------------------------------
# 8. دمج السجلات وإزالة المكررات (Deduplication)
# ----------------------------------------------------------------------
def deduplicate_places(all_places):
    print(">>> [4/4] جاري دمج السجلات وإزالة المكررات عبر الشبكة المكانية والتشابه النصي...")
    t0 = time.time()

    # تجميع حسب المحافظة لتسريع المطابقة
    by_gov = {}
    for p in all_places:
        by_gov.setdefault(p['governorate_code'], []).append(p)

    merged_results = []
    duplicate_examples = []
    suspicious_examples = []

    # معايير المسافة
    LARGE_CATEGORIES = {'مستشفى', 'جامعة/كلية', 'مدرسة', 'مول', 'فندق', 'جامع/مسجد', 'حي', 'شارع'}

    for gov, items in by_gov.items():
        print(f"  - معالجة محافظة {gov} ({len(items):,} مكاناً)...")
        # فهرسة مكانية بسيطة عبر خلايا شبكية ~ 200 متر (0.002 درجة)
        grid = {}
        for idx, item in enumerate(items):
            item['_idx'] = idx
            gx = int(item['lon'] / 0.002)
            gy = int(item['lat'] / 0.002)
            grid.setdefault((gx, gy), []).append(item)

        visited = set()
        for idx, item in enumerate(items):
            if idx in visited:
                continue

            max_dist = 150.0 if item['unified_category'] in LARGE_CATEGORIES else 60.0
            deg_lat = max_dist / 111000.0
            deg_lon = max_dist / 93000.0

            gx = int(item['lon'] / 0.002)
            gy = int(item['lat'] / 0.002)

            # جمع المرشحين من الخلايا المجاورة (3x3)
            candidates = []
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    cell = (gx + dx, gy + dy)
                    if cell in grid:
                        for cand in grid[cell]:
                            candidates.append(cand)

            # فحص التكرار مع المرشحين
            matched_group = [item]
            visited.add(idx)

            for cand in candidates:
                cand_idx = cand['_idx']
                if cand_idx == idx or cand_idx in visited:
                    continue

                # تصفية سريعة بالدرجات أولاً قبل الـ haversine
                if abs(item['lat'] - cand['lat']) > deg_lat or abs(item['lon'] - cand['lon']) > deg_lon:
                    continue

                # حساب المسافة الدقيقة
                dist = haversine_m(item['lat'], item['lon'], cand['lat'], cand['lon'])
                if dist > max_dist:
                    continue

                # حساب تشابه الاسم المطبّع
                n1 = item['normalized_name']
                n2 = cand['normalized_name']

                if not n1 or not n2:
                    continue

                if n1 == n2:
                    is_dup = True
                    similarity = 1.0
                else:
                    l1, l2 = len(n1), len(n2)
                    if min(l1, l2) / max(l1, l2) < 0.6:
                        continue
                    similarity = SequenceMatcher(None, n1, n2).ratio()
                    is_dup = (similarity >= 0.7)
                    if not is_dup and (n1 in n2 or n2 in n1) and min(l1, l2) >= 4 and dist <= 40.0:
                        is_dup = True

                if is_dup:
                    matched_group.append(cand)
                    visited.add(cand_idx)
                    if len(duplicate_examples) < 15 and item['source'] != cand['source']:
                        duplicate_examples.append({
                            'name1': item['original_name'],
                            'source1': item['source'],
                            'name2': cand['original_name'],
                            'source2': cand['source'],
                            'distance_m': round(dist, 1),
                            'similarity': round(similarity, 2),
                            'category': item['unified_category']
                        })
                elif similarity >= 0.55 and dist <= max_dist and len(suspicious_examples) < 10 and item['source'] != cand['source']:
                    suspicious_examples.append({
                        'name1': item['original_name'],
                        'source1': item['source'],
                        'name2': cand['original_name'],
                        'source2': cand['source'],
                        'distance_m': round(dist, 1),
                        'similarity': round(similarity, 2),
                        'category': item['unified_category']
                    })

            # دمج المجموعة في سجل واحد
            sources = sorted(list(set(m['source'] for m in matched_group)))
            best_ar = next((m['arabic_name'] for m in matched_group if m['arabic_name']), None)
            best_name = max((m['original_name'] for m in matched_group), key=len)
            best_norm = next((m['normalized_name'] for m in matched_group if m['normalized_name']), normalize_arabic(best_name))
            
            # الفئة الأفضل
            best_cat = item['unified_category']
            for m in matched_group:
                if m['unified_category'] != 'أخرى':
                    best_cat = m['unified_category']
                    break

            # الإحداثيات (أولوية OSM ثم Overture ثم FSQ)
            pref_order = {'osm': 3, 'overture': 2, 'foursquare': 1}
            best_coord = max(matched_group, key=lambda m: pref_order.get(m['source'], 0))

            merged_record = {
                'source_id': matched_group[0]['source_id'],
                'sources': ','.join(sources),
                'sources_count': len(sources),
                'original_name': best_name,
                'arabic_name': best_ar,
                'normalized_name': best_norm,
                'unified_category': best_cat,
                'lat': best_coord['lat'],
                'lon': best_coord['lon'],
                'governorate_code': gov,
                'confidence': max(m['confidence'] for m in matched_group)
            }
            merged_results.append(merged_record)

    print(f"  ✓ اكتمل الدمج في {time.time()-t0:.2f} ثانية: الإجمالي بعد إزالة المكررات = {len(merged_results):,} مكاناً.")
    return merged_results, duplicate_examples, suspicious_examples

# ----------------------------------------------------------------------
# 9. توليد الإحصائيات الدقيقة للمحافظات (النجف، بغداد، كربلاء)
# ----------------------------------------------------------------------
def compute_gov_stats(raw_osm, raw_overture, raw_fsq, merged_places, target_gov):
    stats = {}
    for cat in CATEGORIES:
        stats[cat] = {
            'osm': 0,
            'overture': 0,
            'fsq': 0,
            'merged_total': 0,
            'osm_only': 0,
            'overture_only': 0,
            'fsq_only': 0
        }

    for p in raw_osm:
        if p['governorate_code'] == target_gov:
            stats[p['unified_category']]['osm'] += 1

    for p in raw_overture:
        if p['governorate_code'] == target_gov:
            stats[p['unified_category']]['overture'] += 1

    for p in raw_fsq:
        if p['governorate_code'] == target_gov:
            stats[p['unified_category']]['fsq'] += 1

    for p in merged_places:
        if p['governorate_code'] == target_gov:
            cat = p['unified_category']
            stats[cat]['merged_total'] += 1
            srcs = p['sources'].split(',')
            if len(srcs) == 1:
                if 'osm' in srcs:
                    stats[cat]['osm_only'] += 1
                elif 'overture' in srcs:
                    stats[cat]['overture_only'] += 1
                elif 'foursquare' in srcs:
                    stats[cat]['fsq_only'] += 1

    return stats

# ----------------------------------------------------------------------
# الدالة الرئيسية
# ----------------------------------------------------------------------
def main():
    print("==================================================================")
    print("  بدء استخراج ودمج الأماكن المفتوحة للعراق (OSM + Overture + FSQ)")
    print("==================================================================")
    t_start = time.time()

    govs = load_governorates(GOV_GEOJSON)
    print(f"✓ تم تحميل حدود {len(govs)} محافظة عراقية بنجاح.")

    RAW_CACHE = os.path.join(DATA_DIR, "raw_places_cache.json")
    if os.path.exists(RAW_CACHE):
        print(f">>> تحميل السجلات الخام من الكاش السريع {RAW_CACHE}...")
        with open(RAW_CACHE, 'r', encoding='utf-8') as f:
            cache_data = json.load(f)
        osm_places = cache_data['osm']
        overture_places = cache_data['overture']
        fsq_places = cache_data['fsq']
        print(f"  ✓ تم استرجاع {len(osm_places):,} من OSM، و{len(overture_places):,} من Overture، و{len(fsq_places):,} من FSQ.")
    else:
        osm_places = extract_osm(OSM_PBF, govs)
        overture_places = extract_overture(OVERTURE_PARQUET, govs)
        fsq_places = extract_foursquare(FSQ_PARQUET, govs)
        with open(RAW_CACHE, 'w', encoding='utf-8') as f:
            json.dump({'osm': osm_places, 'overture': overture_places, 'fsq': fsq_places}, f, ensure_ascii=False)
        print(f"  ✓ تم حفظ الكاش في {RAW_CACHE}")

    all_raw = osm_places + overture_places + fsq_places
    print(f"\nإجمالي السجلات الخام قبل الدمج: {len(all_raw):,} "
          f"(OSM: {len(osm_places):,}, Overture: {len(overture_places):,}, FSQ: {len(fsq_places):,})")

    merged, dup_examples, susp_examples = deduplicate_places(all_raw)

    print("\n>>> حفظ النتائج في CSV و Parquet للاستيراد لقاعدة البيانات...")
    import csv
    with open(MERGED_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            'source_id',
            'sources',
            'original_name',
            'arabic_name',
            'normalized_name',
            'unified_category',
            'lat',
            'lon',
            'governorate_code',
            'confidence'
        ])
        for p in merged:
            writer.writerow([
                p['source_id'],
                p['sources'],
                p['original_name'],
                p['arabic_name'] or '',
                p['normalized_name'],
                p['unified_category'],
                p['lat'],
                p['lon'],
                p['governorate_code'],
                p['confidence']
            ])
    print(f"  ✓ تم حفظ {MERGED_CSV}")

    con = duckdb.connect()
    con.execute(f"COPY (SELECT * FROM read_csv('{MERGED_CSV}')) TO '{MERGED_PARQUET}' (FORMAT PARQUET)")
    print(f"  ✓ تم حفظ {MERGED_PARQUET}")

    # حساب الإحصائيات
    najaf_stats = compute_gov_stats(osm_places, overture_places, fsq_places, merged, 'najaf')
    baghdad_stats = compute_gov_stats(osm_places, overture_places, fsq_places, merged, 'baghdad')
    karbala_stats = compute_gov_stats(osm_places, overture_places, fsq_places, merged, 'karbala')

    # عينات النجف الـ 20
    import random
    random.seed(42)
    najaf_items = [p for p in merged if p['governorate_code'] == 'najaf' and p['normalized_name']]
    najaf_samples = random.sample(najaf_items, min(20, len(najaf_items)))

    stats_summary = {
        'total_raw': len(all_raw),
        'osm_raw': len(osm_places),
        'overture_raw': len(overture_places),
        'fsq_raw': len(fsq_places),
        'total_merged': len(merged),
        'najaf_stats': najaf_stats,
        'baghdad_stats': baghdad_stats,
        'karbala_stats': karbala_stats,
        'dup_examples': dup_examples,
        'suspicious_examples': susp_examples,
        'najaf_samples': [
            {
                'name': s['original_name'],
                'category': s['unified_category'],
                'sources': s['sources'],
                'lat': round(s['lat'], 5),
                'lon': round(s['lon'], 5)
            }
            for s in najaf_samples
        ]
    }

    with open(STATS_JSON, 'w', encoding='utf-8') as f:
        json.dump(stats_summary, f, ensure_ascii=False, indent=2)

    print(f"  ✓ تم حفظ ملف الإحصائيات الشامل: {STATS_JSON}")
    print(f"\n==================================================================")
    print(f"✓ اكتملت العملية بنجاح في {time.time()-t_start:.2f} ثانية!")
    print(f"==================================================================")

if __name__ == '__main__':
    main()
