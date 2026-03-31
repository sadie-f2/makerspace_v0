"""
Tests for --version-label in dxf_to_svg.py.
Verifies that the version string appears in both the labeled DXF and the SVG output.
"""

import sys
import os
import xml.etree.ElementTree as ET
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from dxf_to_svg import convert, LAYER_FP_VERSION, VERSION_PADDING_PX, DEFAULT_CONFIG

import ezdxf


def _make_minimal_dxf(tmp_path) -> str:
    """Create a minimal DXF with a building envelope and return its path."""
    doc = ezdxf.new()
    msp = doc.modelspace()
    # Simple 100×50 rectangle on layer "0" (envelope)
    corners = [(0, 0), (100, 0), (100, 50), (0, 50)]
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        msp.add_line(a, b, dxfattribs={"layer": "0"})
    path = str(tmp_path / "test.dxf")
    doc.saveas(path)
    return path


class TestVersionLabelSVG:
    def test_svg_contains_version_text(self, tmp_path):
        dxf_path = _make_minimal_dxf(tmp_path)
        svg_path  = str(tmp_path / "out.svg")
        label     = "fpABC.revXYZ - Rev 1 · 2026-03-30"
        convert(dxf_path, svg_path, DEFAULT_CONFIG, version_label=label)

        tree = ET.parse(svg_path)
        ns   = {"svg": "http://www.w3.org/2000/svg"}
        texts = tree.findall(".//svg:text", ns) or tree.findall(".//text")
        texts_flat = [e for e in tree.getroot().iter() if e.tag.endswith("text")]
        found = any(e.text == label for e in texts_flat)
        assert found, f"Version label not found in SVG text elements"

    def test_svg_has_data_fp_version_attribute(self, tmp_path):
        dxf_path = _make_minimal_dxf(tmp_path)
        svg_path  = str(tmp_path / "out.svg")
        label     = "fpABC.revXYZ - Rev 2 · 2026-03-30"
        convert(dxf_path, svg_path, DEFAULT_CONFIG, version_label=label)

        tree  = ET.parse(svg_path)
        texts = [e for e in tree.getroot().iter() if e.tag.endswith("text")]
        found = any(e.get("data-fp-version") == label for e in texts)
        assert found, "data-fp-version attribute not set on SVG text element"

    def test_svg_height_includes_padding_when_label_provided(self, tmp_path):
        dxf_path  = _make_minimal_dxf(tmp_path)
        svg_no    = str(tmp_path / "no_label.svg")
        svg_yes   = str(tmp_path / "with_label.svg")
        convert(dxf_path, svg_no,  DEFAULT_CONFIG)
        convert(dxf_path, svg_yes, DEFAULT_CONFIG, version_label="any label")

        h_no  = float(ET.parse(svg_no).getroot().get("height"))
        h_yes = float(ET.parse(svg_yes).getroot().get("height"))
        assert abs((h_yes - h_no) - VERSION_PADDING_PX) < 1.0

    def test_no_version_text_when_label_omitted(self, tmp_path):
        dxf_path = _make_minimal_dxf(tmp_path)
        svg_path  = str(tmp_path / "out.svg")
        convert(dxf_path, svg_path, DEFAULT_CONFIG)

        tree  = ET.parse(svg_path)
        texts = [e for e in tree.getroot().iter() if e.tag.endswith("text")]
        assert not any(e.get("data-fp-version") for e in texts)


class TestVersionLabelDXF:
    def test_dxf_contains_fp_version_layer(self, tmp_path):
        dxf_path     = _make_minimal_dxf(tmp_path)
        svg_path     = str(tmp_path / "out.svg")
        labeled_path = str(tmp_path / "labeled.dxf")
        label        = "fpABC.revXYZ - Rev 1 · 2026-03-30"
        convert(dxf_path, svg_path, DEFAULT_CONFIG,
                dxf_out_path=labeled_path, version_label=label)

        doc = ezdxf.readfile(labeled_path)
        assert LAYER_FP_VERSION in doc.layers

    def test_dxf_text_entity_has_correct_content(self, tmp_path):
        dxf_path     = _make_minimal_dxf(tmp_path)
        svg_path     = str(tmp_path / "out.svg")
        labeled_path = str(tmp_path / "labeled.dxf")
        label        = "fpABC.revXYZ - Rev 1 · 2026-03-30"
        convert(dxf_path, svg_path, DEFAULT_CONFIG,
                dxf_out_path=labeled_path, version_label=label)

        doc  = ezdxf.readfile(labeled_path)
        msp  = doc.modelspace()
        texts = [e for e in msp if e.dxftype() == "TEXT" and e.dxf.layer == LAYER_FP_VERSION]
        assert len(texts) == 1
        assert texts[0].dxf.text == label

    def test_dxf_version_text_is_above_building(self, tmp_path):
        """Text insert Y coordinate should be above max_y of the envelope."""
        dxf_path     = _make_minimal_dxf(tmp_path)
        svg_path     = str(tmp_path / "out.svg")
        labeled_path = str(tmp_path / "labeled.dxf")
        convert(dxf_path, svg_path, DEFAULT_CONFIG,
                dxf_out_path=labeled_path, version_label="v1")

        doc  = ezdxf.readfile(labeled_path)
        msp  = doc.modelspace()
        texts = [e for e in msp if e.dxftype() == "TEXT" and e.dxf.layer == LAYER_FP_VERSION]
        # envelope max_y is 50 (from _make_minimal_dxf); insert Y must be > 50
        assert texts[0].dxf.insert.y > 50

    def test_no_fp_version_layer_when_label_omitted(self, tmp_path):
        dxf_path     = _make_minimal_dxf(tmp_path)
        svg_path     = str(tmp_path / "out.svg")
        labeled_path = str(tmp_path / "labeled.dxf")
        convert(dxf_path, svg_path, DEFAULT_CONFIG, dxf_out_path=labeled_path)

        doc = ezdxf.readfile(labeled_path)
        assert LAYER_FP_VERSION not in doc.layers
