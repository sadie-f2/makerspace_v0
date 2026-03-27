"""
Tests for pure geometry functions in dxf_to_svg.py.
No DXF files or ezdxf required for these tests.
"""

import math
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from dxf_to_svg import (
    pt2,
    bbox_points,
    centroid,
    point_in_polygon,
    winding_order,
    points_to_svg_poly,
    lines_to_svg_path,
)


# ── pt2 ───────────────────────────────────────────────────────────────────────

class TestPt2:
    def test_returns_float_tuple(self):
        assert pt2((1, 2)) == (1.0, 2.0)

    def test_converts_strings(self):
        x, y = pt2(("3.5", "7.0"))
        assert x == 3.5
        assert y == 7.0

    def test_passes_through_floats(self):
        assert pt2((0.0, 0.0)) == (0.0, 0.0)


# ── bbox_points ───────────────────────────────────────────────────────────────

class TestBboxPoints:
    def test_axis_aligned_square(self):
        pts = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]
        assert bbox_points(pts) == (0.0, 0.0, 10.0, 10.0)

    def test_single_point(self):
        assert bbox_points([(5.0, 3.0)]) == (5.0, 3.0, 5.0, 3.0)

    def test_negative_coordinates(self):
        pts = [(-5.0, -3.0), (5.0, 3.0)]
        assert bbox_points(pts) == (-5.0, -3.0, 5.0, 3.0)

    def test_unsorted_input(self):
        pts = [(3.0, 7.0), (1.0, 2.0), (9.0, 4.0)]
        min_x, min_y, max_x, max_y = bbox_points(pts)
        assert min_x == 1.0
        assert min_y == 2.0
        assert max_x == 9.0
        assert max_y == 7.0


# ── centroid ──────────────────────────────────────────────────────────────────

class TestCentroid:
    def test_square(self):
        pts = [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)]
        cx, cy = centroid(pts)
        assert cx == 2.0
        assert cy == 2.0

    def test_triangle(self):
        pts = [(0.0, 0.0), (6.0, 0.0), (3.0, 3.0)]
        cx, cy = centroid(pts)
        assert cx == 3.0
        assert cy == 1.0

    def test_single_point(self):
        assert centroid([(7.0, 8.0)]) == (7.0, 8.0)


# ── point_in_polygon ──────────────────────────────────────────────────────────

class TestPointInPolygon:
    SQUARE = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]

    def test_centre_is_inside(self):
        assert point_in_polygon(5.0, 5.0, self.SQUARE)

    def test_corner_of_bbox_is_outside(self):
        assert not point_in_polygon(-1.0, -1.0, self.SQUARE)

    def test_far_outside(self):
        assert not point_in_polygon(100.0, 100.0, self.SQUARE)

    def test_point_near_edge_inside(self):
        assert point_in_polygon(0.5, 5.0, self.SQUARE)

    def test_concave_polygon(self):
        # L-shape: points at (0,0),(10,0),(10,5),(5,5),(5,10),(0,10)
        l_shape = [(0.0, 0.0), (10.0, 0.0), (10.0, 5.0),
                   (5.0, 5.0), (5.0, 10.0), (0.0, 10.0)]
        assert point_in_polygon(2.0, 2.0, l_shape)       # inside lower-left
        assert not point_in_polygon(8.0, 8.0, l_shape)    # inside notch (outside L)


# ── winding_order ─────────────────────────────────────────────────────────────

class TestWindingOrder:
    def test_square_corners_sorted_ccw(self):
        # Scrambled corners of unit square
        corners = [(1.0, 0.0), (0.0, 1.0), (1.0, 1.0), (0.0, 0.0)]
        ordered = winding_order(corners)
        # Should be 4 points, all original corners present
        assert len(ordered) == 4
        assert set(map(tuple, ordered)) == set(map(tuple, corners))
        # Verify CCW: cross product of consecutive edges should be >= 0
        n = len(ordered)
        for i in range(n):
            p0 = ordered[i]
            p1 = ordered[(i + 1) % n]
            p2 = ordered[(i + 2) % n]
            cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0])
            assert cross >= 0, f"Non-CCW at index {i}"

    def test_already_ordered_input_unchanged(self):
        corners = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
        ordered = winding_order(corners)
        assert len(ordered) == 4


# ── points_to_svg_poly ────────────────────────────────────────────────────────

class TestPointsToSvgPoly:
    def identity_tx(self, x, y):
        return (x, y)

    def test_basic_output(self):
        pts = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0)]
        result = points_to_svg_poly(pts, self.identity_tx)
        assert result == "0.00,0.00 10.00,0.00 10.00,10.00"

    def test_single_point(self):
        result = points_to_svg_poly([(5.5, 3.3)], self.identity_tx)
        assert result == "5.50,3.30"

    def test_with_scale_transform(self):
        def tx(x, y):
            return (x * 2, y * 2)
        result = points_to_svg_poly([(1.0, 1.0)], tx)
        assert result == "2.00,2.00"


# ── lines_to_svg_path ─────────────────────────────────────────────────────────

class TestLinesToSvgPath:
    def identity_tx(self, x, y):
        return (x, y)

    def test_single_open_segment(self):
        segs = [((0.0, 0.0), (10.0, 0.0))]
        path = lines_to_svg_path(segs, self.identity_tx)
        assert path.startswith("M")
        assert "L" in path
        assert "Z" not in path

    def test_closed_square(self):
        segs = [
            ((0.0, 0.0), (10.0, 0.0)),
            ((10.0, 0.0), (10.0, 10.0)),
            ((10.0, 10.0), (0.0, 10.0)),
            ((0.0, 10.0), (0.0, 0.0)),
        ]
        path = lines_to_svg_path(segs, self.identity_tx)
        assert "Z" in path

    def test_reversed_segment_is_chained(self):
        # Second segment starts at the END of the first (reversed join)
        segs = [
            ((0.0, 0.0), (5.0, 0.0)),
            ((10.0, 0.0), (5.0, 0.0)),  # reversed, snaps to end of first
        ]
        path = lines_to_svg_path(segs, self.identity_tx)
        # Should form one chain, not two separate M commands
        assert path.count("M") == 1

    def test_disconnected_segments_produce_multiple_chains(self):
        segs = [
            ((0.0, 0.0), (5.0, 0.0)),
            ((10.0, 0.0), (15.0, 0.0)),  # gap — separate chain
        ]
        path = lines_to_svg_path(segs, self.identity_tx)
        assert path.count("M") == 2

    def test_empty_input(self):
        path = lines_to_svg_path([], self.identity_tx)
        assert path == ""
