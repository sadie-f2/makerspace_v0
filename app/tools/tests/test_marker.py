"""
Tests for provenance marker read/write in dxf_to_svg.py.
Requires ezdxf (already installed system-wide).
"""

import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from dxf_to_svg import read_marker, write_marker, LAYER_FP_MARKER

import ezdxf


def _make_doc_with_marker(marker_text, min_x=0.0, max_y=100.0):
    """Create an in-memory DXF document with a provenance marker."""
    doc = ezdxf.new()
    msp = doc.modelspace()
    write_marker(msp, doc, marker_text, min_x, max_y)
    return doc


class TestWriteMarker:
    def test_creates_fp_marker_layer(self):
        doc = ezdxf.new()
        msp = doc.modelspace()
        write_marker(msp, doc, "fp1.rev1", 0.0, 100.0)
        assert LAYER_FP_MARKER in doc.layers

    def test_adds_text_entity(self):
        doc = ezdxf.new()
        msp = doc.modelspace()
        write_marker(msp, doc, "fp1.rev1", 0.0, 100.0)
        texts = [e for e in msp if e.dxftype() == "TEXT" and e.dxf.layer == LAYER_FP_MARKER]
        assert len(texts) == 1
        assert texts[0].dxf.text == "fp1.rev1"

    def test_marker_position_near_top_left(self):
        doc = ezdxf.new()
        msp = doc.modelspace()
        min_x, max_y = 5.0, 200.0
        write_marker(msp, doc, "marker", min_x, max_y)
        texts = [e for e in msp if e.dxftype() == "TEXT" and e.dxf.layer == LAYER_FP_MARKER]
        ix, iy = texts[0].dxf.insert.x, texts[0].dxf.insert.y
        assert abs(ix - (min_x + 0.5)) < 0.01
        assert abs(iy - (max_y - 1.0)) < 0.01

    def test_does_not_duplicate_layer(self):
        doc = ezdxf.new()
        msp = doc.modelspace()
        write_marker(msp, doc, "m1", 0.0, 100.0)
        write_marker(msp, doc, "m2", 0.0, 100.0)
        # Two entities, but still one layer definition
        layer_count = sum(1 for l in doc.layers if l.dxf.name == LAYER_FP_MARKER)
        assert layer_count == 1


class TestReadMarker:
    def test_reads_back_written_marker(self, tmp_path):
        marker = "fpABC.revXYZ"
        doc = _make_doc_with_marker(marker)
        dxf_path = str(tmp_path / "test.dxf")
        doc.saveas(dxf_path)
        assert read_marker(dxf_path) == marker

    def test_returns_none_when_no_marker(self, tmp_path):
        doc = ezdxf.new()
        dxf_path = str(tmp_path / "empty.dxf")
        doc.saveas(dxf_path)
        assert read_marker(dxf_path) is None

    def test_marker_with_dots_in_ids(self, tmp_path):
        # IDs use CUID format like "clxyzabc123"
        marker = "clhello123world.clrevision456"
        doc = _make_doc_with_marker(marker)
        dxf_path = str(tmp_path / "dotted.dxf")
        doc.saveas(dxf_path)
        assert read_marker(dxf_path) == marker

    def test_ignores_text_on_other_layers(self, tmp_path):
        doc = ezdxf.new()
        msp = doc.modelspace()
        # TEXT on default layer 0, not fp_marker
        msp.add_text("noise", dxfattribs={"layer": "0", "insert": (0, 0), "height": 1.0})
        dxf_path = str(tmp_path / "noise.dxf")
        doc.saveas(dxf_path)
        assert read_marker(dxf_path) is None

    def test_empty_marker_text_treated_as_absent(self, tmp_path):
        doc = ezdxf.new()
        msp = doc.modelspace()
        # Blank text on fp_marker layer
        if LAYER_FP_MARKER not in doc.layers:
            doc.layers.add(LAYER_FP_MARKER, color=9)
        msp.add_text("   ", dxfattribs={"layer": LAYER_FP_MARKER, "insert": (0, 0), "height": 0.5})
        dxf_path = str(tmp_path / "blank.dxf")
        doc.saveas(dxf_path)
        assert read_marker(dxf_path) is None
