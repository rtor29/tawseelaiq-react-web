#!/usr/bin/env python3
"""
Evaluation and benchmark script for unified open places database on taxiwisam_staging.
Executes Part 3 requirements:
- 15 queries in Najaf (center: 32.0255, 44.3465)
- Top 5 raw results and count
- EXPLAIN ANALYZE execution times
- Comparison with Photon from search-compare-v2.json
- Performance benchmark (15 queries x 20 repetitions -> p50, p95)
- 5 Typos test
- Server memory, CPU, and DB size measurements
"""

import json
import subprocess
import time
from typing import Any, Dict, List

SSH_HOST = "root@173.212.206.86"
DB_NAME = "taxiwisam_staging"
CENTER_LAT = 32.0255
CENTER_LON = 44.3465
GOV_CODE = "najaf"

KEYWORDS_15 = [
    "صيدلية",
    "عيادة",
    "مستشفى",
    "كلية",
    "جامعة الكوفة",
    "طبيب أسنان",
    "مختبر",
    "سوق",
    "مول",
    "فندق",
    "مطعم",
    "جامع",
    "حي الأمير",
    "حي الغدير",
    "شارع الكوفة"
]

TYPOS_5 = [
    ("صيدليه", "صيدلية"),
    ("مستشفي", "مستشفى"),
    ("الغديير", "حي الغدير"),
    ("جامعه الكوفه", "جامعة الكوفة"),
    ("عياده", "عيادة")
]


def run_psql(query: str) -> str:
    # Escape double quotes and backslashes for remote bash
    cmd = [
        "ssh", "-o", "StrictHostKeyChecking=no", SSH_HOST,
        f"sudo -u postgres psql -d {DB_NAME} -t -A -c {subprocess.list2cmdline([query])}"
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    return res.stdout.strip()


def run_psql_raw(query: str) -> str:
    cmd = [
        "ssh", "-o", "StrictHostKeyChecking=no", SSH_HOST,
        f"sudo -u postgres psql -d {DB_NAME} -c {subprocess.list2cmdline([query])}"
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    return res.stdout.strip()


def run_remote_sh(cmd_str: str) -> str:
    cmd = ["ssh", "-o", "StrictHostKeyChecking=no", SSH_HOST, cmd_str]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    return res.stdout.strip()


def load_photon_results() -> Dict[str, Any]:
    with open("tawseela-web/scripts/evaluation/search-compare-v2.json") as f:
        data = json.load(f)
    return data.get("results", {})


def evaluate_keywords() -> Dict[str, Any]:
    photon_data = load_photon_results()
    results = {}

    for kw in KEYWORDS_15:
        print(f"Testing keyword: {kw}...")
        # 1. Total count
        count_q = f"""
        SELECT count(*) 
        FROM places_eval 
        WHERE governorate_code = '{GOV_CODE}' 
          AND (normalized_name % normalize_arabic_text('{kw}') 
               OR normalized_name ILIKE ('%' || normalize_arabic_text('{kw}') || '%'));
        """
        total_count = int(run_psql(count_q))

        # 2. Top 5 raw
        top5_q = f"""
        SELECT json_agg(row_to_json(r))
        FROM (
            SELECT id, name, category, sources, similarity, distance_meters, lat, lon
            FROM search_places_eval('{kw}', '{GOV_CODE}', {CENTER_LAT}, {CENTER_LON})
            LIMIT 5
        ) r;
        """
        top5_raw = run_psql(top5_q)
        top5 = json.loads(top5_raw) if top5_raw and top5_raw != "" else []

        # 3. EXPLAIN ANALYZE
        explain_q = f"""
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT 
            p.id,
            p.original_name AS name,
            p.unified_category AS category,
            p.sources,
            similarity(p.normalized_name, normalize_arabic_text('{kw}')) AS similarity,
            round(
                (6371000 * 2 * asin(sqrt(
                    power(sin(radians(p.lat - {CENTER_LAT}) / 2), 2) + 
                    cos(radians({CENTER_LAT})) * cos(radians(p.lat)) * 
                    power(sin(radians(p.lon - {CENTER_LON}) / 2), 2)
                )))::numeric, 1
            )::double precision AS distance_meters,
            p.lat,
            p.lon
        FROM places_eval p
        WHERE p.governorate_code = '{GOV_CODE}'
          AND (p.normalized_name % normalize_arabic_text('{kw}') 
               OR p.normalized_name ILIKE ('%' || normalize_arabic_text('{kw}') || '%'))
        ORDER BY similarity(p.normalized_name, normalize_arabic_text('{kw}')) DESC, distance_meters ASC
        LIMIT 20;
        """
        explain_raw = run_psql(explain_q)
        explain_json = json.loads(explain_raw)[0]
        exec_time_ms = explain_json.get("Execution Time")
        plan_time_ms = explain_json.get("Planning Time")

        # Photon baseline
        p_info = photon_data.get(kw, {}).get("photon", {})
        photon_total = p_info.get("total_count", 0)
        photon_najaf = p_info.get("najaf_count", 0)
        photon_latency = p_info.get("latency_ms", 0)

        results[kw] = {
            "keyword": kw,
            "places_db_total_count": total_count,
            "places_db_top5": top5,
            "places_db_planning_ms": plan_time_ms,
            "places_db_exec_ms": exec_time_ms,
            "explain_plan_summary": {
                "node_type": explain_json.get("Plan", {}).get("Node Type"),
                "shared_hit_blocks": explain_json.get("Plan", {}).get("Shared Hit Blocks")
            },
            "photon_total_count": photon_total,
            "photon_najaf_count": photon_najaf,
            "photon_latency_ms": photon_latency
        }

    return results


def evaluate_typos() -> Dict[str, Any]:
    typo_results = {}
    for typo, target in TYPOS_5:
        print(f"Testing typo: {typo} (target: {target})...")
        count_q = f"""
        SELECT count(*) 
        FROM places_eval 
        WHERE governorate_code = '{GOV_CODE}' 
          AND (normalized_name % normalize_arabic_text('{typo}') 
               OR normalized_name ILIKE ('%' || normalize_arabic_text('{typo}') || '%'));
        """
        total_count = int(run_psql(count_q))

        top5_q = f"""
        SELECT json_agg(row_to_json(r))
        FROM (
            SELECT id, name, category, sources, similarity, distance_meters, lat, lon
            FROM search_places_eval('{typo}', '{GOV_CODE}', {CENTER_LAT}, {CENTER_LON})
            LIMIT 5
        ) r;
        """
        top5_raw = run_psql(top5_q)
        top5 = json.loads(top5_raw) if top5_raw and top5_raw != "" else []

        typo_results[typo] = {
            "typo": typo,
            "intended_target": target,
            "normalized": run_psql(f"SELECT normalize_arabic_text('{typo}');"),
            "matches_found": total_count,
            "top5": top5,
            "found_target_places": len(top5) > 0
        }
    return typo_results


def benchmark_latency(reps: int = 20) -> Dict[str, Any]:
    print(f"Running latency benchmark via PostgreSQL function: {len(KEYWORDS_15)} keywords x {reps} repetitions...")
    raw = run_psql(f"SELECT benchmark_search_queries({reps});")
    return json.loads(raw)


def get_server_metrics() -> Dict[str, Any]:
    uptime = run_remote_sh("uptime")
    free_m = run_remote_sh("free -m")
    
    # DB size metrics
    size_q = """
    SELECT json_build_object(
        'total_rows', (SELECT count(*) FROM places_eval),
        'table_size', pg_size_pretty(pg_relation_size('places_eval')),
        'indexes_size', pg_size_pretty(pg_indexes_size('places_eval')),
        'total_size', pg_size_pretty(pg_total_relation_size('places_eval')),
        'index_details', (
            SELECT json_agg(json_build_object(
                'index_name', i.relname,
                'index_size', pg_size_pretty(pg_relation_size(i.oid))
            ))
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            WHERE t.relname = 'places_eval'
        )
    );
    """
    db_metrics = json.loads(run_psql(size_q))

    # Production baseline
    prod_q = "SELECT json_build_object('bookings', (SELECT count(*) FROM bookings), 'rides_total', (SELECT count(*) FROM rides), 'rides_with_driver', (SELECT count(*) FROM rides WHERE driver_id IS NOT NULL));"
    cmd = [
        "ssh", "-o", "StrictHostKeyChecking=no", SSH_HOST,
        f"sudo -u postgres psql -d taxiwisam -t -A -c {subprocess.list2cmdline([prod_q])}"
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    prod_baseline = json.loads(res.stdout.strip())

    return {
        "uptime": uptime,
        "memory_free_m": free_m,
        "db_metrics": db_metrics,
        "prod_baseline": prod_baseline
    }


def main():
    print("Starting places evaluation...")
    server_metrics = get_server_metrics()
    print("Server metrics collected.")

    keyword_results = evaluate_keywords()
    print("15 keywords evaluated.")

    typo_results = evaluate_typos()
    print("5 typos evaluated.")

    bench_results = benchmark_latency(reps=20)
    print("Latency benchmark completed.")

    full_report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "server_metrics": server_metrics,
        "keywords_15": keyword_results,
        "typos_5": typo_results,
        "latency_benchmark": bench_results
    }

    out_path = "tawseela-web/scripts/evaluation/places_eval_report.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(full_report, f, ensure_ascii=False, indent=2)
    print(f"Report written to {out_path}")


if __name__ == "__main__":
    main()
