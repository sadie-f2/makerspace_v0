#!/usr/bin/env python3
"""
dxf_survey.py — inspect a DXF file and report what's in it.

Usage:
    python tools/dxf_survey.py path/to/drawing.dxf

Reports layers, block definitions, INSERT entities, LWPOLYLINEs,
and anything that looks like a studio or shop placement.
"""

import sys
import math
from collections import defaultdict

try:
    import ezdxf
except ImportError:
    sys.exit("ezdxf not installed — run: pip install ezdxf")


STUDIO_BLOCKS = {"s50-l", "s50-p"}
SHOP_SUFFIX = "_shop"


def fmt_pt(pt):
    return f"({pt[0]:.2f}, {pt[1]:.2f})"


def bbox(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def area(points):
    """Shoelace formula for polygon area."""
    n = len(points)
    a = 0.0
    for i in range(n):
        j = (i + 1) % n
        a += points[i][0] * points[j][1]
        a -= points[j][0] * points[i][1]
    return abs(a) / 2.0


def survey(path):
    print(f"\n{'='*60}")
    print(f"  DXF Survey: {path}")
    print(f"{'='*60}\n")

    try:
        doc = ezdxf.readfile(path)
    except Exception as e:
        sys.exit(f"Could not read DXF: {e}")

    print(f"DXF version : {doc.dxfversion}")
    print(f"Encoding    : {doc.encoding}\n")

    # ── Layers ────────────────────────────────────────────────────────────────
    layers = list(doc.layers)
    print(f"LAYERS ({len(layers)})")
    print(f"  {'Name':<20} Color")
    for layer in sorted(layers, key=lambda l: l.dxf.name):
        color = getattr(layer.dxf, "color", "?")
        print(f"  {layer.dxf.name:<20} {color}")
    print()

    # ── Block definitions ──────────────────────────────────────────────────────
    block_names = [b.name for b in doc.blocks if not b.name.startswith("*")]
    print(f"BLOCK DEFINITIONS ({len(block_names)})")
    for name in sorted(block_names):
        block = doc.blocks[name]
        entity_types = defaultdict(int)
        for e in block:
            entity_types[e.dxftype()] += 1
        summary = ", ".join(f"{k}×{v}" for k, v in sorted(entity_types.items()))
        print(f"  {name:<20} {summary}")
    print()

    # ── INSERT entities ────────────────────────────────────────────────────────
    msp = doc.modelspace()
    inserts = [e for e in msp if e.dxftype() == "INSERT"]

    by_block = defaultdict(list)
    for ins in inserts:
        by_block[ins.dxf.name].append(ins)

    print(f"INSERTS ({len(inserts)} total across {len(by_block)} block types)")
    for bname in sorted(by_block):
        instances = by_block[bname]
        layers_used = set(i.dxf.layer for i in instances)
        tag = ""
        if bname.lower() in STUDIO_BLOCKS:
            tag = "  ← studio"
        elif bname.lower().endswith(SHOP_SUFFIX):
            tag = "  ← shop"
        print(f"  {bname:<22} ×{len(instances):<4} layers: {', '.join(sorted(layers_used))}{tag}")
    print()

    # ── Studios ───────────────────────────────────────────────────────────────
    studios = [e for e in inserts if e.dxf.name.lower() in STUDIO_BLOCKS]
    print(f"STUDIOS ({len(studios)})")
    if studios:
        print(f"  {'Block':<10} {'Layer':<12} {'Position':<22} {'Rotation':>8}")
        for s in studios:
            rot = getattr(s.dxf, "rotation", 0.0)
            print(f"  {s.dxf.name:<10} {s.dxf.layer:<12} {fmt_pt(s.dxf.insert):<22} {rot:>8.1f}°")
    else:
        print("  (none found — expected block names: s50-l, s50-p on any layer)")
    print()

    # ── Shops (by name suffix) ─────────────────────────────────────────────────
    shops_by_insert = [e for e in inserts if e.dxf.name.lower().endswith(SHOP_SUFFIX)]
    print(f"SHOPS — by INSERT block name ending in '{SHOP_SUFFIX}' ({len(shops_by_insert)})")
    if shops_by_insert:
        print(f"  {'Block':<20} {'Layer':<12} {'Position'}")
        for s in shops_by_insert:
            print(f"  {s.dxf.name:<20} {s.dxf.layer:<12} {fmt_pt(s.dxf.insert)}")
    else:
        print("  (none found)")
    print()

    # ── LWPOLYLINEs ───────────────────────────────────────────────────────────
    polys = [e for e in msp if e.dxftype() == "LWPOLYLINE"]
    by_layer = defaultdict(list)
    for p in polys:
        by_layer[p.dxf.layer].append(p)

    print(f"LWPOLYLINES ({len(polys)} total)")
    for layer_name in sorted(by_layer):
        plist = by_layer[layer_name]
        closed = sum(1 for p in plist if p.closed)
        print(f"  Layer '{layer_name}': {len(plist)} polylines ({closed} closed)")
        for p in plist[:5]:  # show first 5 per layer
            pts = list(p.get_points("xy"))
            if pts:
                bb = bbox(pts)
                w = bb[2] - bb[0]
                h = bb[3] - bb[1]
                a = area(pts) if p.closed else 0.0
                print(f"    {'closed' if p.closed else 'open  '} "
                      f"pts={len(pts):>3}  "
                      f"w={w:.1f}' h={h:.1f}'  "
                      f"area≈{a:.0f} sf  "
                      f"origin={fmt_pt(pts[0])}")
        if len(plist) > 5:
            print(f"    ... and {len(plist)-5} more")
    if not polys:
        print("  (none)")
    print()

    # ── TEXT / MTEXT ──────────────────────────────────────────────────────────
    texts = [e for e in msp if e.dxftype() in ("TEXT", "MTEXT")]
    by_layer_t = defaultdict(list)
    for t in texts:
        by_layer_t[t.dxf.layer].append(t)

    print(f"TEXT / MTEXT ({len(texts)} total)")
    for layer_name in sorted(by_layer_t):
        tlist = by_layer_t[layer_name]
        print(f"  Layer '{layer_name}': {len(tlist)} entities")
        for t in tlist[:8]:
            val = t.dxf.text if t.dxftype() == "TEXT" else t.text
            val = val.strip().replace("\n", " ")[:40]
            pos = t.dxf.insert
            print(f"    {fmt_pt(pos)}  \"{val}\"")
        if len(tlist) > 8:
            print(f"    ... and {len(tlist)-8} more")
    if not texts:
        print("  (none)")
    print()

    # ── LINE entities ──────────────────────────────────────────────────────────
    lines = [e for e in msp if e.dxftype() == "LINE"]
    by_layer_l = defaultdict(list)
    for l in lines:
        by_layer_l[l.dxf.layer].append(l)

    print(f"LINES ({len(lines)} total)")
    for layer_name in sorted(by_layer_l):
        llist = by_layer_l[layer_name]
        print(f"  Layer '{layer_name}': {len(llist)} lines")
        for l in llist:
            s, e = l.dxf.start, l.dxf.end
            length = math.hypot(e[0]-s[0], e[1]-s[1])
            print(f"    {fmt_pt(s)} → {fmt_pt(e)}  length={length:.2f}")
    if not lines:
        print("  (none)")
    print()

    # ── Everything else ────────────────────────────────────────────────────────
    all_types = defaultdict(int)
    for e in msp:
        all_types[e.dxftype()] += 1
    known = {"INSERT", "LWPOLYLINE", "TEXT", "MTEXT", "LINE"}
    other = {k: v for k, v in all_types.items() if k not in known}
    if other:
        print("OTHER ENTITY TYPES")
        for k, v in sorted(other.items()):
            print(f"  {k:<20} ×{v}")
        print()

    print(f"{'='*60}\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(f"Usage: {sys.argv[0]} <file.dxf>")
    survey(sys.argv[1])
