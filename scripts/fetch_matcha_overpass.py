#!/usr/bin/env python3
"""
Fetch Toronto matcha / tea places from OpenStreetMap via Overpass API.
No API key required — 100% free.

Usage:
    python fetch_matcha_overpass.py

Output:
    toronto_matcha_places.csv  — ready to import into the `places` table

Import into Postgres:
    docker compose exec db psql -U matcha -d matchadb -c \
      "\copy places (osm_id, name, address, lat, lng, cached_at) \
       FROM '/tmp/toronto_matcha_places.csv' CSV HEADER;"
Optional Mapillary enrichment:
    export MAPILLARY_TOKEN="your_token_here"   # free at mapillary.com/developer
    python fetch_matcha_overpass.py
    # Places with coordinates will get a street-level photo where available.
"""

import csv
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# Force UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
MAPILLARY_URL = "https://graph.mapillary.com/images"
MAPILLARY_TOKEN = os.environ.get("MAPILLARY_TOKEN", "")

# Toronto bounding box: south, west, north, east
TORONTO_BBOX = (43.58, -79.64, 43.86, -79.12)

OUTPUT_FILE = "toronto_matcha_places.csv"
CSV_FIELDS = ["id", "osm_id", "name", "address", "lat", "lng", "image_url", "cached_at"]

# Search terms matched against OSM name tags (case-insensitive regex)
NAME_PATTERNS = "matcha|tea house|tea room|japanese tea|sencha|ceremonial"

# Overpass queries — cast a wide net then filter by name
QUERIES = [
    # Cafes whose name mentions matcha/tea
    f"""node["amenity"="cafe"]["name"~"{NAME_PATTERNS}",i]{str(TORONTO_BBOX)};""",
    f"""way["amenity"="cafe"]["name"~"{NAME_PATTERNS}",i]{str(TORONTO_BBOX)};""",
    # Tea shops
    f"""node["shop"="tea"]{str(TORONTO_BBOX)};""",
    f"""way["shop"="tea"]{str(TORONTO_BBOX)};""",
    # cuisine=matcha or cuisine=japanese_tea
    f"""node["amenity"="cafe"]["cuisine"~"matcha|japanese_tea",i]{str(TORONTO_BBOX)};""",
    f"""way["amenity"="cafe"]["cuisine"~"matcha|japanese_tea",i]{str(TORONTO_BBOX)};""",
]

# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

def get(url: str, params: dict = None, headers: dict = None, retries: int = 3) -> dict | list | None:
    """Simple GET with retries."""
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers or {
                "User-Agent": "RateMatcha/1.0 (matcha review app; fetch script)"
            })
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if attempt < retries:
                time.sleep(2 * attempt)
            else:
                raise
    return None


def fetch_mapillary_image(lat: float, lng: float) -> str:
    """Return the URL of a nearby Mapillary image within ~200 m, or empty string."""
    if not MAPILLARY_TOKEN or lat is None or lng is None:
        return ""
    # Build a ~200 m bounding box (closeto is unreliable; bbox works consistently)
    delta_lat = 0.0018   # ~200 m
    delta_lng = 0.0025   # ~200 m at Toronto's latitude
    bbox = f"{lng - delta_lng},{lat - delta_lat},{lng + delta_lng},{lat + delta_lat}"
    try:
        data = get(
            MAPILLARY_URL,
            params={
                "fields": "id,thumb_2048_url",
                "bbox": bbox,
                "limit": 1,
            },
            headers={
                "Authorization": f"OAuth {MAPILLARY_TOKEN}",
                "User-Agent": "RateMatcha/1.0",
            },
        )
        if data and data.get("data"):
            return data["data"][0].get("thumb_2048_url", "")
    except Exception:
        pass
    return ""


def post(url: str, data: str, retries: int = 3) -> dict:
    encoded = data.encode("utf-8")
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(
                url,
                data=encoded,
                headers={"Content-Type": "application/x-www-form-urlencoded",
                         "User-Agent": "RateMatcha/1.0 (matcha review app; fetch script)"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if attempt < retries:
                wait = 5 * attempt
                print(f"\n  ⚠ Attempt {attempt} failed ({e}), retrying in {wait}s…", flush=True)
                time.sleep(wait)
            else:
                raise


# ---------------------------------------------------------------------------
# Overpass helpers
# ---------------------------------------------------------------------------

def build_query(statements: list[str]) -> str:
    body = "\n  ".join(statements)
    return f"[out:json][timeout:60];\n(\n  {body}\n);\nout body;"


def fetch_elements(statements: list[str]) -> list[dict]:
    query = build_query(statements)
    payload = urllib.parse.urlencode({"data": query})
    data = post(OVERPASS_URL, payload)
    return data.get("elements", [])


def build_address(tags: dict, default_city: str = "Toronto") -> str:
    parts = []
    if tags.get("addr:housenumber") and tags.get("addr:street"):
        parts.append(f"{tags['addr:housenumber']} {tags['addr:street']}")
    elif tags.get("addr:street"):
        parts.append(tags["addr:street"])
    city = tags.get("addr:city", default_city)
    parts.append(city)
    if tags.get("addr:postcode"):
        parts.append(tags["addr:postcode"])
    return ", ".join(parts)


def element_to_row(el: dict) -> dict | None:
    tags = el.get("tags", {})
    name = tags.get("name", "").strip()
    if not name:
        return None

    osm_type = el["type"]   # node or way
    osm_id = f"{osm_type}/{el['id']}"

    # Coordinates — nodes have lat/lon directly; ways have a centroid via "center"
    if osm_type == "node":
        lat = el.get("lat")
        lng = el.get("lon")
    else:
        center = el.get("center", {})
        lat = center.get("lat")
        lng = center.get("lon")

    return {
        "id": "",
        "osm_id": osm_id,
        "name": name,
        "address": build_address(tags),
        "lat": lat or "",
        "lng": lng or "",
        "image_url": "",
        "cached_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("🍵  Toronto Matcha Places — Overpass Fetcher (no API key needed)")
    print("=" * 60)

    # ── Step 1: fetch ────────────────────────────────────────────────────────
    print(f"\n[1/2] Querying Overpass API…", flush=True)
    try:
        elements = fetch_elements(QUERIES)
    except Exception as e:
        sys.exit(f"\n✗ Overpass query failed: {e}")

    print(f"  ✓ {len(elements)} raw elements returned")

    # ── Step 2: deduplicate & convert ────────────────────────────────────────
    seen: set[str] = set()
    rows: list[dict] = []

    for el in elements:
        row = element_to_row(el)
        if row is None:
            continue
        key = row["osm_id"]
        if key in seen:
            continue
        seen.add(key)
        rows.append(row)

    print(f"  ✓ {len(rows)} unique named places after dedup")

    if not rows:
        print("\n⚠ No results found. OSM may have limited data for this area.")
        print("  The app's built-in Overpass search (via the API) uses a broader")
        print("  'around' query and may return more results at runtime.")
        return

    # ── Step 2b: Mapillary photo enrichment (optional) ───────────────────────
    if MAPILLARY_TOKEN:
        coords_count = sum(1 for r in rows if r["lat"] and r["lng"])
        print(f"\n[2/3] Fetching Mapillary photos ({coords_count} places with coordinates)…")
        photos_found = 0
        for i, row in enumerate(rows, 1):
            lat, lng = row.get("lat"), row.get("lng")
            if not lat or not lng:
                print(f"  [{i:02d}/{len(rows)}] {row['name']} … skipped (no coordinates)")
                continue
            print(f"  [{i:02d}/{len(rows)}] {row['name']} …", end=" ", flush=True)
            url = fetch_mapillary_image(float(lat), float(lng))
            if url:
                row["image_url"] = url
                photos_found += 1
                print("📷")
            else:
                print("—")
            time.sleep(0.15)   # stay within free-tier rate limits
        print(f"  ✓ {photos_found} photos found")
        step_label = "[3/3]"
    else:
        print("\n💡 Tip: set MAPILLARY_TOKEN to auto-fetch street-level photos.")
        step_label = "[2/2]"

    # ── Write CSV ────────────────────────────────────────────────────────────
    print(f"\n{step_label} Writing CSV → {OUTPUT_FILE}")
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  ✓ Done — {len(rows)} rows written to {OUTPUT_FILE}\n")

    print("─" * 60)
    print("💡 Import into Postgres (two options):\n")
    print("Option A — copy file into container then import:")
    print(f"  docker compose cp scripts/{OUTPUT_FILE} db:/tmp/")
    print(f"  docker compose exec db psql -U matcha -d matchadb -c \\")
    print(f'    "\\copy places (osm_id, name, address, lat, lng, cached_at) FROM \'/tmp/{OUTPUT_FILE}\' CSV HEADER;"')
    print()
    print("Option B — pipe directly (no file copy needed):")
    print(f"  cat scripts/{OUTPUT_FILE} | docker compose exec -T db psql -U matcha -d matchadb -c \\")
    print(f'    "\\copy places (osm_id, name, address, lat, lng, cached_at) FROM STDIN CSV HEADER;"')
    print()
    print("Note: duplicate osm_ids are skipped automatically (ON CONFLICT DO NOTHING).")
    print("      Add that clause if your places table has a unique index on osm_id.")


if __name__ == "__main__":
    main()
