from copy import deepcopy
from fontTools import subset
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.misc.transform import Transform
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import SVGPath
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables._f_v_a_r import Axis
from fontTools.varLib.featureVars import addFeatureVariations
from pathlib import Path
from picosvg.svg import SVG
from xml.etree import ElementTree as ET
import json
import re
import sys

stretch_by_us_width_class = {
    1: "ultra-condensed",
    2: "extra-condensed",
    3: "condensed",
    4: "semi-condensed",
    5: "normal",
    6: "semi-expanded",
    7: "expanded",
    8: "extra-expanded",
    9: "ultra-expanded",
}

def get_metadata(font):
    os2 = font["OS/2"] if "OS/2" in font else None
    head = font["head"] if "head" in font else None
    font_style = "normal"
    if os2 and os2.fsSelection & 0x01:
        font_style = "italic"
    elif head and head.macStyle & 0x02:
        font_style = "italic"
    return {
        "fontStretch": stretch_by_us_width_class.get(os2.usWidthClass if os2 else 5, "normal"),
        "fontStyle": font_style,
        "fontWeight": int(os2.usWeightClass if os2 else 400),
    }

def subset_font(font, subset_unicodes, subset_exclude_unicodes):
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    unicodes = set(subset.parse_unicodes(subset_unicodes))
    if subset_exclude_unicodes:
        unicodes = unicodes - set(subset.parse_unicodes(subset_exclude_unicodes))
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)

def suffix_glyph_name(style, glyph):
    if glyph == ".notdef":
        return glyph
    return f"{glyph}.{style}"

def copy_style_glyphs(target_font, style, source_font):
    target_glyf = target_font["glyf"]
    target_hmtx = target_font["hmtx"]
    source_glyf = source_font["glyf"]
    source_hmtx = source_font["hmtx"]
    added_glyphs = []
    for glyph in source_font.getGlyphOrder():
        if glyph == ".notdef":
            continue
        target_glyph = suffix_glyph_name(style, glyph)
        if target_glyph in target_glyf.glyphs:
            raise ValueError(f"Duplicate merged glyph name: {target_glyph}.")
        glyph_data = deepcopy(source_glyf[glyph])
        if glyph_data.isComposite():
            for component in glyph_data.components:
                component.glyphName = suffix_glyph_name(style, component.glyphName)
        target_glyf.glyphs[target_glyph] = glyph_data
        target_hmtx.metrics[target_glyph] = source_hmtx.metrics.get(glyph, (0, 0))
        added_glyphs.append(target_glyph)
    target_font.setGlyphOrder(target_font.getGlyphOrder() + added_glyphs)
    return len(added_glyphs)

def extend_style_gsub(target_font, style, source_font):
    if "GSUB" not in target_font or "GSUB" not in source_font:
        return 0
    target_lookups = target_font["GSUB"].table.LookupList.Lookup
    source_lookups = source_font["GSUB"].table.LookupList.Lookup
    target_glyphs = set(target_font.getGlyphOrder())
    added_substitutions = 0
    for lookup_index, target_lookup in enumerate(target_lookups[:len(source_lookups)]):
        source_lookup = source_lookups[lookup_index]
        if target_lookup.LookupType != 1 or source_lookup.LookupType != 1:
            continue
        for subtable_index, target_subtable in enumerate(target_lookup.SubTable[:len(source_lookup.SubTable)]):
            source_subtable = source_lookup.SubTable[subtable_index]
            if not hasattr(target_subtable, "mapping") or not hasattr(source_subtable, "mapping"):
                continue
            for source_glyph, target_glyph in source_subtable.mapping.items():
                suffixed_source_glyph = suffix_glyph_name(style, source_glyph)
                suffixed_target_glyph = suffix_glyph_name(style, target_glyph)
                if suffixed_source_glyph not in target_glyphs or suffixed_target_glyph not in target_glyphs:
                    continue
                target_subtable.mapping[suffixed_source_glyph] = suffixed_target_glyph
                added_substitutions += 1
    return added_substitutions

def make_axis(font, tag, name, minimum, default, maximum):
    axis = Axis()
    axis.axisTag = tag
    axis.minValue = minimum
    axis.defaultValue = default
    axis.maxValue = maximum
    axis.flags = 0
    axis.axisNameID = font["name"].addName(name)
    return axis

def add_fvar(font):
    fvar = newTable("fvar")
    fvar.axes = [
        make_axis(font, "wght", "Weight", 0, 0, 1000),
        make_axis(font, "ital", "Italic", 0, 0, 1),
    ]
    fvar.instances = []
    font["fvar"] = fvar

def load_master_metadata(input_files):
    masters = []
    for input_file in input_files:
        font = TTFont(input_file)
        try:
            metadata = get_metadata(font)
            metadata["file"] = str(input_file)
            metadata["glyphCount"] = len(font.getGlyphOrder())
            masters.append(metadata)
        finally:
            font.close()
    return masters

def classify_masters(input_files):
    masters = load_master_metadata(input_files)
    weights = sorted(set(master["fontWeight"] for master in masters))
    if len(weights) != 2:
        raise ValueError(f"Expected exactly 2 source weights for a variable font, got {weights}.")
    locations = {}
    for master in masters:
        italic = 1 if master["fontStyle"] == "italic" else 0
        weight = 0 if master["fontWeight"] == weights[0] else 1000
        key = f"{weight}:{italic}"
        if key in locations:
            raise ValueError(f"Duplicate variable master at {key}: {locations[key]['file']} and {master['file']}.")
        locations[key] = {
            **master,
            "italic": italic,
            "weight": weight,
        }
    expected_keys = {"0:0", "0:1", "1000:0", "1000:1"}
    missing_keys = expected_keys - set(locations)
    if missing_keys:
        raise ValueError(f"Missing variable master locations: {sorted(missing_keys)}.")
    return locations

def write_woff2(input_ttf_file, output_woff2_file):
    woff2_font = TTFont(input_ttf_file)
    try:
        woff2_font.flavor = "woff2"
        woff2_font.save(output_woff2_file)
    finally:
        woff2_font.close()

def load_master_fonts(masters):
    loaded_fonts = {}
    for key, master in masters.items():
        loaded_fonts[key] = TTFont(master["file"])
    return loaded_fonts

def make_style_substitutions(base_font, style_font, style):
    base_cmap = base_font.getBestCmap()
    style_cmap = style_font.getBestCmap()
    glyphs = set(base_font.getGlyphOrder())
    substitutions = {}
    for code_point, source_glyph in base_cmap.items():
        style_source_glyph = style_cmap.get(code_point)
        if not style_source_glyph:
            continue
        target_glyph = suffix_glyph_name(style, style_source_glyph)
        if source_glyph in glyphs and target_glyph in glyphs:
            substitutions[source_glyph] = target_glyph
    return substitutions

def add_discrete_style_variations(font, fonts):
    substitutions = [
        ([{"wght": (0.5, 1.0), "ital": (0.5, 1.0)}], make_style_substitutions(font, fonts["1000:1"], "boldItalic")),
        ([{"wght": (0.5, 1.0), "ital": (0.0, 0.499)}], make_style_substitutions(font, fonts["1000:0"], "bold")),
        ([{"wght": (0.0, 0.499), "ital": (0.5, 1.0)}], make_style_substitutions(font, fonts["0:1"], "italic")),
    ]
    addFeatureVariations(font, substitutions, featureTag="rvrn")
    return sum(len(style_substitutions) for _, style_substitutions in substitutions)

def remove_variable_tables(font):
    for tag in ["fvar", "gvar", "avar", "cvar", "HVAR", "VVAR", "MVAR", "STAT"]:
        if tag in font:
            del font[tag]

def normalize_default_style_metadata(font):
    if "OS/2" in font:
        font["OS/2"].usWeightClass = 400
        font["OS/2"].fsSelection &= ~0x01
    if "head" in font:
        font["head"].macStyle &= ~0x03
    if "post" in font:
        font["post"].italicAngle = 0

def restore_style_metadata(source_file, patched_file):
    source_font = TTFont(source_file)
    patched_font = TTFont(patched_file)
    try:
        if "OS/2" in source_font and "OS/2" in patched_font:
            patched_font["OS/2"].usWeightClass = source_font["OS/2"].usWeightClass
            patched_font["OS/2"].usWidthClass = source_font["OS/2"].usWidthClass
            patched_font["OS/2"].fsSelection = source_font["OS/2"].fsSelection
        if "head" in source_font and "head" in patched_font:
            patched_font["head"].macStyle = source_font["head"].macStyle
        if "post" in source_font and "post" in patched_font:
            patched_font["post"].italicAngle = source_font["post"].italicAngle
        patched_font.save(patched_file)
    finally:
        source_font.close()
        patched_font.close()


def apply_font_identity(font, family, version, style, *, variable=False, symbols=False):
    """Keep npm's full SemVer in name IDs 3/5; head can only hold a number."""
    match = re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?", version)
    if not match:
        raise ValueError(f"Invalid npm package version: {version}")
    major, minor, _patch = map(int, match.groups())
    revision = float(f"{major}.{minor}")
    if revision >= 32768 or minor >= 65535:
        raise ValueError(f"Package version cannot be represented in OpenType metadata: {version}")
    font["head"].fontRevision = revision
    # A distinct PostScript name keeps the variable, regular and symbols files distinct.
    ps_family = re.sub(r"[^A-Za-z0-9]", "", family)
    if not ps_family:
        raise ValueError(f"Family has no usable PostScript name: {family}")
    suffix = "Variable" if variable else ("Symbols" if symbols else style.replace(" ", ""))
    ps_name = f"{ps_family}-{suffix}"
    if len(ps_name) > 63:
        raise ValueError(f"PostScript name exceeds 63 characters: {ps_name}")
    # Legacy four-style grouping isolates Symbols; the typographic family stays Antimono.
    legacy_family = f"{family} Symbols" if symbols else family
    subfamily = "Regular" if symbols else style
    full_name = family if variable else (f"{family} Symbols" if symbols else f"{family} {style}")
    names = {
        1: legacy_family,
        2: subfamily,
        3: f"{version};{ps_name}",
        4: full_name,
        5: f"Version {version}",
        6: ps_name,
        16: family,
        17: "Symbols" if symbols else style,
    }
    if variable:
        names[25] = ps_family
    managed_ids = {1, 2, 3, 4, 5, 6, 16, 17, 18, 20, 21, 22, 25}
    font["name"].names = [n for n in font["name"].names if n.nameID not in managed_ids]
    for name_id, value in names.items():
        for platform, encoding, language in [(3, 1, 0x409), (1, 0, 0), (0, 4, 0)]:
            font["name"].setName(value, name_id, platform, encoding, language)
    bold = "Bold" in style and not variable and not symbols
    italic = "Italic" in style and not variable and not symbols
    os2 = font["OS/2"]
    os2.usWeightClass = 700 if bold else 400
    os2.fsSelection &= ~(0x01 | 0x20 | 0x40 | 0x200)
    os2.fsSelection |= (0x01 if italic else 0) | (0x20 if bold else 0)
    if not bold and not italic:
        os2.fsSelection |= 0x40
    if os2.version >= 4:
        if symbols:
            os2.fsSelection &= ~0x100
            for name_id, value in [(21, legacy_family), (22, "Regular")]:
                font["name"].setName(value, name_id, 3, 1, 0x409)
        else:
            os2.fsSelection |= 0x100
    font["head"].macStyle &= ~0x03
    font["head"].macStyle |= (0x01 if bold else 0) | (0x02 if italic else 0)
    if not italic:
        font["post"].italicAngle = 0
        font["hhea"].caretSlopeRise = 1
        font["hhea"].caretSlopeRun = 0
    if "DSIG" in font:
        del font["DSIG"]
    os2.recalcUnicodeRanges(font)

def parse_svg_length(value):
    if not value:
        return None
    match = re.match(r"^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))", value)
    return float(match.group(1)) if match else None

def get_svg_view_box(svg):
    root = ET.fromstring(svg)
    view_box = root.attrib.get("viewBox")
    if view_box:
        values = [float(value) for value in re.split(r"[,\s]+", view_box.strip()) if value]
        if len(values) == 4 and values[2] > 0 and values[3] > 0:
            return values
    width = parse_svg_length(root.attrib.get("width"))
    height = parse_svg_length(root.attrib.get("height"))
    if width and height and width > 0 and height > 0:
        return [0, 0, width, height]
    raise ValueError("SVG icon needs a viewBox or numeric width and height.")

def make_icon_glyph_name(code_point):
    return f"uni{code_point:04X}" if code_point <= 0xFFFF else f"u{code_point:X}"

def add_icons(font, icons):
    if not icons:
        return
    cmap = font.getBestCmap() or {}
    zero_glyph = cmap.get(ord("0"))
    space_glyph = cmap.get(ord(" "))
    reference_glyph = zero_glyph or space_glyph
    if not reference_glyph:
        raise ValueError("Unable to determine icon advance width.")
    advance = font["hmtx"].metrics[reference_glyph][0]
    upem = font["head"].unitsPerEm
    cap_height = getattr(font["OS/2"], "sCapHeight", 0) if "OS/2" in font else 0
    if not cap_height:
        cap_height = font["hhea"].ascent
    for icon in icons:
        code_point = int(icon["codePoint"])
        if code_point in cmap:
            raise ValueError(f"Icon {icon['id']} collides with existing U+{code_point:04X}.")
        glyph_name = make_icon_glyph_name(code_point)
        if glyph_name in font.getGlyphOrder():
            raise ValueError(f"Icon {icon['id']} collides with existing glyph {glyph_name}.")
        svg = SVG.fromstring(icon["svg"].replace("currentColor", "#000")).topicosvg().tostring()
        view_x, view_y, view_width, view_height = get_svg_view_box(svg)
        scale = min((advance * 0.9) / view_width, (upem * 0.8) / view_height)
        scaled_width = view_width * scale
        scaled_height = view_height * scale
        left = (advance - scaled_width) / 2
        bottom = (cap_height - scaled_height) / 2
        transform = Transform(
            scale,
            0,
            0,
            -scale,
            left - scale * view_x,
            bottom + scaled_height + scale * view_y,
        )
        pen = TTGlyphPen(font.getGlyphSet())
        SVGPath.fromstring(svg, transform=transform).draw(Cu2QuPen(pen, max_err=0.5))
        glyph = pen.glyph()
        font["glyf"][glyph_name] = glyph
        font.setGlyphOrder(font["glyf"].glyphOrder)
        glyph.recalcBounds(font["glyf"])
        font["hmtx"].metrics[glyph_name] = (advance, glyph.xMin)
        for cmap_table in font["cmap"].tables:
            if not cmap_table.isUnicode():
                continue
            if code_point <= 0xFFFF or cmap_table.format in (12, 13):
                cmap_table.cmap[code_point] = glyph_name
        cmap[code_point] = glyph_name


def build_variable(output_ttf_file, output_woff2_file, subset_unicodes, subset_exclude_unicodes, icons_file, input_files, family, version):
    masters = classify_masters(input_files)
    fonts = load_master_fonts(masters)
    variable_font = fonts["0:0"]
    original_glyph_count = len(variable_font.getGlyphOrder())
    try:
        for font in fonts.values():
            subset_font(font, subset_unicodes, subset_exclude_unicodes)
        master_subset_glyph_count = len(variable_font.getGlyphOrder())
        remove_variable_tables(variable_font)
        copied_glyph_count = copy_style_glyphs(variable_font, "italic", fonts["0:1"])
        copied_glyph_count += copy_style_glyphs(variable_font, "bold", fonts["1000:0"])
        copied_glyph_count += copy_style_glyphs(variable_font, "boldItalic", fonts["1000:1"])
        extended_gsub_substitution_count = extend_style_gsub(variable_font, "italic", fonts["0:1"])
        extended_gsub_substitution_count += extend_style_gsub(variable_font, "bold", fonts["1000:0"])
        extended_gsub_substitution_count += extend_style_gsub(variable_font, "boldItalic", fonts["1000:1"])
        merged_glyph_count = len(variable_font.getGlyphOrder())
        add_fvar(variable_font)
        feature_variation_substitution_count = add_discrete_style_variations(variable_font, fonts)
        subset_font(variable_font, subset_unicodes, subset_exclude_unicodes)
        icons = json.loads(Path(icons_file).read_text(encoding="utf8"))
        add_icons(variable_font, icons)
        subset_glyph_count = len(variable_font.getGlyphOrder())
        normalize_default_style_metadata(variable_font)
        apply_font_identity(variable_font, family, version, "Regular", variable=True)
        variable_font.save(output_ttf_file)
    finally:
        for font in fonts.values():
            font.close()
    write_woff2(output_ttf_file, output_woff2_file)
    return {
        "copiedGlyphCount": copied_glyph_count,
        "extendedGsubSubstitutionCount": extended_gsub_substitution_count,
        "featureVariationSubstitutionCount": feature_variation_substitution_count,
        "masterSubsetGlyphCount": master_subset_glyph_count,
        "mergedGlyphCount": merged_glyph_count,
        "originalGlyphCount": original_glyph_count,
        "subsetGlyphCount": subset_glyph_count,
    }

STATIC_STYLES = [
    ("0:0", "regular", "Regular"),
    ("0:1", "regular-italic", "Italic"),
    ("1000:0", "bold", "Bold"),
    ("1000:1", "bold-italic", "Bold Italic"),
]


def write_font_pair(font, stem, ttf_folder, woff2_folder):
    ttf_file = Path(ttf_folder) / f"{stem}.ttf"
    woff2_file = Path(woff2_folder) / f"{stem}.woff2"
    font.save(ttf_file)
    write_woff2(ttf_file, woff2_file)
    return {
        **get_metadata(font),
        "family": font["name"].getBestFamilyName(),
        "subfamily": font["name"].getBestSubFamilyName(),
        "fileName": ttf_file.name,
        "woff2FileName": woff2_file.name,
        "glyphCount": len(font.getGlyphOrder()),
        "codePointCount": len(font.getBestCmap() or {}),
    }


def build_symbols_font(reference, icons):
    """Build only .notdef and the custom icons, with no text/layout/variation tables."""
    cmap = reference.getBestCmap()
    icon_cmap = {icon["codePoint"]: cmap[icon["codePoint"]] for icon in icons}
    order = [".notdef", *icon_cmap.values()]
    if len(order) != len(set(order)):
        raise ValueError("Custom icons must have distinct glyph names.")
    pen = TTGlyphPen(None)
    glyphs = {".notdef": pen.glyph()}
    for name in icon_cmap.values():
        glyph = deepcopy(reference["glyf"][name])
        if glyph.isComposite():
            raise ValueError(f"Unexpected composite custom icon: {name}")
        glyphs[name] = glyph
    builder = FontBuilder(reference["head"].unitsPerEm, isTTF=True)
    builder.setupGlyphOrder(order)
    builder.setupCharacterMap(icon_cmap)
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics({name: reference["hmtx"].metrics[name] for name in order})
    builder.setupHorizontalHeader(
        ascent=reference["hhea"].ascent,
        descent=reference["hhea"].descent,
        lineGap=reference["hhea"].lineGap,
    )
    os2 = reference["OS/2"]
    builder.setupOS2(
        version=max(4, os2.version),
        sTypoAscender=os2.sTypoAscender,
        sTypoDescender=os2.sTypoDescender,
        sTypoLineGap=os2.sTypoLineGap,
        usWinAscent=os2.usWinAscent,
        usWinDescent=os2.usWinDescent,
        sxHeight=getattr(os2, "sxHeight", 0),
        sCapHeight=getattr(os2, "sCapHeight", 0),
        usWeightClass=400,
        usWidthClass=os2.usWidthClass,
        fsType=os2.fsType,
        fsSelection=0x40,
        achVendID=os2.achVendID,
        usBreakChar=0,
    )
    builder.setupPost(isFixedPitch=1, keepGlyphNames=True)
    builder.setupNameTable({})
    # Preserve source attribution and license records; identity is replaced by the caller.
    builder.font["name"].names = [deepcopy(n) for n in reference["name"].names if n.nameID in {0, 7, 8, 9, 10, 11, 12, 13, 14}]
    return builder.font


def build_family(request):
    family = request["family"]
    version = request["version"]
    stem = request["stem"]
    ttf_folder = Path(request["ttfFolder"])
    woff2_folder = Path(request["woff2Folder"])
    ttf_folder.mkdir(parents=True, exist_ok=True)
    woff2_folder.mkdir(parents=True, exist_ok=True)
    input_files = request["inputFiles"]
    icons = json.loads(Path(request["iconsFile"]).read_text(encoding="utf8"))
    masters = classify_masters(input_files)
    static_fonts = []
    symbols_metadata = None
    # These are independent static source masters, not instances of the GSUB-merged font.
    for location, filename_style, subfamily in STATIC_STYLES:
        with TTFont(masters[location]["file"]) as font:
            remove_variable_tables(font)
            subset_font(font, request["subsetUnicodes"], request["subsetExcludeUnicodes"])
            add_icons(font, icons)
            apply_font_identity(font, family, version, subfamily)
            static_fonts.append(write_font_pair(font, f"{stem}_{filename_style}", ttf_folder, woff2_folder))
            if location == "0:0":
                symbols_font = build_symbols_font(font, icons)
                try:
                    apply_font_identity(symbols_font, family, version, "Regular", symbols=True)
                    symbols_metadata = write_font_pair(symbols_font, f"{stem}_symbols", ttf_folder, woff2_folder)
                finally:
                    symbols_font.close()
    variable_metadata = build_variable(
        ttf_folder / f"{stem}.ttf",
        woff2_folder / f"{stem}.woff2",
        request["subsetUnicodes"],
        request["subsetExcludeUnicodes"],
        request["iconsFile"],
        input_files,
        family,
        version,
    )
    return {"variable": variable_metadata, "staticFonts": static_fonts, "symbolsFont": symbols_metadata}


def main():
    if len(sys.argv) < 2:
        raise ValueError("Expected a font processor command.")
    command = sys.argv[1]
    if command == "restore-style-metadata":
        restore_style_metadata(Path(sys.argv[2]), Path(sys.argv[3]))
    elif command == "build-family":
        result = build_family(json.loads(sys.argv[2]))
        print(json.dumps(result, separators=(",", ":")))
    elif command == "metadata":
        with TTFont(sys.argv[2]) as font:
            result = get_metadata(font)
            result["glyphCount"] = len(font.getGlyphOrder())
        print(json.dumps(result, separators=(",", ":")))
    else:
        raise ValueError(f"Unknown command: {command}")


if __name__ == "__main__":
    main()
