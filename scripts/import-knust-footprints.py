#!/usr/bin/env python3
"""Build the KNUST footprint catalog and the hosted seed from an Overpass dump.

Reads a saved Overpass JSON (ways with geometry, plus entrance nodes) and writes:
  assets/campus-footprints.ts
  supabase/seed/knust_campus_footprints.sql

Unnamed footprints under 80 m² are left out. They are sheds and fragments, and
keeping them makes the seed too large to apply. Every named building is kept.
Rings are simplified to about 2.5 m and coordinates are rounded to 6 decimals.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/osm/knust.json")
JSON_OUT = ROOT / "assets" / "campus-footprints.ts"
SQL_OUT = ROOT / "supabase" / "seed" / "knust_campus_footprints.sql"

MIN_UNNAMED_M2 = 80
MIN_NAMED_M2 = 12
EPSILON_M = 2.5
ENTRANCE_M = 15
M_PER_DEG_LAT = 111_320


def metres_per_deg_lng(latitude: float) -> float:
    return M_PER_DEG_LAT * math.cos(math.radians(latitude))


def to_xy(origin, point):
    return (
        (point[0] - origin[0]) * metres_per_deg_lng(origin[1]),
        (point[1] - origin[1]) * M_PER_DEG_LAT,
    )


def dist_point_seg(p, a, b) -> float:
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    if len2 == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def douglas(points, epsilon: float):
    if len(points) < 3:
        return points
    origin = points[0]
    xy = [to_xy(origin, p) for p in points]
    keep = dp_mask(xy, epsilon)
    simplified = [points[i] for i, flag in enumerate(keep) if flag]
    return simplified if len(simplified) >= 3 else points[:3]


def dp_mask(xy, epsilon: float):
    n = len(xy)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        start, end = stack.pop()
        max_d = -1.0
        index = -1
        for i in range(start + 1, end):
            d = dist_point_seg(xy[i], xy[start], xy[end])
            if d > max_d:
                max_d = d
                index = i
        if index >= 0 and max_d > epsilon:
            keep[index] = True
            stack.append((start, index))
            stack.append((index, end))
    return keep


def ring_metrics(ring):
    origin = ring[0]
    local = [to_xy(origin, p) for p in ring]
    area = 0.0
    peri = 0.0
    best_len = -1.0
    best_axis = 90.0
    n = len(local)
    for i in range(n):
        a = local[i]
        b = local[(i + 1) % n]
        area += a[0] * b[1] - b[0] * a[1]
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        peri += length
        if length > best_len:
            best_len = length
            bearing = math.degrees(math.atan2(b[0] - a[0], b[1] - a[1])) % 360
            best_axis = bearing % 180
    return abs(area) / 2, peri, best_axis


def centroid(ring):
    return (
        sum(p[0] for p in ring) / len(ring),
        sum(p[1] for p in ring) / len(ring),
    )


def near(a, b) -> float:
    ox, oy = a
    return math.hypot((b[0] - ox) * metres_per_deg_lng(oy), (b[1] - oy) * M_PER_DEG_LAT)


def sql_str(value: str | None) -> str:
    if value is None:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    payload = json.loads(SRC.read_text())
    elements = payload.get("elements", [])
    entrances = []
    for element in elements:
        tags = element.get("tags") or {}
        if element.get("type") == "node" and "entrance" in tags and "lat" in element and "lon" in element:
            name = tags.get("name") or tags.get("ref") or "Entrance"
            entrances.append((element["lon"], element["lat"], name))

    buildings = []
    dropped_small = 0
    for element in elements:
        if element.get("type") != "way":
            continue
        geom = element.get("geometry") or []
        if len(geom) < 4:
            continue
        ring = [(round(p["lon"], 6), round(p["lat"], 6)) for p in geom]
        if ring[0] == ring[-1]:
            ring = ring[:-1]
        if len(ring) < 3:
            continue
        tags = element.get("tags") or {}
        name = tags.get("name") or tags.get("addr:housename") or None
        simplified = douglas(ring, EPSILON_M)
        if simplified[0] == simplified[-1]:
            simplified = simplified[:-1]
        if len(simplified) < 3:
            continue
        area, peri, axis = ring_metrics(simplified)
        if not math.isfinite(area) or area < (MIN_NAMED_M2 if name else MIN_UNNAMED_M2):
            dropped_small += 1
            continue
        if area > 500_000:
            continue
        centre = centroid(simplified)
        doors = []
        for lon, lat, label in entrances:
            if near(centre, (lon, lat)) > 400 and near(simplified[0], (lon, lat)) > 400:
                continue
            origin = simplified[0]
            local_ring = [to_xy(origin, p) for p in simplified]
            point = to_xy(origin, (lon, lat))
            gap = min(dist_point_seg(point, local_ring[i], local_ring[(i + 1) % len(local_ring)]) for i in range(len(local_ring)))
            inside = point_in_poly(point, local_ring)
            if inside or gap <= ENTRANCE_M:
                doors.append([label, round(lon, 6), round(lat, 6)])
        buildings.append(
            {
                "id": int(element["id"]),
                "name": name,
                "area": round(area, 1),
                "peri": round(peri, 1),
                "axis": round(axis, 1),
                "ring": [[p[0], p[1]] for p in simplified],
                "doors": doors,
                "lng": round(centre[0], 6),
                "lat": round(centre[1], 6),
            }
        )

    buildings.sort(key=lambda item: item["id"])
    pack = {
        "v": 1,
        "bbox": [6.655, -1.595, 6.698, -1.548],
        "note": "KNUST building outlines. Unnamed footprints under 80 m2 are omitted.",
        "items": [
            [b["id"], b["name"], b["area"], b["peri"], b["axis"], b["ring"], b["doors"], b["lat"], b["lng"]]
            for b in buildings
        ],
    }
    JSON_OUT.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(pack, separators=(",", ":"), ensure_ascii=False)
    JSON_OUT.write_text(
        "/** Generated by scripts/import-knust-footprints.py. Do not edit. */\n"
        "import type { FootprintPack } from '@/lib/campusFootprints';\n\n"
        f"export const campusFootprintPack: FootprintPack = {body};\n"
    )

    SQL_OUT.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "-- KNUST building outlines from OpenStreetMap.",
        "-- Apply after supabase/migrations/20261022113133_campus_footprints.sql.",
        "-- Unnamed footprints under 80 m2 are omitted. Named buildings are kept.",
        "-- Safe to re-run: rows update in place.",
        "begin;",
    ]
    batch: list[str] = []

    def flush() -> None:
        if not batch:
            return
        lines.append(
            "insert into public.campus_footprints "
            "(osm_id, name, latitude, longitude, footprint_geojson, area_m2, perimeter_m, entrances) values"
        )
        lines.append(",\n".join(batch))
        lines.append(
            "on conflict (osm_id) do update set "
            "name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude, "
            "footprint_geojson = excluded.footprint_geojson, area_m2 = excluded.area_m2, "
            "perimeter_m = excluded.perimeter_m, entrances = excluded.entrances;"
        )
        batch.clear()

    for building in buildings:
        closed = building["ring"] + [building["ring"][0]]
        geo = {"type": "Polygon", "coordinates": [closed]}
        doors = [
            {"name": door[0], "longitude": door[1], "latitude": door[2]}
            for door in building["doors"]
        ]
        batch.append(
            f"({building['id']}, {sql_str(building['name'])}, {building['lat']}, {building['lng']}, "
            f"{sql_str(json.dumps(geo, separators=(',', ':')))}::jsonb, {building['area']}, {building['peri']}, "
            f"{sql_str(json.dumps(doors, separators=(',', ':')))}::jsonb)"
        )
        if len(batch) >= 40:
            flush()
    flush()
    lines.append("commit;")
    lines.append("")
    SQL_OUT.write_text("\n".join(lines))
    named = sum(1 for b in buildings if b["name"])
    print(
        json.dumps(
            {
                "kept": len(buildings),
                "named": named,
                "dropped_small": dropped_small,
                "json_bytes": JSON_OUT.stat().st_size,
                "sql_bytes": SQL_OUT.stat().st_size,
                "entrances_attached": sum(len(b["doors"]) for b in buildings),
            }
        )
    )


def point_in_poly(point, ring) -> bool:
    x, y = point
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y):
            cross = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < cross:
                inside = not inside
        j = i
    return inside


if __name__ == "__main__":
    main()
