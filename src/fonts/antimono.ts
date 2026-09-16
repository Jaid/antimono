import type {Font} from '../types.ts'

const font: Font = {
  title: 'Antimono',
  iosevka: {
    repo: 'be5invis/iosevka',
    version: '34.8.0',
  },
  config: {
    manufacturer: 'Jaid',
    spacing: 'quasi-proportional',
    serifs: 'sans',
    noCvSs: true,
    exportGlyphNames: false,
    noLigation: true,
    advanceScaleSp: 0.9,
    parenSize: 1000,
    symbolMid: 300,
  },
  angle: {
    upright: 0,
    italic: 8,
  },
  weight: {
    regular: 500,
    bold: 800,
  },
  width: 600,
  variants: {
    base: 'ss03',
    overrides: {
      eight: 'two-circles',
      capitalD: 'standard-serifless',
      capitalG: 'toothed-serifless-hooked',
      capitalK: 'curly-serifless',
      capitalM: 'hanging-serifless',
      capitalQ: 'crossing',
      capitalR: 'curly-serifless',
      b: 'toothed-serifless',
      g: 'single-storey-serifless',
      k: 'symmetric-connected-serifless',
      r: 'hookless-serifless',
      t: 'flat-hook-short-neck2',
      i: 'hooky',
      l: 'serifed-flat-tailed',
      capitalEszet: 'corner-serifless',
      eszet: 'longs-s-lig-descending-serifless',
      underscore: 'high',
      brace: 'curly-flat-boundary',
      numberSign: 'upright',
      at: 'fourfold-tall',
      dollar: 'through',
      cent: 'through-cap',
      question: 'corner',
      microSign: 'toothless-corner-serifless',
      pilcrow: 'low',
    },
  },
  subset: {
    ranges: [
      {
        name: 'Basic Latin',
        start: ' ',
        end: '~',
      },
      {
        name: 'Latin-1 Supplement',
        start: 0xA0,
        end: 'ÿ',
      },
      {
        name: 'Latin Extended-A',
        start: 'Ā',
        end: 'ſ',
      },
      {
        name: 'Latin Extended-B',
        start: 'ƀ',
        end: 'ɏ',
      },
      {
        name: 'Greek And Coptic',
        start: 'Ͱ',
        end: 'Ͽ',
      },
      {
        name: 'Greek Extended',
        start: 'ἀ',
        end: '῾',
      },
      {
        name: 'General Punctuation',
        start: '‐',
        end: '›',
      },
      {
        name: 'Specials',
        start: '￼',
        end: '�',
      },
    ],
    exclude: [
      '¸',
      '¨',
      'ª',
      '®',
    ],
  },
}

export default font
