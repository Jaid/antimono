import type {ComponentType} from 'react'

import * as path from 'node:path'

import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

export type IconSource = {
  id: string
  vendor: string
} | string

export type IconDefinition = {
  code: number | string
  name: string
  source: IconSource
}

export type ResolvedIcon = {
  code: string
  codePoint: number
  id: string
  name: string
  source: IconSource
  svg: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const parseIconCodePoint = (value: number | string) => {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 0x10_FF_FF) {
      throw new TypeError(`Invalid icon code point: ${value}`)
    }
    return value
  }
  const match = /^(?:0x|u\+)?([\da-f]{4,6})$/iu.exec(value.trim())
  if (!match) {
    throw new TypeError(`Invalid icon code point: ${value}`)
  }
  const codePoint = Number.parseInt(match[1], 16)
  if (codePoint > 0x10_FF_FF) {
    throw new TypeError(`Invalid icon code point: ${value}`)
  }
  return codePoint
}

export const formatIconCodePoint = (codePoint: number) => {
  return codePoint.toString(16).toUpperCase().padStart(4, '0')
}

const parseIconDefinition = (id: string, value: unknown): IconDefinition => {
  if (!isRecord(value) || typeof value.name !== 'string' || !('code' in value) || !('source' in value)) {
    throw new TypeError(`Invalid icon definition: ${id}`)
  }
  const {source} = value
  if (typeof source !== 'string' && !(isRecord(source) && typeof source.vendor === 'string' && typeof source.id === 'string')) {
    throw new TypeError(`Invalid icon source: ${id}`)
  }
  if (typeof value.code !== 'string' && typeof value.code !== 'number') {
    throw new TypeError(`Invalid icon code: ${id}`)
  }
  return {
    code: value.code,
    name: value.name,
    source: source as IconSource,
  }
}
const assertSvg = (id: string, svg: string) => {
  if (!/<svg(?:\s|>)/iu.test(svg)) {
    throw new TypeError(`Icon ${id} did not resolve to an SVG document.`)
  }
  return svg
}
const loadReactIconSvg = async (id: string, vendor: string, exportId: string) => {
  const moduleName = `react-icons/${vendor}`
  const iconModule = await import(moduleName) as Record<string, unknown>
  const icon = iconModule[exportId]
  if (typeof icon !== 'function') {
    throw new TypeError(`React icon ${moduleName} does not export ${exportId}.`)
  }
  const component = icon as ComponentType<Record<string, unknown>>
  return assertSvg(id, renderToStaticMarkup(createElement(component, {
    'aria-hidden': true,
  })))
}

export const resolveIconSvg = async (id: string, source: IconSource, iconsFolder: string) => {
  if (typeof source !== 'string') {
    return loadReactIconSvg(id, source.vendor, source.id)
  }
  if (/^https?:\/\//iu.test(source)) {
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`Failed to download icon ${id} from ${source}: HTTP ${response.status}.`)
    }
    return assertSvg(id, await response.text())
  }
  return assertSvg(id, await Bun.file(path.resolve(iconsFolder, source)).text())
}

export const loadIcons = async (iconsFolder = import.meta.dir): Promise<Array<ResolvedIcon>> => {
  const yaml = Bun.YAML.parse(await Bun.file(path.join(iconsFolder, 'index.yml')).text())
  if (!isRecord(yaml)) {
    throw new TypeError('Icon index must be a YAML mapping.')
  }
  const icons: Array<ResolvedIcon> = []
  const usedCodePoints = new Map<number, string>
  for (const [id, rawDefinition] of Object.entries(yaml)) {
    const definition = parseIconDefinition(id, rawDefinition)
    const codePoint = parseIconCodePoint(definition.code)
    const conflictingIcon = usedCodePoints.get(codePoint)
    if (conflictingIcon) {
      throw new Error(`Icons ${conflictingIcon} and ${id} both use U+${formatIconCodePoint(codePoint)}.`)
    }
    usedCodePoints.set(codePoint, id)
    icons.push({
      ...definition,
      code: formatIconCodePoint(codePoint),
      codePoint,
      id,
      svg: await resolveIconSvg(id, definition.source, iconsFolder),
    })
  }
  return icons
}

export default loadIcons
