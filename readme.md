# Antimono

Antimono builds the **Antimono** font from Iosevka. Every build emits an all-in-one variable font, four independent static styles, and a custom-symbols-only font in both TTF and WOFF2 formats, plus CSS, build plans, and a manifest.

The preset currently targets Iosevka **34.8.0**. The font version is read from this npm package's `package.json`, not from Iosevka. Full semantic versions are stored in the OpenType version string and unique font identifier; the numeric `head.fontRevision` stores the package major/minor version. The upstream Iosevka version is recorded separately in `manifest.json`.

## Requirements

- [Bun](https://bun.sh/)
- Docker
- Git
- Python 3

The Iosevka build runs in Docker. Antimono creates an isolated Python virtual environment under `temp/.venv` for FontTools and Brotli.

If Nerd Fonts categories are requested, Antimono also uses the official `nerdfonts/patcher` Docker image. No local FontForge installation is required.

## Build

```sh
bun install
bun run start
```

`bun run start` builds the working artifacts into `out/`. Temporary files are written to `temp/`. Both are ignored by Git.

To build the fonts and then package the distributable files into `dist/`:

```sh
bun run build
```

The distribution contains `dist/ttf/`, `dist/woff/`, a minified `dist/manifest.json`, and the generated CSS files under `dist/css/`. CSS font URLs are rewritten for this distribution layout.

Each filename below is generated under both `out/ttf/` and `out/woff2/`, with the corresponding extension:

| Filename stem | Contents |
| --- | --- |
| `antimono` | All four styles in the existing discrete variable font; custom icons included |
| `antimono_regular` | Regular, upright; custom icons included |
| `antimono_regular-italic` | Regular, italic; custom icons included |
| `antimono_bold` | Bold, upright; custom icons included |
| `antimono_bold-italic` | Bold, italic; custom icons included |
| `antimono_symbols` | Only the four custom icon code points and the required unmapped `.notdef` glyph |

The four static styles are built from their individual Iosevka masters, not from the merged variable font. They have ordinary 400/700 weight and upright/italic metadata and no variation tables. Selected Nerd Fonts categories are included in the five text fonts but never in the symbols-only font.

The typographic family is **Antimono**. The symbols face uses **Antimono Symbols** for legacy family grouping so it does not replace the regular text face. Static and variable text fonts are alternative distributions; use one or the other in an application.

Other generated files:

- `out/antimono.css` loads the all-in-one font. It preserves the existing discrete axes: `wght` 0–1000 and `ital` 0–1.
- `out/antimono-static.css` loads the four static styles with normal CSS weight/style selection. Use this instead of `antimono.css` for a static-font setup.
- `out/antimono-symbols.css` loads the symbols-only face as `Antimono Symbols`.
- `out/private-build-plans.toml`, `out/build-plans/antimono.toml`, and `out/manifest.json` record build configuration, version, icons, and all twelve font files.

## Install on Windows

After building, install TTFs for the current Windows user with:

```powershell
.\scripts\install.ps1 [type]
```

The first positional parameter is optional and defaults to `variable`:

| Type | Fonts installed |
| --- | --- |
| `variable` | `antimono.ttf` |
| `split` | Regular, italic, bold, and bold-italic static TTFs |
| `symbols` | `antimono_symbols.ttf` |
| `all` | Variable, all four static styles, and symbols |

Examples:

```powershell
.\scripts\install.ps1
.\scripts\install.ps1 split
.\scripts\install.ps1 symbols
.\scripts\install.ps1 all
```

No elevation is required. The script installs into the per-user Windows Fonts folder, registers the selected fonts persistently, loads them into the current Windows session, and broadcasts a font-change notification. Use `-WhatIf` to preview a selection without changing anything:

```powershell
.\scripts\install.ps1 split -WhatIf
```

## CLI

The CLI uses [Clerc](https://github.com/clercjs/clerc) and follows the same command layout as the other Jaidlab CLI projects.

```sh
antimono [flags]
```

Main flags:

- `-o, --output <folder>` — output folder relative to the project root
- `--temp <folder>` — temporary workspace folder relative to the project root
- `--fonts <folder>` — font preset folder relative to the project root
- `--root <folder>` — project root
- `--docker-host <host>` — Docker daemon host, for example `ssh://nas` (defaults to `DOCKER_HOST` when set)
- `--iosevka-builder-image <image>` — Docker image used to build Iosevka
- `--nerd-fonts-patcher-image <image>` — Docker image used for Nerd Fonts patching
- `--nerd-font <category>` — Nerd Fonts glyph category to bake in; repeat for multiple categories
- `--no-clean` — keep unrelated files already present in the output folder
- `--help`
- `--version`

### Nerd Fonts categories

`--nerd-font` accepts these Nerd Fonts glyph sets:

- `boxdrawing`
- `braille`
- `codicons`
- `devicons`
- `fontawesome`
- `fontawesomeext`
- `fontlogos`
- `material`
- `octicons`
- `pomicons`
- `powerline`
- `powerlineextra`
- `powersymbols`
- `seti`
- `weather`

For example, using Docker on the NAS:

```sh
antimono \
  --docker-host ssh://nas \
  --nerd-font powerline \
  --nerd-font powerlineextra \
  --nerd-font fontawesome
```

Antimono patches the Iosevka source masters and then preserves only the Unicode ranges belonging to the requested categories during its FontTools subset and variable-font merge. With no `--nerd-font` flags, no Nerd Fonts patching is performed.

## Custom icons

Custom icons are defined in `src/icons/index.yml` and are included in every generated Antimono TTF/WOFF2. Text fonts receive them after subsetting (and after assembly for the variable font); the symbols-only font contains just these icons. The current assignments use the private-use range `U+E100`–`U+E103`.

An icon source can be a local SVG file relative to `src/icons/`:

```yaml
openrouter:
  name: OpenRouter logo
  code: E103
  source: openrouter.svg
```

a remote SVG URL:

```yaml
service:
  name: Service
  code: E104
  source: https://example.com/icon.svg
```

or a `react-icons` export identified by vendor package suffix and export id:

```yaml
moon:
  name: Moon
  code: E100
  source:
    vendor: fa6
    id: FaMoon
```

React Icons are rendered to SVG during the build. SVG strokes are expanded to filled outlines before FontTools converts the artwork to TrueType `glyf` contours. Duplicate or already-occupied code points fail the build instead of silently replacing a glyph.

## Library

```ts
import antimono from 'antimono'

await antimono({
  dockerHost: 'ssh://nas',
  nerdFontCategories: ['powerline', 'fontawesome'],
  output: 'out',
})
```

The repository ships one preset: `src/fonts/antimono.ts`.

## Validation

Run `bun run typecheck`, `bun run lint`, and `bun test`. After the first build creates `temp/.venv`, the tests also run offline FontTools integration checks against small synthetic masters and the real custom icons. These checks verify all twelve filenames, family/version records, static style flags and outlines, variable axes, icon preservation, and symbols-only coverage. A fresh clone without the Python environment skips that integration test; `ANTIMONO_TEST_PYTHON` can point to another Python with FontTools, Brotli, and picosvg installed.
