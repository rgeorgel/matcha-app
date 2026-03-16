#!/usr/bin/env python3
"""
Enrich places in the DB with image_url using Yelp (primary) and Mapillary (fallback).

Usage:
    # Install dependencies (one-time):
    pip install psycopg2-binary

    # Set API keys (at least one source required):
    export YELP_API_KEY="your_yelp_key"           # free at yelp.com/developers (500 calls/day)
    export MAPILLARY_TOKEN="your_mapillary_token"  # free at mapillary.com/developer

    # Run:
    python enrich_images.py

Resume: The script writes progress to enrich_images_progress.json.
        Interrupt anytime — re-running skips already-processed places.

Rate limits:
    Yelp free tier: 500 calls/day → 500 places/day (image_url returned in the search response).
    Mapillary: generous free tier, no hard limit for low volume.
"""

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
YELP_API_KEY     = os.environ.get("YELP_API_KEY", "jzauoQXEgpB5rrnbpQkHoqEVGHLLs5e3ceJ5Kezx3ELdLncAXuCT3R5QXCc0gyyHg_hsyv5JCnYmEm9JVtdDRMSN6tY4frMhlVLRym_3sJufrz6zv8y5qdvNw4O4aXYx")
MAPILLARY_TOKEN  = os.environ.get("MAPILLARY_TOKEN", "")

#DB_HOST = os.environ.get("DB_HOST", "localhost")
#DB_PORT = int(os.environ.get("DB_PORT", "8098"))
#DB_NAME = os.environ.get("DB_NAME", "matchadb")
#DB_USER = os.environ.get("DB_USER", "matcha")
#DB_PASS = os.environ.get("DB_PASS", "matchasecret")

DB_HOST = os.environ.get("DB_HOST", "40.233.93.102")
DB_PORT = int(os.environ.get("DB_PORT", "8098"))
DB_NAME = os.environ.get("DB_NAME", "matchadb")
DB_USER = os.environ.get("DB_USER", "matchaProd")
DB_PASS = os.environ.get("DB_PASS", "matchasecretProd")

YELP_SEARCH_URL = "https://api.yelp.com/v3/businesses/search"
MAPILLARY_URL   = "https://graph.mapillary.com/images"

PROGRESS_FILE = "enrich_images_progress.json"

# Delay between API calls (seconds) — keeps you polite and avoids rate limits
YELP_DELAY      = 0.3
MAPILLARY_DELAY = 0.2

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _get(url, params=None, headers=None, retries=3):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers or {
                "User-Agent": "RateMatcha/1.0 (image enrichment script)"
            })
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 401:
                return None   # bad key, handled by caller
            if e.code == 429:
                wait = 60
                print(f"\n  ⚠ Rate limited — waiting {wait}s…", flush=True)
                time.sleep(wait)
                continue
            if e.code in (404, 400):
                return None
            if attempt < retries:
                time.sleep(2 * attempt)
            else:
                return None
        except Exception:
            if attempt < retries:
                time.sleep(2 * attempt)
            else:
                return None
    return None


# ---------------------------------------------------------------------------
# Yelp  (1 call per place — image_url is in the search response directly)
# ---------------------------------------------------------------------------

def get_image_yelp(name, lat, lng):
    """Search Yelp for a business by name + coords. Returns image_url or None."""
    if not YELP_API_KEY or lat is None or lng is None:
        return None
    params = {
        "term": name,
        "latitude": lat,
        "longitude": lng,
        "radius": 500,   # metres — tight to match the right place
        "limit": 1,
    }
    data = _get(
        YELP_SEARCH_URL,
        params=params,
        headers={"Authorization": f"Bearer {YELP_API_KEY}", "Accept": "application/json"},
    )
    time.sleep(YELP_DELAY)
    if not data:
        return None
    businesses = data.get("businesses", [])
    if not businesses:
        return None
    image_url = businesses[0].get("image_url", "")
    return image_url or None


# ---------------------------------------------------------------------------
# Mapillary (free fallback — uses GPS coordinates)
# ---------------------------------------------------------------------------

def get_image_mapillary(lat, lng):
    """Return the URL of a nearby Mapillary image (~200 m radius) or None."""
    if not MAPILLARY_TOKEN or lat is None or lng is None:
        return None
    delta_lat = 0.0018   # ~200 m
    delta_lng = 0.0025
    bbox = f"{lng - delta_lng},{lat - delta_lat},{lng + delta_lng},{lat + delta_lat}"
    data = _get(
        MAPILLARY_URL,
        params={"fields": "id,thumb_2048_url", "bbox": bbox, "limit": 1},
        headers={"Authorization": f"OAuth {MAPILLARY_TOKEN}", "User-Agent": "RateMatcha/1.0"},
    )
    time.sleep(MAPILLARY_DELAY)
    if data and data.get("data"):
        return data["data"][0].get("thumb_2048_url")
    return None


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_db_connection():
    try:
        import psycopg2
    except ImportError:
        sys.exit(
            "\n✗ psycopg2 is not installed.\n"
            "  Run:  pip install psycopg2-binary\n"
        )
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASS
    )


def fetch_places_without_images(conn):
    """Return list of (id, name, lat, lng) for active places with no image_url."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id::text, name, lat, lng
            FROM places
            WHERE (image_url IS NULL OR image_url = '')
              AND lat IS NOT NULL
              AND lng IS NOT NULL
              AND status = 'active'
            ORDER BY name
        """)
        return cur.fetchall()


def update_image_url(conn, place_id, image_url):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE places SET image_url = %s WHERE id = %s::uuid",
            (image_url, place_id),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Progress checkpoint
# ---------------------------------------------------------------------------

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            return json.load(f)
    return {"done": [], "skipped": []}


def save_progress(progress):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("🍵  Rate Matcha — Image Enrichment Script")
    print("=" * 50)

    # Validate at least one image source is available
    sources = []
    if YELP_API_KEY:
        sources.append("Yelp (primary)")
    if MAPILLARY_TOKEN:
        sources.append("Mapillary (fallback)")

    if not sources:
        sys.exit(
            "\n✗ No image source configured.\n"
            "  Set at least one:\n"
            "    export YELP_API_KEY='your_key'        # yelp.com/developers (free, 500/day)\n"
            "    export MAPILLARY_TOKEN='your_token'   # mapillary.com/developer\n"
        )

    print(f"\n  Image sources: {', '.join(sources)}")
    print(f"  Database:      {DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}")

    # Connect
    print("\n[1/4] Connecting to database…", flush=True)
    try:
        conn = get_db_connection()
        print("  ✓ Connected")
    except Exception as e:
        sys.exit(f"\n✗ DB connection failed: {e}\n"
                 f"  Make sure the DB is running: docker compose up -d db")

    # Fetch places needing images
    print("\n[2/4] Fetching places without images…", flush=True)
    places = fetch_places_without_images(conn)
    print(f"  ✓ {len(places)} places need images")

    if not places:
        print("\n✓ All places already have images. Nothing to do.")
        conn.close()
        return

    # Load progress (resume support)
    progress = load_progress()
    done_ids  = set(progress["done"])
    skip_ids  = set(progress["skipped"])

    remaining = [p for p in places if p[0] not in done_ids and p[0] not in skip_ids]
    already_done = len(done_ids) + len(skip_ids)
    print(f"  ✓ {already_done} already processed (resuming), {len(remaining)} remaining")

    if not remaining:
        print("\n✓ All done! Run again after adding new places.")
        conn.close()
        return

    # Enrich
    print(f"\n[3/4] Enriching {len(remaining)} places…")
    updated  = 0
    skipped  = 0
    errors   = 0

    for i, (place_id, name, lat, lng) in enumerate(remaining, 1):
        label = f"[{i}/{len(remaining)}] {name[:45]:<45}"
        print(f"  {label}", end=" … ", flush=True)

        image_url = None

        # Try Yelp first (returns image_url in a single search call)
        if YELP_API_KEY:
            image_url = get_image_yelp(name, lat, lng)

        # Fallback to Mapillary (street-level, free)
        if not image_url and MAPILLARY_TOKEN:
            image_url = get_image_mapillary(lat, lng)

        if image_url:
            try:
                update_image_url(conn, place_id, image_url)
                progress["done"].append(place_id)
                updated += 1
                print("📷 found")
            except Exception as e:
                print(f"✗ DB error: {e}")
                errors += 1
        else:
            progress["skipped"].append(place_id)
            skipped += 1
            print("— no image")

        # Save checkpoint every 10 places
        if i % 10 == 0:
            save_progress(progress)
            print(f"\n  💾 Progress saved ({updated} updated, {skipped} skipped so far)\n")

    # Final save
    save_progress(progress)

    # Summary
    print(f"\n[4/4] Done!")
    print(f"  ✓ Updated:  {updated}")
    print(f"  — Skipped:  {skipped} (no image found)")
    if errors:
        print(f"  ✗ Errors:   {errors}")
    print(f"\n  Progress saved to {PROGRESS_FILE}")
    print(f"  Re-run anytime to process newly added places.")

    conn.close()


if __name__ == "__main__":
    main()
