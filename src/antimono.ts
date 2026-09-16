import type {ResolvedIcon} from './icons/loadIcons.ts'
import type {Character, Font} from './types.ts'

// eslint-disable-next-line no-restricted-imports -- Use the same native filesystem API throughout the build.
import {cp, mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import * as path from 'node:path'
import {pathToFileURL} from 'node:url'

import packageMetadata from '../package.json'
import loadIcons from './icons/loadIcons.ts'

export type {Character, Font} from './types.ts'

export const nerdFontCategories = [
  'boxdrawing',
  'braille',
  'codicons',
  'devicons',
  'fontawesome',
  'fontawesomeext',
  'fontlogos',
  'material',
  'octicons',
  'pomicons',
  'powerline',
  'powerlineextra',
  'powersymbols',
  'seti',
  'weather',
] as const

export type NerdFontCategory = typeof nerdFontCategories[number]

type NerdFontCategoryConfig = {
  patcherFlag?: string
  unicodes: Array<string>
}

const nerdFontCategoryConfigs: Record<NerdFontCategory, NerdFontCategoryConfig> = {
  boxdrawing: {
    patcherFlag: '--boxdrawing',
    unicodes: ['U+2500-259F'],
  },
  braille: {
    patcherFlag: '--braille',
    unicodes: ['U+2800-28FF'],
  },
  codicons: {
    patcherFlag: '--codicons',
    unicodes: ['U+EA60-EC84'],
  },
  devicons: {
    unicodes: ['U+E700-E958'],
  },
  fontawesome: {
    patcherFlag: '--fontawesome',
    unicodes: ['U+ED00-EFCE', 'U+F000-F2FF'],
  },
  fontawesomeext: {
    patcherFlag: '--fontawesomeext',
    unicodes: ['U+E200-E2A9'],
  },
  fontlogos: {
    patcherFlag: '--fontlogos',
    unicodes: ['U+F300-F385'],
  },
  material: {
    patcherFlag: '--material',
    unicodes: ['U+F0001-F1AF0'],
  },
  octicons: {
    patcherFlag: '--octicons',
    unicodes: ['U+F400-F533', 'U+2665', 'U+26A1'],
  },
  pomicons: {
    patcherFlag: '--pomicons',
    unicodes: ['U+E000-E00A'],
  },
  powerline: {
    patcherFlag: '--powerline',
    unicodes: ['U+E0A0-E0A2', 'U+E0B0-E0B3'],
  },
  powerlineextra: {
    patcherFlag: '--powerlineextra',
    unicodes: ['U+E0A3', 'U+E0B4-E0C8', 'U+E0CA', 'U+E0CC-E0D7', 'U+2630'],
  },
  powersymbols: {
    patcherFlag: '--powersymbols',
    unicodes: ['U+23FB-23FE', 'U+2B58'],
  },
  seti: {
    unicodes: ['U+E5FA-E6BB'],
  },
  weather: {
    patcherFlag: '--weather',
    unicodes: ['U+E300-E3E3'],
  },
}
const nerdFontCategorySet = new Set<string>(nerdFontCategories)

export const normalizeNerdFontCategories = (categories: ReadonlyArray<string>) => {
  const invalidCategories = [...new Set(categories.filter(category => !nerdFontCategorySet.has(category)))]
  if (invalidCategories.length > 0) {
    throw new TypeError(`Unknown Nerd Fonts categor${invalidCategories.length === 1 ? 'y' : 'ies'}: ${invalidCategories.join(', ')}. Supported categories: ${nerdFontCategories.join(', ')}.`)
  }
  const selectedCategories = new Set(categories)
  return nerdFontCategories.filter(category => selectedCategories.has(category))
}

export const makeNerdFontUnicodes = (categories: ReadonlyArray<NerdFontCategory>) => {
  return categories.flatMap(category => nerdFontCategoryConfigs[category].unicodes).join(',')
}

const makeNerdFontPatcherFlags = (categories: ReadonlyArray<NerdFontCategory>) => {
  return categories.flatMap(category => {
    const patcherFlag = nerdFontCategoryConfigs[category].patcherFlag
    return patcherFlag ? [patcherFlag] : []
  })
}

export type AntimonoOptions = {
  clean?: boolean
  dockerHost?: string
  fontsFolder?: string
  iosevkaBuilderImage?: string
  log?: (message: string) => void
  nerdFontCategories?: Array<NerdFontCategory>
  nerdFontsPatcherImage?: string
  output?: string
  rootFolder?: string
  temp?: string
}

type FontFace = {
  family: string
  fileName: string
  fontStretch: string
  sortKey: string
}

type BuildPlan = {
  family: string
  file: string
  fontStretch: string
  id: string
  sourceFile: string
  subsetExcludeUnicodes: string
  subsetUnicodes: string
  variableFileName: string
}

type SourceTtfFile = {
  buildPlan: BuildPlan
  file: string
}

type VariableFontFile = {
  buildPlan: BuildPlan
  copiedGlyphCount: number
  extendedGsubSubstitutionCount: number
  featureVariationSubstitutionCount: number
  file: string
  masterSubsetGlyphCount: number
  mergedGlyphCount: number
  originalGlyphCount: number
  subsetGlyphCount: number
}

type VariableFontProcessorResult = Pick<VariableFontFile, 'copiedGlyphCount' | 'extendedGsubSubstitutionCount' | 'featureVariationSubstitutionCount' | 'masterSubsetGlyphCount' | 'mergedGlyphCount' | 'originalGlyphCount' | 'subsetGlyphCount'>

type StandaloneFontMetadata = {
  codePointCount: number
  family: string
  fileName: string
  fontStretch: string
  fontStyle: 'italic' | 'normal'
  fontWeight: number
  glyphCount: number
  subfamily: string
  woff2FileName: string
}

type StandaloneFontFile = StandaloneFontMetadata & {buildPlan: BuildPlan}

type FontFamilyProcessorResult = {
  staticFonts: Array<StandaloneFontMetadata>
  symbolsFont: StandaloneFontMetadata
  variable: VariableFontProcessorResult
}

export const defaultOptions = {
  clean: true,
  iosevkaBuilderImage: 'antimono-iosevka-builder',
  nerdFontsPatcherImage: 'nerdfonts/patcher',
  output: 'out',
  temp: 'temp',
} as const

const ensureDir = async (folder: string) => {
  await mkdir(folder, {recursive: true})
}
const emptyDir = async (folder: string) => {
  await rm(folder, {
    force: true,
    recursive: true,
  })
  await ensureDir(folder)
}
const outputFile = async (file: string, content: string) => {
  await ensureDir(path.dirname(file))
  await writeFile(file, content)
}
const remove = async (target: string) => {
  await rm(target, {
    force: true,
    recursive: true,
  })
}
const copyFolder = async (source: string, destination: string) => {
  await emptyDir(destination)
  await cp(source, destination, {
    force: true,
    recursive: true,
  })
}
const formatCommand = (entry: string, args: Array<string>) => {
  return [entry, ...args].map(value => {
    return /\s/u.test(value) ? JSON.stringify(value) : value
  }).join(' ')
}
const readStreamText = async (stream: ReadableStream<Uint8Array>) => {
  const response = new Response(stream)
  return response.text()
}
const runVerbose = async (entry: string, args: Array<string>) => {
  const child = Bun.spawn([entry, ...args], {
    stderr: 'inherit',
    stdin: 'ignore',
    stdout: 'inherit',
  })
  const exitCode = await child.exited
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${formatCommand(entry, args)}`)
  }
}
const runQuiet = async (entry: string, args: Array<string>) => {
  const child = Bun.spawn([entry, ...args], {
    stderr: 'pipe',
    stdin: 'ignore',
    stdout: 'pipe',
  })
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    readStreamText(child.stderr),
    readStreamText(child.stdout),
  ])
  if (exitCode !== 0) {
    const details = stderr.trim()
    throw new Error(`Command failed with exit code ${exitCode}: ${formatCommand(entry, args)}${details ? `\n${details}` : ''}`)
  }
  return {
    stderr,
    stdout,
  }
}
const runCaptureStdout = async (entry: string, args: Array<string>) => {
  const child = Bun.spawn([entry, ...args], {
    stderr: 'inherit',
    stdin: 'ignore',
    stdout: 'pipe',
  })
  const [exitCode, stdout] = await Promise.all([
    child.exited,
    readStreamText(child.stdout),
  ])
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${formatCommand(entry, args)}`)
  }
  return {stdout}
}
const makeDockerArgs = (dockerHost: string | undefined, args: Array<string>) => {
  return dockerHost ? ['--host', dockerHost, ...args] : args
}
const runDockerVerbose = async (dockerHost: string | undefined, args: Array<string>) => {
  await runVerbose('docker', makeDockerArgs(dockerHost, args))
}
const runDockerQuiet = async (dockerHost: string | undefined, args: Array<string>) => {
  return runQuiet('docker', makeDockerArgs(dockerHost, args))
}
const parseSshDockerHost = (dockerHost?: string) => {
  if (!dockerHost?.startsWith('ssh://')) {
    return
  }
  const url = new URL(dockerHost)
  if (!url.hostname) {
    throw new TypeError(`Invalid SSH Docker host: ${dockerHost}`)
  }
  return {
    port: url.port || undefined,
    target: url.username ? `${decodeURIComponent(url.username)}@${url.hostname}` : url.hostname,
  }
}
const pullDockerImage = async (image: string, dockerHost?: string) => {
  const sshHost = parseSshDockerHost(dockerHost)
  if (!sshHost) {
    await runDockerVerbose(dockerHost, ['pull', image])
    return
  }
  const sshArgs = [
    ...sshHost.port ? ['-p', sshHost.port] : [],
    sshHost.target,
    'docker',
    'pull',
    image,
  ]
  await runVerbose('ssh', sshArgs)
}
const imageExists = async (image: string, dockerHost?: string) => {
  try {
    await runDockerQuiet(dockerHost, ['image', 'inspect', image])
    return true
  } catch {
    return false
  }
}
const ensureDockerImage = async (image: string, dockerHost?: string) => {
  if (!await imageExists(image, dockerHost)) {
    await pullDockerImage(image, dockerHost)
  }
}
const removeDockerContainer = async (dockerHost: string | undefined, container: string) => {
  try {
    await runDockerQuiet(dockerHost, ['rm', '-f', container])
  } catch {
    // Ignore cleanup errors.
  }
}
const normalizeDockerClientPath = (target: string) => {
  return path.resolve(target).replaceAll('\\', '/')
}
const normalizeIosevkaSource = (version: string) => {
  if (/^v?\d+\.\d+\.\d+(?:[+-].*)?$/u.test(version)) {
    return version.startsWith('v') ? version : `v${version}`
  }
  return version
}
const getDockerfileBaseImages = async (folder: string) => {
  const dockerfile = await readFile(path.join(folder, 'Dockerfile'), 'utf8')
  const stageNames = new Set<string>
  const baseImages: Array<string> = []
  for (const line of dockerfile.split(/\r?\n/u)) {
    const match = /^\s*from\s+(?:--platform=\S+\s+)?(\S+)(?:\s+as\s+(\S+))?/iu.exec(line)
    if (!match) {
      continue
    }
    const [, baseImage, stageName] = match
    if (!stageNames.has(baseImage) && !baseImage.startsWith('$')) {
      baseImages.push(baseImage)
    }
    if (stageName) {
      stageNames.add(stageName)
    }
  }
  return [...new Set(baseImages)]
}
const buildIosevkaBuilderImage = async (image: string, cloneFolder: string, repo: string, dockerHost?: string) => {
  await remove(cloneFolder)
  await runVerbose('git', ['clone', '--depth', '1', `https://github.com/${repo}.git`, cloneFolder])
  const dockerFolder = path.join(cloneFolder, 'docker')
  const remoteSshHost = parseSshDockerHost(dockerHost)
  if (remoteSshHost) {
    for (const baseImage of await getDockerfileBaseImages(dockerFolder)) {
      await ensureDockerImage(baseImage, dockerHost)
    }
  }
  await runDockerVerbose(dockerHost, [
    'build',
    ...remoteSshHost ? ['--pull=false'] : [],
    '-t',
    image,
    dockerFolder,
  ])
}
const fontStretchSortRanks: Record<string, number> = {
  'ultra-condensed': 0,
  'extra-condensed': 1,
  condensed: 2,
  'semi-condensed': 3,
  normal: 4,
  'semi-expanded': 5,
  expanded: 6,
  'extra-expanded': 7,
  'ultra-expanded': 8,
}
const makeFontFaceSortKey = (face: Pick<FontFace, 'fileName' | 'fontStretch'>) => {
  const widthRank = fontStretchSortRanks[face.fontStretch] ?? fontStretchSortRanks.normal
  return `${widthRank}:${face.fileName}`
}
const makeCss = (faces: Array<FontFace>) => {
  const sortedFaces = faces.toSorted((a, b) => {
    return a.family.localeCompare(b.family) || a.sortKey.localeCompare(b.sortKey)
  })
  const css = sortedFaces.map(face => {
    return `@font-face {
  font-family: "${face.family}";
  src: url("./woff2/${face.fileName}") format("woff2");
  font-display: swap;
  font-stretch: ${face.fontStretch};
  font-style: normal;
  font-weight: normal;
  font-variation-settings: "ital" 0, "wght" 0;
}`
  })
  return `${css.join('\n\n')}\n`
}
const makeFontProcessor = (folder: string) => {
  return path.join(folder, 'process-font.py')
}
const findTtfFiles = async (folder: string): Promise<Array<string>> => {
  const files: Array<string> = []
  const entries = await readdir(folder, {withFileTypes: true})
  for (const entry of entries) {
    const file = path.join(folder, entry.name)
    if (entry.isDirectory()) {
      files.push(...await findTtfFiles(file))
      continue
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.ttf')) {
      files.push(file)
    }
  }
  return files.toSorted((a, b) => a.localeCompare(b))
}
const getIosevkaTtfFiles = async (workFolder: string, buildPlans: Array<BuildPlan>) => {
  const sourceTtfFiles: Array<SourceTtfFile> = []
  const missingBuildPlans: Array<BuildPlan> = []
  for (const buildPlan of buildPlans) {
    const ttfFolder = path.join(workFolder, 'dist', buildPlan.id, 'TTF')
    let files: Array<string> = []
    try {
      const entries = await readdir(ttfFolder, {withFileTypes: true})
      files = entries
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.ttf'))
        .map(entry => path.join(ttfFolder, entry.name))
        .toSorted((a, b) => a.localeCompare(b))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
    if (files.length === 0) {
      missingBuildPlans.push(buildPlan)
      continue
    }
    for (const file of files) {
      sourceTtfFiles.push({
        buildPlan,
        file,
      })
    }
  }
  return {
    missingBuildPlans,
    sourceTtfFiles,
  }
}
const patchNerdFontSourceFiles = async (sourceTtfFiles: Array<SourceTtfFile>, categories: ReadonlyArray<NerdFontCategory>, image: string, tempFolder: string, pythonExecutable: string, processorFile: string, log: (message: string) => void, dockerHost?: string) => {
  if (categories.length === 0) {
    return sourceTtfFiles
  }
  const patcherFlags = makeNerdFontPatcherFlags(categories)
  await ensureDockerImage(image, dockerHost)
  const patchedFiles: Array<SourceTtfFile> = []
  for (const [index, sourceTtfFile] of sourceTtfFiles.entries()) {
    const patchFolder = path.join(tempFolder, String(index).padStart(2, '0'))
    const inputFolder = path.join(patchFolder, 'in')
    const outputFolder = path.join(patchFolder, 'out')
    await emptyDir(inputFolder)
    await emptyDir(outputFolder)
    const inputFile = path.join(inputFolder, path.basename(sourceTtfFile.file))
    await cp(sourceTtfFile.file, inputFile, {force: true})
    const container = `antimono-nerd-font-${process.pid}-${index}`
    log(`Baking Nerd Fonts categories ${categories.join(', ')} into ${path.basename(sourceTtfFile.file)}…`)
    try {
      await runDockerQuiet(dockerHost, [
        'create',
        '--name',
        container,
        '--entrypoint',
        'fontforge',
        image,
        '-script',
        '/nerd/font-patcher',
        '-out',
        '/out',
        '--quiet',
        '--no-progressbars',
        '--name',
        sourceTtfFile.buildPlan.family,
        ...patcherFlags,
        `/in/${path.basename(inputFile)}`,
      ])
      await runDockerVerbose(dockerHost, ['cp', `${normalizeDockerClientPath(inputFolder)}/.`, `${container}:/in`])
      await runDockerVerbose(dockerHost, ['start', '--attach', container])
      await runDockerVerbose(dockerHost, ['cp', `${container}:/out/.`, normalizeDockerClientPath(outputFolder)])
    } finally {
      await removeDockerContainer(dockerHost, container)
    }
    const outputTtfFiles = await findTtfFiles(outputFolder)
    if (outputTtfFiles.length !== 1) {
      throw new Error(`Expected Nerd Fonts patcher to produce exactly 1 TTF for ${sourceTtfFile.file}, got ${outputTtfFiles.length}.`)
    }
    await runVerbose(pythonExecutable, [processorFile, 'restore-style-metadata', sourceTtfFile.file, outputTtfFiles[0]])
    patchedFiles.push({
      ...sourceTtfFile,
      file: outputTtfFiles[0],
    })
  }
  return patchedFiles
}
type LoadedFont = {
  file: string
  font: Font
  id: string
}

const topLevelConfigKeys = new Set([
  'buildTextureFeature',
  'exportGlyphNames',
  'noCvSs',
  'noLigation',
  'serifs',
  'spacing',
  'webfontFormats',
])
const metricConfigKeys = new Set([
  'accentClearance',
  'accentHeight',
  'accentStackOffset',
  'accentWidth',
  'advanceScaleSp',
  'archDepth',
  'ascender',
  'cap',
  'dotSize',
  'essRatio',
  'essRatioLower',
  'essRatioQuestion',
  'essRatioUpper',
  'leading',
  'onumZeroHeightRatio',
  'parenSize',
  'periodSize',
  'powerlineScaleX',
  'powerlineScaleY',
  'powerlineShiftX',
  'powerlineShiftY',
  'sb',
  'smallArchDepth',
  'symbolMid',
  'winMetricAscenderPad',
  'winMetricDescenderPad',
  'xHeight',
])
const namingConfigKeys = new Set([
  'copyright',
  'description',
  'designer',
  'license',
  'licenseURL',
  'manufacturer',
  'sampleText',
  'urlDesigner',
  'urlVendor',
  'vendorIdTag',
  'version',
])
const widthConfigs: Record<string, {
  css: string
  menu: number
}> = {
  UltraCondensed: {
    css: 'ultra-condensed',
    menu: 1,
  },
  ExtraCondensed: {
    css: 'extra-condensed',
    menu: 2,
  },
  Condensed: {
    css: 'condensed',
    menu: 3,
  },
  SemiCondensed: {
    css: 'semi-condensed',
    menu: 4,
  },
  Normal: {
    css: 'normal',
    menu: 5,
  },
  SemiExtended: {
    css: 'semi-expanded',
    menu: 6,
  },
  Extended: {
    css: 'expanded',
    menu: 7,
  },
  ExtraExtended: {
    css: 'extra-expanded',
    menu: 8,
  },
  UltraExtended: {
    css: 'ultra-expanded',
    menu: 9,
  },
}
const characterToCodePoint = (character: Character) => {
  if (typeof character === 'number') {
    if (!Number.isInteger(character) || character < 0 || character > 0x10_FF_FF) {
      throw new Error(`Invalid Unicode code point: ${character}`)
    }
    return character
  }
  // eslint-disable-next-line typescript/no-misused-spread -- Code points, not grapheme clusters, are required for Unicode ranges.
  const codePoints = [...character]
  if (codePoints.length !== 1) {
    throw new Error(`Expected a single Unicode character, got ${JSON.stringify(character)}.`)
  }
  return codePoints[0].codePointAt(0)!
}
const makeUnicodeRange = (start: Character, end = start) => {
  const startCodePoint = characterToCodePoint(start)
  const endCodePoint = characterToCodePoint(end)
  if (endCodePoint < startCodePoint) {
    throw new Error(`Invalid Unicode range: ${startCodePoint}..${endCodePoint}`)
  }
  const startHex = startCodePoint.toString(16).toUpperCase().padStart(4, '0')
  const endHex = endCodePoint.toString(16).toUpperCase().padStart(4, '0')
  return startCodePoint === endCodePoint ? `U+${startHex}` : `U+${startHex}-${endHex}`
}
const makeSubsetUnicodes = (font: Font) => {
  const ranges = font.subset.ranges
  if (ranges.length === 0) {
    throw new Error(`Font ${font.title} does not define subset ranges.`)
  }
  return ranges.map(range => makeUnicodeRange(range.start, range.end)).join(',')
}
const makeSubsetExcludeUnicodes = (font: Font) => {
  return font.subset.exclude.map(character => makeUnicodeRange(character)).join(',')
}
const makeSubsetTomlRanges = (font: Font) => {
  return font.subset.ranges.map(range => {
    return [characterToCodePoint(range.start), characterToCodePoint(range.end)]
  })
}
const makeSubsetTomlExcludes = (font: Font) => {
  return font.subset.exclude.map(character => {
    const codePoint = characterToCodePoint(character)
    return [codePoint, codePoint]
  })
}
const toKebabCase = (value: string) => {
  return value.replaceAll(/([\da-z])([A-Z])/g, '$1-$2').replaceAll('_', '-').toLowerCase()
}
const assertFiniteNumber = (value: number, label: string) => {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`)
  }
}
const assertFontAxes = (font: Font) => {
  assertFiniteNumber(font.width, `${font.title} width`)
  assertFiniteNumber(font.weight.regular, `${font.title} regular weight`)
  assertFiniteNumber(font.weight.bold, `${font.title} bold weight`)
  assertFiniteNumber(font.angle.upright, `${font.title} upright angle`)
  assertFiniteNumber(font.angle.italic, `${font.title} italic angle`)
  if (font.weight.bold <= font.weight.regular) {
    throw new Error(`${font.title} bold weight must be greater than its regular weight.`)
  }
}
const splitConfig = (font: Font) => {
  const topLevelConfig: Record<string, unknown> = {}
  const metricOverride: Record<string, unknown> = {}
  const namingOverride: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(font.config ?? {})) {
    if (topLevelConfigKeys.has(key)) {
      topLevelConfig[key] = value
      continue
    }
    if (metricConfigKeys.has(key)) {
      metricOverride[key] = value
      continue
    }
    if (namingConfigKeys.has(key)) {
      namingOverride[key] = value
      continue
    }
    throw new Error(`Unsupported Antimono font config key: ${key}`)
  }
  return {
    metricOverride,
    namingOverride,
    topLevelConfig,
  }
}
const tomlKey = (key: string) => {
  return /^[-0-9A-Z_a-z]+$/u.test(key) ? key : JSON.stringify(key)
}
const tomlValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => tomlValue(item)).join(', ')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).map(([key, objectValue]) => `${tomlKey(key)} = ${tomlValue(objectValue)}`).join(', ')}}`
  }
  throw new Error(`Unsupported TOML value: ${JSON.stringify(value)}`)
}
const writeTomlProperty = (lines: Array<string>, key: string, value: unknown) => {
  lines.push(`${tomlKey(key)} = ${tomlValue(value)}`)
}
const writeTomlSection = (lines: Array<string>, section: string, properties: Record<string, unknown>) => {
  if (Object.keys(properties).length === 0) {
    return
  }
  lines.push('', `[${section}]`)
  for (const [key, value] of Object.entries(properties)) {
    writeTomlProperty(lines, key, value)
  }
}
const makeFontToml = (loadedFont: LoadedFont) => {
  const {font, id} = loadedFont
  const {metricOverride, namingOverride, topLevelConfig} = splitConfig(font)
  const lines = [
    `# Generated from ${path.basename(loadedFont.file)}`,
    `[buildPlans.${tomlKey(id)}]`,
    `family = ${tomlValue(font.title)}`,
  ]
  for (const [key, value] of Object.entries(topLevelConfig)) {
    writeTomlProperty(lines, key, value)
  }
  writeTomlSection(lines, `buildPlans.${tomlKey(id)}.namingOverride`, {
    ...namingOverride,
    version: packageMetadata.version,
  })
  writeTomlSection(lines, `buildPlans.${tomlKey(id)}.metricOverride`, metricOverride)
  writeTomlSection(lines, `buildPlans.${tomlKey(id)}.variants`, {
    inherits: font.variants.base,
  })
  const variantOverrides = Object.fromEntries(Object.entries(font.variants.overrides).map(([key, value]) => {
    return [toKebabCase(key), value]
  }))
  writeTomlSection(lines, `buildPlans.${tomlKey(id)}.variants.design`, variantOverrides)
  assertFontAxes(font)
  writeTomlSection(lines, `buildPlans.${tomlKey(id)}.weights.Regular`, {
    css: 400,
    menu: 400,
    shape: font.weight.regular,
  })
  writeTomlSection(lines, `buildPlans.${tomlKey(id)}.weights.Bold`, {
    css: 700,
    menu: 700,
    shape: font.weight.bold,
  })
  writeTomlSection(lines, `buildPlans.${tomlKey(id)}.widths.Normal`, {
    css: widthConfigs.Normal.css,
    menu: widthConfigs.Normal.menu,
    shape: font.width,
  })
  writeTomlSection(lines, `buildPlans.${tomlKey(id)}.slopes.Upright`, {
    angle: font.angle.upright,
    css: 'normal',
    menu: 'upright',
    shape: 'upright',
  })
  writeTomlSection(lines, `buildPlans.${tomlKey(id)}.slopes.Italic`, {
    angle: font.angle.italic,
    css: 'italic',
    menu: 'italic',
    shape: 'italic',
  })
  const subsetIncludeRanges = makeSubsetTomlRanges(font)
  if (subsetIncludeRanges.length > 0) {
    writeTomlSection(lines, `buildPlans.${tomlKey(id)}.subset.include`, {
      ranges: subsetIncludeRanges,
    })
  }
  const subsetExcludeRanges = makeSubsetTomlExcludes(font)
  if (subsetExcludeRanges.length > 0) {
    writeTomlSection(lines, `buildPlans.${tomlKey(id)}.subset.exclude`, {
      ranges: subsetExcludeRanges,
    })
  }
  return `${lines.join('\n')}\n`
}
const loadFontPresets = async (fontsFolder: string) => {
  const entries = await readdir(fontsFolder, {withFileTypes: true})
  const fontFiles = entries
    .filter(entry => entry.isFile() && /\.(?:js|mjs|ts)$/iu.test(entry.name) && !entry.name.endsWith('.d.ts'))
    .map(entry => path.join(fontsFolder, entry.name))
    .toSorted((a, b) => path.basename(a).localeCompare(path.basename(b)))
  if (fontFiles.length === 0) {
    throw new Error(`No Antimono font preset files found in ${fontsFolder}.`)
  }
  const loadedFonts: Array<LoadedFont> = []
  for (const fontFile of fontFiles) {
    const module = await import(pathToFileURL(fontFile).href) as {
      default?: Font
    }
    if (!module.default) {
      throw new Error(`Font preset ${fontFile} does not have a default export.`)
    }
    loadedFonts.push({
      file: fontFile,
      font: module.default,
      id: path.basename(fontFile, path.extname(fontFile)),
    })
  }
  return loadedFonts
}
const resolveIosevkaSource = (loadedFonts: Array<LoadedFont>) => {
  const repos = [...new Set(loadedFonts.map(loadedFont => loadedFont.font.iosevka.repo))]
  if (repos.length > 1) {
    throw new Error(`Font presets use multiple Iosevka repositories: ${repos.join(', ')}.`)
  }
  const versions = [...new Set(loadedFonts.map(loadedFont => normalizeIosevkaSource(loadedFont.font.iosevka.version)))]
  if (versions.length > 1) {
    throw new Error(`Font presets use multiple Iosevka versions: ${versions.join(', ')}.`)
  }
  return {
    repo: repos[0],
    source: versions[0],
  }
}
const readBuildPlans = async (fontsFolder: string, intermediateTomlFolder: string): Promise<{
  buildPlanContent: string
  buildPlans: Array<BuildPlan>
  iosevkaRepo: string
  iosevkaSource: string
}> => {
  const loadedFonts = await loadFontPresets(fontsFolder)
  const {repo, source} = resolveIosevkaSource(loadedFonts)
  const buildPlans: Array<BuildPlan> = []
  const buildPlanParts: Array<string> = []
  await emptyDir(intermediateTomlFolder)
  for (const loadedFont of loadedFonts) {
    const tomlFile = path.join(intermediateTomlFolder, `${loadedFont.id}.toml`)
    const content = makeFontToml(loadedFont)
    await outputFile(tomlFile, content)
    if (buildPlans.some(existingBuildPlan => existingBuildPlan.id === loadedFont.id)) {
      throw new Error(`Duplicate Iosevka build plan id: ${loadedFont.id}`)
    }
    buildPlans.push({
      family: loadedFont.font.title,
      file: tomlFile,
      fontStretch: widthConfigs.Normal.css,
      id: loadedFont.id,
      sourceFile: loadedFont.file,
      subsetExcludeUnicodes: makeSubsetExcludeUnicodes(loadedFont.font),
      subsetUnicodes: makeSubsetUnicodes(loadedFont.font),
      variableFileName: `${loadedFont.id}.ttf`,
    })
    buildPlanParts.push(`# ${path.basename(tomlFile)}\n${content.trim()}`)
  }
  if (buildPlans.length === 0) {
    throw new Error(`No Iosevka build plans generated from ${fontsFolder}.`)
  }
  return {
    buildPlanContent: `${buildPlanParts.join('\n\n')}\n`,
    buildPlans,
    iosevkaRepo: repo,
    iosevkaSource: source,
  }
}
const groupByBuildPlanId = (ttfFiles: Array<SourceTtfFile>) => {
  const grouped = new Map<string, Array<SourceTtfFile>>
  for (const ttfFile of ttfFiles) {
    const existing = grouped.get(ttfFile.buildPlan.id)
    if (existing) {
      existing.push(ttfFile)
      continue
    }
    grouped.set(ttfFile.buildPlan.id, [ttfFile])
  }
  return grouped
}
const writeFontFiles = async (pythonExecutable: string, processorFile: string, iconsFile: string, ttfOutputFolder: string, woff2OutputFolder: string, sourceTtfFiles: Array<SourceTtfFile>, nerdFontUnicodes: string) => {
  const variableFonts: Array<VariableFontFile> = []
  const staticFonts: Array<StandaloneFontFile> = []
  const symbolsFonts: Array<StandaloneFontFile> = []
  const groupedTtfFiles = groupByBuildPlanId(sourceTtfFiles)
  for (const buildPlanTtfFiles of groupedTtfFiles.values()) {
    const buildPlan = buildPlanTtfFiles[0].buildPlan
    if (buildPlanTtfFiles.length !== 4) {
      throw new Error(`Expected exactly 4 Iosevka TTF masters for ${buildPlan.id}, got ${buildPlanTtfFiles.length}.`)
    }
    const request = {
      family: buildPlan.family,
      version: packageMetadata.version,
      stem: path.basename(buildPlan.variableFileName, '.ttf'),
      ttfFolder: ttfOutputFolder,
      woff2Folder: woff2OutputFolder,
      iconsFile,
      inputFiles: buildPlanTtfFiles.map(ttfFile => ttfFile.file),
      subsetUnicodes: [buildPlan.subsetUnicodes, nerdFontUnicodes].filter(Boolean).join(','),
      subsetExcludeUnicodes: buildPlan.subsetExcludeUnicodes,
    }
    const {stdout} = await runCaptureStdout(pythonExecutable, [processorFile, 'build-family', JSON.stringify(request)])
    const result = JSON.parse(stdout) as FontFamilyProcessorResult
    variableFonts.push({
      ...result.variable,
      buildPlan,
      file: path.join(ttfOutputFolder, buildPlan.variableFileName),
    })
    staticFonts.push(...result.staticFonts.map(font => ({
      ...font,
      buildPlan,
    })))
    symbolsFonts.push({
      ...result.symbolsFont,
      buildPlan,
    })
  }
  return {
    variableFonts,
    staticFonts,
    symbolsFonts,
  }
}
const makeFontFaces = (variableFonts: Array<VariableFontFile>): Array<FontFace> => {
  return variableFonts.map(variableFont => {
    const fileName = variableFont.buildPlan.variableFileName.replace(/\.ttf$/iu, '.woff2')
    return {
      family: variableFont.buildPlan.family,
      fileName,
      fontStretch: variableFont.buildPlan.fontStretch,
      sortKey: makeFontFaceSortKey({
        fileName,
        fontStretch: variableFont.buildPlan.fontStretch,
      }),
    }
  })
}
const makeStaticCss = (fonts: Array<StandaloneFontFile>, symbolsOnly = false) => {
  return `${fonts.map(font => {
    const family = symbolsOnly ? `${font.buildPlan.family} Symbols` : font.family
    return [
      '@font-face {',
      `  font-family: "${family}";`,
      `  src: url("./woff2/${font.woff2FileName}") format("woff2");`,
      '  font-display: swap;',
      `  font-stretch: ${font.fontStretch};`,
      `  font-style: ${font.fontStyle};`,
      `  font-weight: ${font.fontWeight};`,
      '}',
    ].join('\n')
  }).join('\n\n')}\n`
}
const makeManifest = (buildPlans: Array<BuildPlan>, faces: Array<FontFace>, variableFonts: Array<VariableFontFile>, staticFonts: Array<StandaloneFontFile>, symbolsFonts: Array<StandaloneFontFile>, iosevkaRepo: string, iosevkaSource: string, icons: ReadonlyArray<ResolvedIcon>, selectedNerdFontCategories: ReadonlyArray<NerdFontCategory>, nerdFontsPatcherImage: string) => {
  const now = new Date
  return `${JSON.stringify({
    builtAt: now.toISOString(),
    version: packageMetadata.version,
    buildPlans: buildPlans.map(buildPlan => {
      return {
        family: buildPlan.family,
        file: path.basename(buildPlan.file),
        id: buildPlan.id,
        sourceFile: path.basename(buildPlan.sourceFile),
        subsetExcludeUnicodes: buildPlan.subsetExcludeUnicodes,
        subsetUnicodes: buildPlan.subsetUnicodes,
        variableFileName: buildPlan.variableFileName,
      }
    }),
    families: [...new Set(buildPlans.map(buildPlan => buildPlan.family))],
    icons: icons.map(icon => {
      return {
        code: `U+${icon.code}`,
        codePoint: icon.codePoint,
        id: icon.id,
        name: icon.name,
        source: icon.source,
      }
    }),
    iosevkaRepo,
    iosevkaSource,
    nerdFonts: {
      categories: selectedNerdFontCategories,
      patcherImage: nerdFontsPatcherImage,
    },
    trueTypeFiles: [...variableFonts.map(variableFont => path.basename(variableFont.file)), ...staticFonts.map(font => font.fileName), ...symbolsFonts.map(font => font.fileName)],
    staticFonts: staticFonts.map(({buildPlan, ...font}) => ({
      ...font,
      buildPlan: buildPlan.id,
    })),
    symbolsFonts: symbolsFonts.map(({buildPlan, ...font}) => ({
      ...font,
      buildPlan: buildPlan.id,
    })),
    variableAxes: {
      ital: {
        default: 0,
        max: 1,
        min: 0,
      },
      wght: {
        default: 0,
        max: 1000,
        min: 0,
        snap: {
          bold: [500, 1000],
          regular: [0, 499],
        },
      },
    },
    variableFonts: variableFonts.map(variableFont => {
      return {
        copiedGlyphCount: variableFont.copiedGlyphCount,
        extendedGsubSubstitutionCount: variableFont.extendedGsubSubstitutionCount,
        file: path.basename(variableFont.file),
        featureVariationSubstitutionCount: variableFont.featureVariationSubstitutionCount,
        masterSubsetGlyphCount: variableFont.masterSubsetGlyphCount,
        mergedGlyphCount: variableFont.mergedGlyphCount,
        originalGlyphCount: variableFont.originalGlyphCount,
        subsetGlyphCount: variableFont.subsetGlyphCount,
      }
    }),
    woff2Files: [...faces.map(face => face.fileName), ...staticFonts.map(font => font.woff2FileName), ...symbolsFonts.map(font => font.woff2FileName)],
  }, null, 2)}\n`
}

export const antimono = async (options: AntimonoOptions = {}) => {
  const resolvedOptions = {
    clean: options.clean ?? defaultOptions.clean,
    dockerHost: options.dockerHost,
    iosevkaBuilderImage: options.iosevkaBuilderImage ?? defaultOptions.iosevkaBuilderImage,
    nerdFontsPatcherImage: options.nerdFontsPatcherImage ?? defaultOptions.nerdFontsPatcherImage,
    output: options.output ?? defaultOptions.output,
    temp: options.temp ?? defaultOptions.temp,
  }
  const selectedNerdFontCategories = normalizeNerdFontCategories(options.nerdFontCategories ?? [])
  const nerdFontUnicodes = makeNerdFontUnicodes(selectedNerdFontCategories)
  const rootFolder = path.resolve(options.rootFolder ?? path.join(import.meta.dir, '..'))
  const fontsFolder = options.fontsFolder ? path.resolve(rootFolder, options.fontsFolder) : path.join(import.meta.dir, 'fonts')
  const outputFolder = path.resolve(rootFolder, resolvedOptions.output)
  const tempFolder = path.resolve(rootFolder, resolvedOptions.temp)
  const log = options.log ?? console.log
  const workFolder = path.join(tempFolder, 'work')
  const intermediateTomlFolder = path.join(tempFolder, 'build-plans')
  const woff2OutputFolder = path.join(outputFolder, 'woff2')
  const ttfOutputFolder = path.join(outputFolder, 'ttf')
  const pythonEnvironmentFolder = path.join(tempFolder, '.venv')
  const pythonExecutable = process.platform === 'win32' ? path.join(pythonEnvironmentFolder, 'Scripts', 'python.exe') : path.join(pythonEnvironmentFolder, 'bin', 'python')
  const iosevkaCloneFolder = path.join(tempFolder, 'Iosevka')
  const nerdFontsTempFolder = path.join(tempFolder, 'nerd-fonts')
  const iconsFile = path.join(tempFolder, 'icons.json')
  const processorFile = makeFontProcessor(tempFolder)
  const {buildPlanContent, buildPlans, iosevkaRepo, iosevkaSource} = await readBuildPlans(fontsFolder, intermediateTomlFolder)
  const icons = await loadIcons(path.join(import.meta.dir, 'icons'))
  if (resolvedOptions.clean) {
    await emptyDir(outputFolder)
  }
  await emptyDir(workFolder)
  await ensureDir(woff2OutputFolder)
  await emptyDir(woff2OutputFolder)
  await emptyDir(ttfOutputFolder)
  await outputFile(path.join(workFolder, 'private-build-plans.toml'), buildPlanContent)
  if (!await imageExists(resolvedOptions.iosevkaBuilderImage, resolvedOptions.dockerHost)) {
    log(`Building Docker image ${resolvedOptions.iosevkaBuilderImage}…`)
    await buildIosevkaBuilderImage(resolvedOptions.iosevkaBuilderImage, iosevkaCloneFolder, iosevkaRepo, resolvedOptions.dockerHost)
  }
  const iosevkaContainer = `antimono-iosevka-${process.pid}`
  log(`Building ${buildPlans.map(buildPlan => buildPlan.family).join(', ')} TTFs from ${iosevkaRepo} ${iosevkaSource}…`)
  try {
    await runDockerQuiet(resolvedOptions.dockerHost, [
      'create',
      '--name',
      iosevkaContainer,
      '-e',
      `SOURCE=${iosevkaSource}`,
      resolvedOptions.iosevkaBuilderImage,
      ...buildPlans.map(buildPlan => `ttf::${buildPlan.id}`),
      '--jCmd=1',
    ])
    await runDockerVerbose(resolvedOptions.dockerHost, ['cp', `${normalizeDockerClientPath(workFolder)}/.`, `${iosevkaContainer}:/work`])
    await runDockerVerbose(resolvedOptions.dockerHost, ['start', '--attach', iosevkaContainer])
    await runDockerVerbose(resolvedOptions.dockerHost, ['cp', `${iosevkaContainer}:/work/dist`, normalizeDockerClientPath(workFolder)])
  } finally {
    await removeDockerContainer(resolvedOptions.dockerHost, iosevkaContainer)
  }
  const {missingBuildPlans, sourceTtfFiles} = await getIosevkaTtfFiles(workFolder, buildPlans)
  if (sourceTtfFiles.length === 0) {
    throw new Error('Iosevka did not produce any TTF files.')
  }
  if (missingBuildPlans.length > 0) {
    const missingPlanIds = missingBuildPlans.map(buildPlan => buildPlan.id).join(', ')
    throw new Error(`Iosevka did not produce TTF files for build plan(s): ${missingPlanIds}.`)
  }
  log('Preparing Python FontTools processor…')
  await runVerbose('python', ['-m', 'venv', pythonEnvironmentFolder])
  await runVerbose(pythonExecutable, ['-m', 'pip', 'install', '--upgrade', 'pip', 'fonttools', 'brotli', 'picosvg'])
  await outputFile(processorFile, await Bun.file(new URL('font-processor.py', import.meta.url)).text())
  await outputFile(iconsFile, `${JSON.stringify(icons, null, 2)}\n`)
  const preparedSourceTtfFiles = await patchNerdFontSourceFiles(sourceTtfFiles, selectedNerdFontCategories, resolvedOptions.nerdFontsPatcherImage, nerdFontsTempFolder, pythonExecutable, processorFile, log, resolvedOptions.dockerHost)
  await ensureDir(ttfOutputFolder)
  log('Building variable, standalone style, and custom-symbol fonts…')
  const {variableFonts, staticFonts, symbolsFonts} = await writeFontFiles(pythonExecutable, processorFile, iconsFile, ttfOutputFolder, woff2OutputFolder, preparedSourceTtfFiles, nerdFontUnicodes)
  const fontFaces = makeFontFaces(variableFonts)
  const sortedFontFaces = fontFaces.toSorted((a, b) => {
    return a.family.localeCompare(b.family) || a.sortKey.localeCompare(b.sortKey)
  })
  await outputFile(path.join(outputFolder, 'antimono.css'), makeCss(sortedFontFaces))
  await outputFile(path.join(outputFolder, 'antimono-static.css'), makeStaticCss(staticFonts))
  await outputFile(path.join(outputFolder, 'antimono-symbols.css'), makeStaticCss(symbolsFonts, true))
  await outputFile(path.join(outputFolder, 'private-build-plans.toml'), buildPlanContent)
  await copyFolder(intermediateTomlFolder, path.join(outputFolder, 'build-plans'))
  await outputFile(path.join(outputFolder, 'manifest.json'), makeManifest(buildPlans, sortedFontFaces, variableFonts, staticFonts, symbolsFonts, iosevkaRepo, iosevkaSource, icons, selectedNerdFontCategories, resolvedOptions.nerdFontsPatcherImage))
  const fontCount = variableFonts.length + staticFonts.length + symbolsFonts.length
  log(`Wrote ${fontCount} TTF files and ${fontCount} WOFF2 files to ${outputFolder}.`)
}

export default antimono
