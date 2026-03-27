#!/usr/bin/env python3
"""
dxf_to_svg.py — convert a makerspace DXF floor plan to an interactive SVG.

Usage:
    python tools/dxf_to_svg.py --input drawing.dxf --output public/floorplans/building.svg
    python tools/dxf_to_svg.py --input drawing.dxf --output out.svg --output-dxf labeled.dxf --width 1200

Layer conventions expected in the DXF:
    0            — building envelope (LINE entities)
    studio       — studio unit block INSERTs (blocks: s50-l, s50-p)
    shop         — closed LWPOLYLINE perimeters of shop areas
    shop_label   — TEXT entities inside each shop (value = shop space_id, e.g. "wood_shop")

Studio numbering:
    Studios are numbered 1–N ordered west→east (X ascending) then north→south (Y descending).
    space_id format: "studio-1", "studio-2", …

DXF label output (--output-dxf):
    Writes a copy of the input DXF with TEXT entities added on layer "studio_label",
    one per studio, placed at the unit centroid, containing its assigned number.
"""

import sys
import math
import argparse
import xml.etree.ElementTree as ET
from collections import defaultdict

try:
    import ezdxf
except ImportError:
    sys.exit("ezdxf not installed — run: pip install ezdxf")


# ── Layers ────────────────────────────────────────────────────────────────────

LAYER_ENVELOPE    = "0"
LAYER_STUDIO      = "studio"
LAYER_SHOP        = "shop"
LAYER_SHOP_LABEL  = "shop_label"
LAYER_STUDIO_LABEL = "studio_label"

# ── Styling ───────────────────────────────────────────────────────────────────

STYLE_ENVELOPE    = "fill:none;stroke:#333;stroke-width:2"
STYLE_SHOP        = "fill:#e5e7eb;stroke:#4a6fa5;stroke-width:1.5"
STYLE_STUDIO      = "fill:#e5e7eb;stroke:#2e7d4f;stroke-width:1"
STYLE_LABEL_SHOP  = "font-family:sans-serif;font-size:10px;fill:#333;pointer-events:none"
STYLE_LABEL_STUDIO = "font-family:sans-serif;font-size:8px;fill:#1a5c32;pointer-events:none;text-anchor:middle;dominant-baseline:middle"


# ── Geometry helpers ──────────────────────────────────────────────────────────

def pt2(pt):
    return (float(pt[0]), float(pt[1]))


def bbox_points(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def centroid(polygon):
    cx = sum(p[0] for p in polygon) / len(polygon)
    cy = sum(p[1] for p in polygon) / len(polygon)
    return cx, cy


def point_in_polygon(px, py, polygon):
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def winding_order(corners):
    """Sort corners into CCW polygon order around their centroid."""
    cx, cy = centroid(corners)
    return sorted(corners, key=lambda p: math.atan2(p[1] - cy, p[0] - cx))


def points_to_svg_poly(pts, tx):
    return " ".join(f"{tx(x,y)[0]:.2f},{tx(x,y)[1]:.2f}" for x, y in pts)


def lines_to_svg_path(segments, tx):
    eps = 0.01
    endpoints = {i: list(seg) for i, seg in enumerate(segments)}

    def snap(a, b):
        return math.hypot(a[0] - b[0], a[1] - b[1]) < eps

    def find_next(end, remaining):
        for i in remaining:
            s, e = endpoints[i]
            if snap(end, s): return i, e
            if snap(end, e): return i, s
        return None, None

    remaining = set(range(len(segments)))
    paths = []
    while remaining:
        idx = min(remaining)
        remaining.remove(idx)
        chain = list(endpoints[idx])
        while True:
            nxt, end = find_next(chain[-1], remaining)
            if nxt is None: break
            remaining.remove(nxt)
            chain.append(end)
        parts = []
        for i, pt in enumerate(chain):
            sx, sy = tx(pt[0], pt[1])
            parts.append(f"{'M' if i == 0 else 'L'}{sx:.2f},{sy:.2f}")
        if snap(chain[0], chain[-1]):
            parts.append("Z")
        paths.append("".join(parts))
    return " ".join(paths)


def resolve_studio_corners(insert):
    """Return corner points (model space) for a studio INSERT."""
    block_name = insert.dxf.name.lower()
    ins_x, ins_y = pt2(insert.dxf.insert)

    try:
        virtual = list(insert.virtual_entities())
    except Exception:
        virtual = []

    pts = []
    for ve in virtual:
        if ve.dxftype() == "LINE":
            pts.append(pt2(ve.dxf.start))
            pts.append(pt2(ve.dxf.end))

    if not pts:
        # Fallback: known block dimensions
        dims = {"s50-l": (8.0, 6.0), "s50-p": (6.0, 8.0)}
        w, h = dims.get(block_name, (8.0, 6.0))
        rot = math.radians(getattr(insert.dxf, "rotation", 0.0))
        for lx, ly in [(0,0),(w,0),(w,h),(0,h)]:
            pts.append((
                ins_x + lx * math.cos(rot) - ly * math.sin(rot),
                ins_y + lx * math.sin(rot) + ly * math.cos(rot),
            ))

    # Deduplicate
    seen, corners = set(), []
    for p in pts:
        k = (round(p[0], 4), round(p[1], 4))
        if k not in seen:
            seen.add(k)
            corners.append(p)

    return corners


# ── Core conversion ───────────────────────────────────────────────────────────

def convert(dxf_path, svg_path, dxf_out_path=None, target_width=1000):
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    # ── 1. Building envelope → coordinate transform ────────────────────────
    envelope_lines = [
        (pt2(e.dxf.start), pt2(e.dxf.end))
        for e in msp
        if e.dxftype() == "LINE" and e.dxf.layer == LAYER_ENVELOPE
    ]
    if not envelope_lines:
        sys.exit(f"No LINEs on layer '{LAYER_ENVELOPE}' — cannot derive bounds.")

    all_pts = [p for seg in envelope_lines for p in seg]
    min_x, min_y, max_x, max_y = bbox_points(all_pts)
    scale = target_width / (max_x - min_x)
    svg_h = (max_y - min_y) * scale

    def tx(x, y):
        return (x - min_x) * scale, (max_y - y) * scale

    # ── 2. Read existing studio labels from studio_label layer ────────────
    # Maps (rounded centroid x, y) → existing number
    existing_labels = {}
    for e in msp:
        if e.dxftype() != "TEXT" or e.dxf.layer != LAYER_STUDIO_LABEL:
            continue
        try:
            num = int(e.dxf.text.strip())
        except ValueError:
            continue
        pos = pt2(e.dxf.insert)
        existing_labels[(round(pos[0], 1), round(pos[1], 1))] = num

    def find_existing_number(cx, cy, tolerance=1.0):
        """Return existing label number if a label centroid is within tolerance."""
        for (lx, ly), num in existing_labels.items():
            if math.hypot(lx - cx, ly - cy) <= tolerance:
                return num
        return None

    # ── 3. Collect studios, match to existing labels ───────────────────────
    raw_studios = []
    for e in msp:
        if e.dxftype() != "INSERT" or e.dxf.layer != LAYER_STUDIO:
            continue
        corners = resolve_studio_corners(e)
        if len(corners) < 3:
            print(f"  Warning: could not resolve studio at {pt2(e.dxf.insert)}, skipping", file=sys.stderr)
            continue
        cx, cy = centroid(corners)
        existing_num = find_existing_number(cx, cy)
        raw_studios.append({
            "insert": e,
            "corners": winding_order(corners),
            "cx": cx,
            "cy": cy,
            "block": e.dxf.name.lower(),
            "existing_num": existing_num,
        })

    # Assign numbers: keep existing, assign new ones (max+1 onwards) in
    # west→east, north→south order
    max_existing = max((s["existing_num"] for s in raw_studios if s["existing_num"]), default=0)
    new_studios = sorted(
        [s for s in raw_studios if s["existing_num"] is None],
        key=lambda s: (-round(s["cy"]), round(s["cx"], 1)),
    )
    next_num = max_existing + 1
    for s in new_studios:
        s["existing_num"] = next_num
        next_num += 1

    studios = []
    for s in raw_studios:
        s["number"] = s["existing_num"]
        s["space_id"] = f"studio-{s['number']}"
        studios.append(s)

    new_count = len(new_studios)
    existing_count = len(studios) - new_count

    # ── 3. Shop labels ─────────────────────────────────────────────────────
    shop_labels = []
    for e in msp:
        if e.dxftype() in ("TEXT", "MTEXT") and e.dxf.layer == LAYER_SHOP_LABEL:
            val = (e.dxf.text if e.dxftype() == "TEXT" else e.text).strip()
            shop_labels.append((val, pt2(e.dxf.insert)))

    # ── 4. Build SVG ───────────────────────────────────────────────────────
    svg = ET.Element("svg", {
        "xmlns": "http://www.w3.org/2000/svg",
        "width": str(target_width),
        "height": f"{svg_h:.2f}",
        "viewBox": f"0 0 {target_width} {svg_h:.2f}",
    })
    g_envelope = ET.SubElement(svg, "g", {"id": "envelope"})
    g_shops    = ET.SubElement(svg, "g", {"id": "shops"})
    g_studios  = ET.SubElement(svg, "g", {"id": "studios"})

    # Envelope
    ET.SubElement(g_envelope, "path", {
        "d": lines_to_svg_path(envelope_lines, tx),
        "style": STYLE_ENVELOPE,
    })

    # Shops
    shops_found = []
    for e in msp:
        if e.dxftype() != "LWPOLYLINE" or e.dxf.layer != LAYER_SHOP:
            continue
        if not e.closed:
            print(f"  Warning: unclosed LWPOLYLINE on '{LAYER_SHOP}' skipped", file=sys.stderr)
            continue
        pts = [pt2(p) for p in e.get_points("xy")]
        space_id = None
        for label_val, label_pos in shop_labels:
            if point_in_polygon(label_pos[0], label_pos[1], pts):
                space_id = label_val
                break
        if space_id is None:
            cx, cy = centroid(pts)
            print(f"  Warning: shop at ({cx:.1f},{cy:.1f}) has no label", file=sys.stderr)
        attrs = {"points": points_to_svg_poly(pts, tx), "style": STYLE_SHOP}
        if space_id:
            attrs["data-space-id"] = space_id
            attrs["data-type"] = "shop"
        ET.SubElement(g_shops, "polygon", attrs)
        if space_id:
            cx, cy = centroid(pts)
            scx, scy = tx(cx, cy)
            t = ET.SubElement(g_shops, "text", {
                "x": f"{scx:.1f}", "y": f"{scy:.1f}",
                "text-anchor": "middle", "dominant-baseline": "middle",
                "style": STYLE_LABEL_SHOP,
            })
            t.text = space_id.replace("_", " ")
            shops_found.append(space_id)

    # Studios
    for s in studios:
        ET.SubElement(g_studios, "polygon", {
            "points": points_to_svg_poly(s["corners"], tx),
            "style": STYLE_STUDIO,
            "data-space-id": s["space_id"],
            "data-block": s["block"],
            "data-type": "studio_unit",
        })
        scx, scy = tx(s["cx"], s["cy"])
        t = ET.SubElement(g_studios, "text", {
            "x": f"{scx:.1f}", "y": f"{scy:.1f}",
            "style": STYLE_LABEL_STUDIO,
        })
        t.text = str(s["number"])

    # Write SVG
    ET.indent(svg, space="  ")
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    with open(svg_path, "wb") as f:
        f.write(b'<?xml version="1.0" encoding="utf-8"?>\n')
        ET.ElementTree(svg).write(f, encoding="utf-8", xml_declaration=False)

    print(f"Wrote {svg_path}")
    print(f"  Envelope : {len(envelope_lines)} lines")
    print(f"  Shops    : {len(shops_found)} — {', '.join(shops_found)}")
    print(f"  Studios  : {len(studios)} ({existing_count} existing, {new_count} new)")

    # ── 5. Labeled DXF output ──────────────────────────────────────────────
    if dxf_out_path:
        # Add studio_label layer if it doesn't exist
        if LAYER_STUDIO_LABEL not in doc.layers:
            doc.layers.add(LAYER_STUDIO_LABEL, color=3)

        # Only write labels for newly assigned studios — existing ones are already in the file
        for s in new_studios:
            msp.add_text(
                str(s["number"]),
                dxfattribs={
                    "layer": LAYER_STUDIO_LABEL,
                    "insert": (s["cx"], s["cy"]),
                    "height": 1.0,
                    "halign": 4,
                    "valign": 0,
                    "align_point": (s["cx"], s["cy"]),
                },
            )

        doc.saveas(dxf_out_path)
        print(f"Wrote {dxf_out_path} (+{new_count} new labels on layer '{LAYER_STUDIO_LABEL}')")


def main():
    parser = argparse.ArgumentParser(description="Convert DXF floor plan to SVG")
    parser.add_argument("--input",      required=True,  help="Input .dxf file")
    parser.add_argument("--output",     required=True,  help="Output .svg file")
    parser.add_argument("--output-dxf", default=None,   help="Output labeled .dxf file (optional)")
    parser.add_argument("--width",      type=int, default=1000, help="SVG width px (default 1000)")
    args = parser.parse_args()
    convert(args.input, args.output, dxf_out_path=args.output_dxf, target_width=args.width)


if __name__ == "__main__":
    main()
