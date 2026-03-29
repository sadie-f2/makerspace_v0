#!/usr/bin/env python3
"""
dxf_to_svg.py — convert a makerspace DXF floor plan to an interactive SVG.

Usage:
    python tools/dxf_to_svg.py --input drawing.dxf --output public/floorplans/building.svg
    python tools/dxf_to_svg.py --input drawing.dxf --output out.svg --output-dxf labeled.dxf --marker fpid.revid
    python tools/dxf_to_svg.py --input drawing.dxf --output out.svg --config space_types.json

    # Read the provenance marker from a DXF (for upload validation):
    python tools/dxf_to_svg.py --read-marker --input labeled.dxf

Config-driven mode (--config):
    Pass a JSON array of space type definitions exported from the app's
    SpaceTypeConfig table.  When omitted, DEFAULT_CONFIG is used (studios +
    shops only — backward-compatible behaviour).

    Each entry shape:
    {
        "slug":              "shelf-standard",   // data-type value in SVG
        "mode":              "insert_multilevel", // see PROCESSING MODES below
        "dxfLayer":          "shelf_l",          // layer name (or prefix for multilevel)
        "dxfLabelLayer":     "storage_label",    // label/code TEXT layer
        "dxfBlockPattern":   "sb-std",           // block name prefix filter (optional)
        "color":             "#fde8d8",          // SVG fill hex
        "blockDims":         {"sb-std-l": [24, 12]} // fallback dims in DXF units (optional)
    }

Processing modes:
    insert_numbered   — INSERT blocks + sequential integer labels (studios)
    insert_coded      — INSERT blocks + alphanumeric bay codes (lockers, pallets, carts)
    insert_multilevel — INSERT blocks on layerPrefix+N layers, bay codes, level numbers (shelves)
    polyline_labeled  — closed LWPOLYLINE + point-in-polygon label match (shops, rooms)

DXF layer conventions (defaults when no --config provided):
    0             — building envelope (LINE entities)
    studio        — studio unit INSERT blocks (s50-l, s50-p)
    shop          — closed LWPOLYLINE perimeters of shop areas
    shop_label    — TEXT entities inside each shop (value = space_id)
    studio_label  — TEXT number labels for studio sequential numbering
    storage       — pallet/locker/cart INSERT blocks
    storage_label — TEXT bay codes for storage INSERT blocks
    shelf_l1…     — shelf bay INSERT blocks per vertical level
    fp_marker     — provenance TEXT written by --output-dxf (do not edit)
"""

import sys
import math
import json
import re
import argparse
import xml.etree.ElementTree as ET
from collections import defaultdict

try:
    import ezdxf
except ImportError:
    sys.exit("ezdxf not installed — run: pip install ezdxf")


# ── Constants ─────────────────────────────────────────────────────────────────

LAYER_ENVELOPE = "0"
LAYER_FP_MARKER = "fp_marker"

STYLE_ENVELOPE = "fill:none;stroke:#333;stroke-width:2"
STYLE_LABEL_STUDIO = (
    "font-family:sans-serif;font-size:8px;fill:#1a5c32;"
    "pointer-events:none;text-anchor:middle;dominant-baseline:middle"
)
STYLE_LABEL_STORAGE = (
    "font-family:sans-serif;font-size:7px;fill:#5a3e00;"
    "pointer-events:none;text-anchor:middle;dominant-baseline:middle"
)
STYLE_LABEL_SHOP = (
    "font-family:sans-serif;font-size:10px;fill:#333;pointer-events:none"
)


def _style(color: str, stroke: str = "#666", stroke_width: str = "1") -> str:
    return f"fill:{color};stroke:{stroke};stroke-width:{stroke_width}"


# ── Default config (backward-compatible — studios + shops only) ───────────────

DEFAULT_CONFIG = [
    {
        "slug": "studio_unit",
        "mode": "insert_numbered",
        "dxfLayer": "studio",
        "dxfLabelLayer": "studio_label",
        "dxfBlockPattern": None,
        "color": "#e5e7eb",
        "blockDims": {"s50-l": [8.0, 6.0], "s50-p": [6.0, 8.0]},
    },
    {
        "slug": "shop",
        "mode": "polyline_labeled",
        "dxfLayer": "shop",
        "dxfLabelLayer": "shop_label",
        "color": "#dbeafe",
    },
]


def load_config(config_path):
    if config_path is None:
        return DEFAULT_CONFIG
    with open(config_path) as f:
        return json.load(f)


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
    return " ".join(f"{tx(x, y)[0]:.2f},{tx(x, y)[1]:.2f}" for x, y in pts)


def lines_to_svg_path(segments, tx):
    eps = 0.01
    endpoints = {i: list(seg) for i, seg in enumerate(segments)}

    def snap(a, b):
        return math.hypot(a[0] - b[0], a[1] - b[1]) < eps

    def find_next(end, remaining):
        for i in remaining:
            s, e = endpoints[i]
            if snap(end, s):
                return i, e
            if snap(end, e):
                return i, s
        return None, None

    remaining = set(range(len(segments)))
    paths = []
    while remaining:
        idx = min(remaining)
        remaining.remove(idx)
        chain = list(endpoints[idx])
        while True:
            nxt, end = find_next(chain[-1], remaining)
            if nxt is None:
                break
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


def resolve_insert_corners(insert, block_dims_fallback=None):
    """
    Return polygon corner points (model space) for an INSERT entity.
    Tries virtual_entities() first; falls back to block_dims_fallback if provided.
    Returns [] on failure.
    """
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
        elif ve.dxftype() == "LWPOLYLINE":
            pts.extend(pt2(p) for p in ve.get_points("xy"))

    if not pts and block_dims_fallback:
        dims = block_dims_fallback
        # Try exact name first, then prefix match
        dim = dims.get(block_name)
        if dim is None:
            for k, v in dims.items():
                if block_name.startswith(k.lower()):
                    dim = v
                    break
        if dim:
            w, h = float(dim[0]), float(dim[1])
            rot = math.radians(getattr(insert.dxf, "rotation", 0.0))
            for lx, ly in [(0, 0), (w, 0), (w, h), (0, h)]:
                pts.append((
                    ins_x + lx * math.cos(rot) - ly * math.sin(rot),
                    ins_y + lx * math.sin(rot) + ly * math.cos(rot),
                ))

    if not pts:
        return []

    seen, corners = set(), []
    for p in pts:
        k = (round(p[0], 4), round(p[1], 4))
        if k not in seen:
            seen.add(k)
            corners.append(p)

    return corners


# ── Marker helpers ────────────────────────────────────────────────────────────

def read_marker(dxf_path):
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    for e in msp:
        if e.dxftype() == "TEXT" and e.dxf.layer == LAYER_FP_MARKER:
            val = e.dxf.text.strip()
            if val:
                return val
    return None


def write_marker(msp, doc, marker_text, min_x, max_y):
    if LAYER_FP_MARKER not in doc.layers:
        doc.layers.add(LAYER_FP_MARKER, color=9)
    msp.add_text(
        marker_text,
        dxfattribs={
            "layer": LAYER_FP_MARKER,
            "insert": (min_x + 0.5, max_y - 1.0),
            "height": 0.5,
        },
    )


# ── Label layer reading ───────────────────────────────────────────────────────

def read_numbered_labels(msp, label_layer):
    """
    Read existing sequential integer labels from a TEXT layer.
    Returns dict: (rounded_x, rounded_y) → int
    """
    labels = {}
    for e in msp:
        if e.dxftype() != "TEXT" or e.dxf.layer != label_layer:
            continue
        try:
            num = int(e.dxf.text.strip())
        except ValueError:
            continue
        pos = pt2(e.dxf.insert)
        labels[(round(pos[0], 1), round(pos[1], 1))] = num
    return labels


def read_code_labels(msp, label_layer):
    """
    Read existing alphanumeric bay codes from a TEXT layer.
    Returns dict: (rounded_x, rounded_y) → str
    """
    codes = {}
    for e in msp:
        if e.dxftype() != "TEXT" or e.dxf.layer != label_layer:
            continue
        val = e.dxf.text.strip()
        if val:
            pos = pt2(e.dxf.insert)
            codes[(round(pos[0], 1), round(pos[1], 1))] = val
    return codes


def find_label_near(label_map, cx, cy, tolerance=1.0):
    for (lx, ly), val in label_map.items():
        if math.hypot(lx - cx, ly - cy) <= tolerance:
            return val
    return None


# ── Bay code tracker ──────────────────────────────────────────────────────────

class BayCodeTracker:
    """
    Manages bay code assignment across all INSERT-based storage types that
    share the same label layer.  Preserves existing codes; assigns new ones
    in A1, A2 … A26, B1 … order.
    """

    def __init__(self, existing_codes: dict):
        # existing_codes: (rounded_x, rounded_y) → code string
        self.existing = dict(existing_codes)
        self._assigned = set(existing_codes.values())
        self._counter = 0
        self._new_assignments: list[tuple[float, float, str]] = []  # (cx, cy, code)

    def find(self, cx, cy, tolerance=1.0):
        return find_label_near(self.existing, cx, cy, tolerance)

    def assign_new(self, cx, cy):
        code = self._next_code()
        self.existing[(round(cx, 1), round(cy, 1))] = code
        self._assigned.add(code)
        self._new_assignments.append((cx, cy, code))
        return code

    def new_assignments(self):
        return list(self._new_assignments)

    def _next_code(self):
        while True:
            zone = chr(ord("A") + self._counter // 26)
            n = (self._counter % 26) + 1
            code = f"{zone}{n}"
            self._counter += 1
            if code not in self._assigned:
                return code


# ── Processing modes ──────────────────────────────────────────────────────────

def process_insert_numbered(msp, parent_group, type_cfg, tx, doc_layers, new_label_writes):
    """
    Studios and similar: INSERT blocks, sequential integer labels.
    Emits <polygon data-space-id="studio-N" data-type="{slug}" ...>
    """
    layer = type_cfg["dxfLayer"]
    label_layer = type_cfg.get("dxfLabelLayer")
    block_pattern = type_cfg.get("dxfBlockPattern")
    color = type_cfg.get("color", "#e5e7eb")
    block_dims = type_cfg.get("blockDims", {})
    slug = type_cfg["slug"]

    existing_labels = read_numbered_labels(msp, label_layer) if label_layer else {}

    raw = []
    for e in msp:
        if e.dxftype() != "INSERT" or e.dxf.layer != layer:
            continue
        bname = e.dxf.name.lower()
        if block_pattern and not bname.startswith(block_pattern.lower()):
            continue
        corners = resolve_insert_corners(e, block_dims)
        if len(corners) < 3:
            cx_raw, cy_raw = pt2(e.dxf.insert)
            print(f"  Warning: could not resolve {slug} at ({cx_raw:.1f},{cy_raw:.1f}), skipping", file=sys.stderr)
            continue
        cx, cy = centroid(corners)
        existing_num = find_label_near(existing_labels, cx, cy)
        raw.append({
            "corners": winding_order(corners),
            "cx": cx, "cy": cy,
            "block": bname,
            "existing_num": existing_num,
        })

    # Assign new sequential numbers
    max_existing = max((s["existing_num"] for s in raw if s["existing_num"] is not None), default=0)
    new_items = sorted(
        [s for s in raw if s["existing_num"] is None],
        key=lambda s: (-round(s["cy"]), round(s["cx"], 1)),
    )
    next_num = max_existing + 1
    for s in new_items:
        s["existing_num"] = next_num
        next_num += 1

    style = _style(color, "#2e7d4f", "1")
    for s in raw:
        n = s["existing_num"]
        space_id = f"{slug}-{n}"
        ET.SubElement(parent_group, "polygon", {
            "points": points_to_svg_poly(s["corners"], tx),
            "style": style,
            "data-space-id": space_id,
            "data-type": slug,
            "data-block": s["block"],
        })
        scx, scy = tx(s["cx"], s["cy"])
        t = ET.SubElement(parent_group, "text", {
            "x": f"{scx:.1f}", "y": f"{scy:.1f}",
            "style": STYLE_LABEL_STUDIO,
        })
        t.text = str(n)

    # Record new labels for DXF output
    if label_layer:
        for s in new_items:
            new_label_writes.setdefault(label_layer, []).append({
                "type": "numbered",
                "text": str(s["existing_num"]),
                "cx": s["cx"], "cy": s["cy"],
                "height": 1.0,
            })

    print(f"  {slug:<20}: {len(raw)} ({len(new_items)} new)", file=sys.stderr)
    return raw


def process_insert_coded(msp, parent_group, type_cfg, tx, bay_trackers, new_label_writes):
    """
    Floor-level storage: INSERT blocks + alphanumeric bay codes.
    Emits <polygon data-space-id="{slug}-A1" data-type="{slug}" data-bay="A1" ...>
    """
    layer = type_cfg["dxfLayer"]
    label_layer = type_cfg.get("dxfLabelLayer", "storage_label")
    block_pattern = type_cfg.get("dxfBlockPattern")
    color = type_cfg.get("color", "#fde8d8")
    block_dims = type_cfg.get("blockDims", {})
    slug = type_cfg["slug"]

    tracker = bay_trackers[label_layer]
    style = _style(color, "#a35c00", "1")
    count, new_count = 0, 0

    for e in msp:
        if e.dxftype() != "INSERT" or e.dxf.layer != layer:
            continue
        bname = e.dxf.name.lower()
        if block_pattern and not bname.startswith(block_pattern.lower()):
            continue
        corners = resolve_insert_corners(e, block_dims)
        if len(corners) < 3:
            cx_raw, cy_raw = pt2(e.dxf.insert)
            print(f"  Warning: could not resolve {slug} at ({cx_raw:.1f},{cy_raw:.1f}), skipping", file=sys.stderr)
            continue
        cx, cy = centroid(corners)
        code = tracker.find(cx, cy)
        is_new = code is None
        if is_new:
            code = tracker.assign_new(cx, cy)
            new_count += 1
        ET.SubElement(parent_group, "polygon", {
            "points": points_to_svg_poly(winding_order(corners), tx),
            "style": style,
            "data-space-id": f"{slug}-{code}",
            "data-type": slug,
            "data-block": bname,
            "data-bay": code,
        })
        scx, scy = tx(cx, cy)
        t = ET.SubElement(parent_group, "text", {
            "x": f"{scx:.1f}", "y": f"{scy:.1f}",
            "style": STYLE_LABEL_STORAGE,
        })
        t.text = code
        count += 1

    print(f"  {slug:<20}: {count} ({new_count} new)", file=sys.stderr)


def process_insert_multilevel(msp, svg_root, type_cfg, tx, bay_trackers, new_label_writes, all_layers):
    """
    Shelf bays: INSERT blocks on layerPrefix+N layers, with bay codes and level numbers.
    Emits per-level <g data-shelf-layer="shelf_l2" data-level="2" class="shelf-layer"> groups.
    """
    layer_prefix = type_cfg["dxfLayer"]  # e.g. "shelf_l"
    label_layer = type_cfg.get("dxfLabelLayer", "storage_label")
    block_pattern = type_cfg.get("dxfBlockPattern")
    color = type_cfg.get("color", "#fde8d8")
    block_dims = type_cfg.get("blockDims", {})
    slug = type_cfg["slug"]

    tracker = bay_trackers[label_layer]
    style = _style(color, "#a35c00", "1")

    # Find all matching level layers in the DXF
    level_pattern = re.compile(rf"^{re.escape(layer_prefix)}(\d+)$", re.IGNORECASE)
    level_layers = sorted(
        [(name, int(m.group(1))) for name in all_layers if (m := level_pattern.match(name))],
        key=lambda x: x[1],
    )

    if not level_layers:
        print(f"  {slug:<20}: no layers matching '{layer_prefix}N' found", file=sys.stderr)
        return

    outer_group = ET.SubElement(svg_root, "g", {"id": slug})
    total, total_new = 0, 0

    for layer_name, level in level_layers:
        level_group = ET.SubElement(outer_group, "g", {
            "data-shelf-layer": layer_name,
            "data-level": str(level),
            "class": "shelf-layer",
        })
        count, new_count = 0, 0

        for e in msp:
            if e.dxftype() != "INSERT" or e.dxf.layer != layer_name:
                continue
            bname = e.dxf.name.lower()
            if block_pattern and not bname.startswith(block_pattern.lower()):
                continue
            corners = resolve_insert_corners(e, block_dims)
            if len(corners) < 3:
                cx_raw, cy_raw = pt2(e.dxf.insert)
                print(f"  Warning: could not resolve {slug} level {level} at ({cx_raw:.1f},{cy_raw:.1f}), skipping", file=sys.stderr)
                continue
            cx, cy = centroid(corners)
            code = tracker.find(cx, cy)
            is_new = code is None
            if is_new:
                code = tracker.assign_new(cx, cy)
                new_count += 1
            ET.SubElement(level_group, "polygon", {
                "points": points_to_svg_poly(winding_order(corners), tx),
                "style": style,
                "data-space-id": f"shelf-{code}-l{level}",
                "data-type": slug,
                "data-block": bname,
                "data-bay": code,
                "data-level": str(level),
                "data-layer": layer_name,
            })
            scx, scy = tx(cx, cy)
            t = ET.SubElement(level_group, "text", {
                "x": f"{scx:.1f}", "y": f"{scy:.1f}",
                "style": STYLE_LABEL_STORAGE,
            })
            t.text = f"{code}·L{level}"
            count += 1

        total += count
        total_new += new_count

    print(f"  {slug:<20}: {total} across {len(level_layers)} levels ({total_new} new bays)", file=sys.stderr)


def process_polyline_labeled(msp, parent_group, type_cfg, tx):
    """
    Shops and rooms: closed LWPOLYLINE + point-in-polygon label lookup.
    Emits <polygon data-space-id="{label_value}" data-type="{slug}" ...>
    """
    layer = type_cfg["dxfLayer"]
    label_layer = type_cfg.get("dxfLabelLayer")
    color = type_cfg.get("color", "#dbeafe")
    slug = type_cfg["slug"]

    # Read labels
    labels = []
    if label_layer:
        for e in msp:
            if e.dxftype() in ("TEXT", "MTEXT") and e.dxf.layer == label_layer:
                val = (e.dxf.text if e.dxftype() == "TEXT" else e.text).strip()
                labels.append((val, pt2(e.dxf.insert)))

    style = _style(color, "#4a6fa5", "1.5")
    found = []
    for e in msp:
        if e.dxftype() != "LWPOLYLINE" or e.dxf.layer != layer:
            continue
        if not e.closed:
            print(f"  Warning: unclosed LWPOLYLINE on '{layer}' skipped", file=sys.stderr)
            continue
        pts = [pt2(p) for p in e.get_points("xy")]
        space_id = None
        for label_val, label_pos in labels:
            if point_in_polygon(label_pos[0], label_pos[1], pts):
                space_id = label_val
                break
        if space_id is None:
            cx, cy = centroid(pts)
            print(f"  Warning: {slug} at ({cx:.1f},{cy:.1f}) has no label — skipping data attributes", file=sys.stderr)
        attrs = {"points": points_to_svg_poly(pts, tx), "style": style}
        if space_id:
            attrs["data-space-id"] = space_id
            attrs["data-type"] = slug
        ET.SubElement(parent_group, "polygon", attrs)
        if space_id:
            cx, cy = centroid(pts)
            scx, scy = tx(cx, cy)
            t = ET.SubElement(parent_group, "text", {
                "x": f"{scx:.1f}", "y": f"{scy:.1f}",
                "text-anchor": "middle", "dominant-baseline": "middle",
                "style": STYLE_LABEL_SHOP,
            })
            t.text = space_id.replace("_", " ")
            found.append(space_id)

    print(f"  {slug:<20}: {len(found)} — {', '.join(found)}", file=sys.stderr)


# ── Core conversion ───────────────────────────────────────────────────────────

def convert(dxf_path, svg_path, config, dxf_out_path=None, target_width=1000, marker=None):
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    all_layers = {layer.dxf.name for layer in doc.layers}

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

    # ── 2. Build shared bay code trackers (one per label layer) ───────────
    # All insert_coded and insert_multilevel types sharing a label layer
    # share the same tracker so codes are unique across types.
    label_layers_needed = set()
    for t in config:
        if t.get("mode") in ("insert_coded", "insert_multilevel"):
            ll = t.get("dxfLabelLayer", "storage_label")
            label_layers_needed.add(ll)

    bay_trackers: dict[str, BayCodeTracker] = {}
    for ll in label_layers_needed:
        existing = read_code_labels(msp, ll)
        bay_trackers[ll] = BayCodeTracker(existing)

    # ── 3. Build SVG ───────────────────────────────────────────────────────
    svg = ET.Element("svg", {
        "xmlns": "http://www.w3.org/2000/svg",
        "width": str(target_width),
        "height": f"{svg_h:.2f}",
        "viewBox": f"0 0 {target_width} {svg_h:.2f}",
    })

    # Envelope group (always first)
    g_envelope = ET.SubElement(svg, "g", {"id": "envelope"})
    ET.SubElement(g_envelope, "path", {
        "d": lines_to_svg_path(envelope_lines, tx),
        "style": STYLE_ENVELOPE,
    })

    # ── 4. Process each type from config ───────────────────────────────────
    new_label_writes: dict[str, list] = {}  # label_layer → list of write descriptors

    for type_cfg in config:
        mode = type_cfg.get("mode")
        if not mode:
            print(f"  Warning: type '{type_cfg.get('slug')}' has no mode, skipping", file=sys.stderr)
            continue

        slug = type_cfg.get("slug", "unknown")

        if mode == "insert_numbered":
            g = ET.SubElement(svg, "g", {"id": slug})
            process_insert_numbered(msp, g, type_cfg, tx, all_layers, new_label_writes)

        elif mode == "insert_coded":
            g = ET.SubElement(svg, "g", {"id": slug})
            ll = type_cfg.get("dxfLabelLayer", "storage_label")
            process_insert_coded(msp, g, type_cfg, tx, bay_trackers, new_label_writes)

        elif mode == "insert_multilevel":
            # Creates its own nested group structure
            process_insert_multilevel(msp, svg, type_cfg, tx, bay_trackers, new_label_writes, all_layers)

        elif mode == "polyline_labeled":
            g = ET.SubElement(svg, "g", {"id": slug})
            process_polyline_labeled(msp, g, type_cfg, tx)

        else:
            print(f"  Warning: unknown mode '{mode}' for type '{slug}', skipping", file=sys.stderr)

    # ── 5. Write SVG ───────────────────────────────────────────────────────
    ET.indent(svg, space="  ")
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    with open(svg_path, "wb") as f:
        f.write(b'<?xml version="1.0" encoding="utf-8"?>\n')
        ET.ElementTree(svg).write(f, encoding="utf-8", xml_declaration=False)
    print(f"Wrote {svg_path}", file=sys.stderr)

    # ── 6. Labeled DXF output ──────────────────────────────────────────────
    if dxf_out_path:
        _write_labeled_dxf(doc, msp, new_label_writes, bay_trackers, config, marker, min_x, max_y, dxf_out_path)


def _write_labeled_dxf(doc, msp, new_label_writes, bay_trackers, config, marker, min_x, max_y, dxf_out_path):
    """Write a labeled copy of the DXF with new number labels and bay codes."""

    # Write new sequential number labels (studios etc.)
    for label_layer, writes in new_label_writes.items():
        if label_layer not in doc.layers:
            doc.layers.add(label_layer, color=3)
        for w in writes:
            if w["type"] == "numbered":
                msp.add_text(
                    w["text"],
                    dxfattribs={
                        "layer": label_layer,
                        "insert": (w["cx"], w["cy"]),
                        "height": w.get("height", 1.0),
                        "halign": 4,
                        "valign": 0,
                        "align_point": (w["cx"], w["cy"]),
                    },
                )

    # Write new bay code labels (storage types)
    for label_layer, tracker in bay_trackers.items():
        if label_layer not in doc.layers:
            doc.layers.add(label_layer, color=2)
        for cx, cy, code in tracker.new_assignments():
            msp.add_text(
                code,
                dxfattribs={
                    "layer": label_layer,
                    "insert": (cx, cy),
                    "height": 0.8,
                    "halign": 4,
                    "valign": 0,
                    "align_point": (cx, cy),
                },
            )

    if marker:
        write_marker(msp, doc, marker, min_x, max_y)

    doc.saveas(dxf_out_path)
    new_codes = sum(len(t.new_assignments()) for t in bay_trackers.values())
    marker_note = f", marker={marker}" if marker else ""
    print(f"Wrote {dxf_out_path} (+labels, +{new_codes} new bay codes{marker_note})", file=sys.stderr)


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Convert DXF floor plan to SVG")
    parser.add_argument("--input",        required=True,        help="Input .dxf file")
    parser.add_argument("--output",       default=None,         help="Output .svg file")
    parser.add_argument("--output-dxf",   default=None,         help="Output labeled .dxf file (optional)")
    parser.add_argument("--marker",       default=None,         help="Provenance marker to embed in --output-dxf")
    parser.add_argument("--width",        type=int, default=1000, help="SVG width px (default 1000)")
    parser.add_argument("--config",       default=None,         help="JSON config file from app DB (optional)")
    parser.add_argument("--read-marker",  action="store_true",  help="Read provenance marker from input DXF and exit")
    args = parser.parse_args()

    if args.read_marker:
        marker = read_marker(args.input)
        print(marker if marker else "NONE")
        return

    if not args.output:
        parser.error("--output is required unless --read-marker is set")

    config = load_config(args.config)
    convert(
        args.input,
        args.output,
        config,
        dxf_out_path=args.output_dxf,
        target_width=args.width,
        marker=args.marker,
    )


if __name__ == "__main__":
    main()
