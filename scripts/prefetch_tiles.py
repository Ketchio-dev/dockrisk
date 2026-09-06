#!/usr/bin/env python3
"""Warm the SATELLITE tile cache for the demo: the Southern Ontario region at zooms 7-10 and the two demo
facilities (Milton, London) at zooms 11-16. Run once the night before; afterwards the satellite toggle
works even if the venue connection drops. (OSM street tiles are fetched by the browser directly — their
usage policy forbids proxying/bulk download — so they are not prefetched.)

    python3 scripts/prefetch_tiles.py [http://localhost:3000]
"""
import math
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
REGION = (42.95, -81.45, 44.45, -78.20)
SPOTS = [(43.5290, -79.8560), (42.9980, -81.1880), (43.5183, -79.8774), (42.9849, -81.2453)]  # demo DCs + Milton/London centroids


def tile(lat, lon, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def urls():
    seen = set()
    for z in range(7, 11):
        x0, y1 = tile(REGION[0], REGION[1], z); x1, y0 = tile(REGION[2], REGION[3], z)
        for x in range(min(x0, x1), max(x0, x1) + 1):
            for y in range(min(y0, y1), max(y0, y1) + 1):
                seen.add((z, x, y))
    for lat, lon in SPOTS:
        for z in range(11, 17):
            cx, cy = tile(lat, lon, z)
            r = 1 if z < 14 else 2
            for x in range(cx - r, cx + r + 1):
                for y in range(cy - r, cy + r + 1):
                    seen.add((z, x, y))
    for z, x, y in sorted(seen):
        yield f"{BASE}/tiles/sat/{z}/{y}/{x}"


def fetch(u):
    try:
        with urllib.request.urlopen(u, timeout=20) as r:
            return r.headers.get("x-tile-cache", "?")
    except Exception as e:
        return f"ERR {e}"


if __name__ == "__main__":
    us = list(urls())
    print(f"{len(us)} tiles…", flush=True)
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(fetch, us))
    from collections import Counter
    print(Counter(r.split()[0] for r in res))
