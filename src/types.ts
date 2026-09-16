/**
 * @see https://github.com/be5invis/Iosevka/raw/HEAD/doc/custom-build.md
 */
export type Font = {
  angle: {
    italic: number
    upright: number
  }
  config?: MainConfig & MetricsConfig & MetadataConfig
  iosevka: {
    repo: string
    version: string
  }
  subset: {
    exclude: Array<Character>
    ranges: Array<{
      end: Character
      name?: string
      start: Character
    }>
  }
  title: string
  variants: {
    base: VariantBase
    overrides: Record<string, string>
  }
  weight: {
    bold: number
    regular: number
  }
  width: number
}

export type Character = number | string

type VariantBase = 'ss01' | 'ss02' | 'ss03' | 'ss04' | 'ss05' | 'ss06' | 'ss07' | 'ss08' | 'ss09' | 'ss10' | 'ss11' | 'ss12' | 'ss13' | 'ss14' | 'ss15' | 'ss16' | 'ss17' | 'ss18' | 'ss20'

type MainConfig = {
  buildTextureFeature?: boolean
  exportGlyphNames?: boolean
  noCvSs?: boolean
  noLigation?: boolean
  serifs?: 'sans' | 'slab'
  spacing?: 'fixed' | 'fontconfig-mono' | 'normal' | 'quasi-proportional' | 'quasi-proportional-extension-only' | 'term' | 'wide-mosaic'
  webfontFormats?: Array<'TTF' | 'WOFF2'>
}

type MetricsConfig = {
  accentClearance?: number
  accentHeight?: number
  accentStackOffset?: number
  accentWidth?: number
  advanceScaleSp?: number
  archDepth?: number
  ascender?: number
  cap?: number
  dotSize?: number
  essRatio?: number
  essRatioLower?: number
  essRatioQuestion?: number
  essRatioUpper?: number
  leading?: number
  onumZeroHeightRatio?: number
  parenSize?: number
  periodSize?: number
  powerlineScaleX?: number
  powerlineScaleY?: number
  powerlineShiftX?: number
  powerlineShiftY?: number
  sb?: number
  smallArchDepth?: number
  symbolMid?: number
  winMetricAscenderPad?: number
  winMetricDescenderPad?: number
  xHeight?: number
}

type MetadataConfig = {
  copyright?: string
  description?: string
  designer?: string
  license?: string
  licenseURL?: string
  manufacturer?: string
  sampleText?: string
  urlDesigner?: string
  urlVendor?: string
  vendorIdTag?: string
  version?: string
}
