"""Offline integration tests: tiny masters, real SVG icons, all 12 output files."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import os
import unittest

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SPEC = spec_from_file_location("antimono_font_processor", ROOT / "src" / "font-processor.py")
processor = module_from_spec(SPEC)
SPEC.loader.exec_module(processor)
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf8"))["version"]
STYLES = {
    "regular": ("Regular", 400, False),
    "regular-italic": ("Italic", 400, True),
    "bold": ("Bold", 700, False),
    "bold-italic": ("Bold Italic", 700, True),
}
BASENAMES = ["antimono", *[f"antimono_{style}" for style in STYLES], "antimono_symbols"]


def make_master(file, style, weight, italic):
    order = [".notdef", "space", "zero", "A", "registered", "powerline"]
    glyphs = {}
    for name in order:
        pen = TTGlyphPen(None)
        if name != "space":
            width = 250 if weight == 400 else 400
            slant = 60 if italic else 0
            pen.moveTo((50, 0))
            pen.lineTo((50 + width, 0))
            pen.lineTo((50 + width + slant, 700))
            pen.lineTo((50 + slant, 700))
            pen.closePath()
        glyphs[name] = pen.glyph()
    builder = FontBuilder(1000, isTTF=True)
    builder.setupGlyphOrder(order)
    builder.setupCharacterMap({32: "space", 48: "zero", 65: "A", 0xAE: "registered", 0xE0B0: "powerline"})
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics({name: (600, 0 if name == "space" else 50) for name in order})
    builder.setupHorizontalHeader(ascent=925, descent=-325, caretSlopeRise=1000, caretSlopeRun=140 if italic else 0)
    builder.setupNameTable({
        "familyName": "Antimono Code",
        "styleName": style,
        "uniqueFontIdentifier": f"Iosevka 34.8.0 {style}",
        "fullName": f"Antimono Code {style}",
        "psName": "AntimonoCode-" + style.replace(" ", ""),
        "version": "Version 34.8.0",
    })
    selection = (1 if italic else 0) | (32 if weight == 700 else 0)
    builder.setupOS2(version=4, usWeightClass=weight, fsSelection=selection or 64, sTypoAscender=925, sTypoDescender=-325, usWinAscent=925, usWinDescent=325, sCapHeight=735)
    builder.setupPost(italicAngle=-8 if italic else 0)
    builder.font["head"].macStyle = (2 if italic else 0) | (1 if weight == 700 else 0)
    builder.save(file)


class FontOutputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace = TemporaryDirectory(prefix="antimono-font-test-")
        cls.addClassCleanup(cls.workspace.cleanup)
        cls.folder = Path(cls.workspace.name)
        cls.icons = json.loads(Path(os.environ["ANTIMONO_TEST_ICONS"]).read_text(encoding="utf8"))
        cls.code_points = {icon["codePoint"] for icon in cls.icons}
        cls.masters = {}
        for filename_style, (style, weight, italic) in STYLES.items():
            file = cls.folder / f"source-{filename_style}.ttf"
            make_master(file, style, weight, italic)
            cls.masters[filename_style] = file
        cls.result = processor.build_family({
            "family": "Antimono",
            "version": VERSION,
            "stem": "antimono",
            "ttfFolder": str(cls.folder / "ttf"),
            "woff2Folder": str(cls.folder / "woff2"),
            "iconsFile": os.environ["ANTIMONO_TEST_ICONS"],
            # Intentionally not in style order: classification must use metadata.
            "inputFiles": [str(cls.masters[s]) for s in ["bold-italic", "regular", "bold", "regular-italic"]],
            "subsetUnicodes": "U+0020,U+0030,U+0041,U+00AE,U+E0B0",
            "subsetExcludeUnicodes": "U+00AE",
        })

    def test_exact_output_names_in_both_formats(self):
        for extension in ("ttf", "woff2"):
            self.assertEqual(sorted(p.name for p in (self.folder / extension).iterdir()), sorted(f"{name}.{extension}" for name in BASENAMES))
        self.assertEqual(len(self.result["staticFonts"]), 4)
        self.assertEqual(self.result["symbolsFont"]["codePointCount"], 4)
        self.assertEqual(self.result["symbolsFont"]["glyphCount"], 5)

    def test_family_version_and_unique_identities(self):
        for extension in ("ttf", "woff2"):
            identifiers = set()
            ps_names = set()
            for stem in BASENAMES:
                with TTFont(self.folder / extension / f"{stem}.{extension}") as font:
                    names = font["name"]
                    self.assertEqual(names.getDebugName(16), "Antimono")
                    for record in names.names:
                        if record.nameID == 5:
                            self.assertEqual(record.toUnicode(), f"Version {VERSION}")
                        if record.nameID in {1, 2, 3, 4, 5, 6, 16, 17, 21, 22, 25}:
                            self.assertNotIn("Antimono Code", record.toUnicode())
                            self.assertNotIn("34.8.0", record.toUnicode())
                    major, minor, *_ = VERSION.split(".")
                    self.assertAlmostEqual(font["head"].fontRevision, float(f"{major}.{minor}"), delta=1 / 65536)
                    identifiers.add(names.getDebugName(3))
                    ps_names.add(names.getDebugName(6))
            self.assertEqual(len(identifiers), 6)
            self.assertEqual(len(ps_names), 6)

    def test_static_fonts_retain_source_style_without_variations(self):
        for extension in ("ttf", "woff2"):
            for filename_style, (style, weight, italic) in STYLES.items():
                with TTFont(self.folder / extension / f"antimono_{filename_style}.{extension}") as font, TTFont(self.masters[filename_style]) as source:
                    self.assertEqual(font["name"].getDebugName(1), "Antimono")
                    self.assertEqual(font["name"].getDebugName(2), style)
                    self.assertEqual(font["OS/2"].usWeightClass, weight)
                    self.assertEqual(bool(font["OS/2"].fsSelection & 1), italic)
                    self.assertEqual(bool(font["OS/2"].fsSelection & 32), weight == 700)
                    self.assertEqual(bool(font["head"].macStyle & 2), italic)
                    self.assertEqual(bool(font["head"].macStyle & 1), weight == 700)
                    self.assertEqual(bool(font["OS/2"].fsSelection & 64), not italic and weight == 400)
                    self.assertEqual(font["post"].italicAngle, source["post"].italicAngle)
                    self.assertFalse(set(font.keys()) & {"fvar", "gvar", "avar", "HVAR", "VVAR", "MVAR", "STAT"})
                    self.assertEqual(set(font.getBestCmap()), {32, 48, 65, 0xE0B0} | self.code_points)
                    target_glyph = font["glyf"][font.getBestCmap()[65]]
                    source_glyph = source["glyf"][source.getBestCmap()[65]]
                    self.assertEqual(list(target_glyph.getCoordinates(font["glyf"])[0]), list(source_glyph.getCoordinates(source["glyf"])[0]))

    def test_variable_axes_and_symbols_only_coverage(self):
        for extension in ("ttf", "woff2"):
            with TTFont(self.folder / extension / f"antimono.{extension}") as font:
                self.assertEqual([(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in font["fvar"].axes], [("wght", 0, 0, 1000), ("ital", 0, 0, 1)])
                self.assertEqual(set(font.getBestCmap()), {32, 48, 65, 0xE0B0} | self.code_points)
                self.assertIsNotNone(font["GSUB"].table.FeatureVariations)
            with TTFont(self.folder / extension / f"antimono_symbols.{extension}") as font:
                self.assertEqual(set(font.getBestCmap()), self.code_points)
                self.assertEqual(len(font.getGlyphOrder()), 5)
                self.assertIn(".notdef", font.getGlyphOrder())
                self.assertFalse(set(font.keys()) & {"fvar", "gvar", "GSUB", "GPOS", "GDEF"})

    def test_icons_are_quadratic_and_preserved_across_outputs(self):
        outlines = {}
        for extension in ("ttf", "woff2"):
            for stem in BASENAMES:
                with TTFont(self.folder / extension / f"{stem}.{extension}") as font:
                    for code_point in self.code_points:
                        name = font.getBestCmap()[code_point]
                        glyph = font["glyf"][name]
                        self.assertGreater(glyph.numberOfContours, 0)
                        self.assertEqual(font["hmtx"].metrics[name], (600, glyph.xMin))
                        self.assertFalse(any(flag & 0x80 for flag in glyph.flags), "Cubic segments must be converted to TrueType quadratics")
                        points = list(glyph.getCoordinates(font["glyf"])[0])
                        if code_point in outlines:
                            self.assertEqual(points, outlines[code_point])
                        outlines[code_point] = points

    def test_full_semver_is_preserved(self):
        with TTFont(self.masters["regular"]) as font:
            processor.apply_font_identity(font, "Antimono", "2.3.4-beta.1+build.7", "Regular")
            self.assertEqual(font["name"].getDebugName(5), "Version 2.3.4-beta.1+build.7")
            self.assertIn("2.3.4-beta.1+build.7", font["name"].getDebugName(3))
            with self.assertRaises(ValueError):
                processor.apply_font_identity(font, "Antimono", "not-a-version", "Regular")


if __name__ == "__main__":
    unittest.main()
