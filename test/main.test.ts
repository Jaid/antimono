import {expect, test} from 'bun:test'
import * as path from 'node:path'

import packageMetadata from '#root/package.json'
import antimono, {defaultOptions, makeNerdFontUnicodes, nerdFontCategories, normalizeNerdFontCategories} from '#src/antimono.ts'
import antimonoPreset from '#src/fonts/antimono.ts'
import loadIcons, {resolveIconSvg} from '#src/icons/loadIcons.ts'

test('exports the Antimono builder', () => {
  expect(typeof antimono).toBe('function')
  expect(defaultOptions).toEqual({
    clean: true,
    iosevkaBuilderImage: 'antimono-iosevka-builder',
    nerdFontsPatcherImage: 'nerdfonts/patcher',
    output: 'out',
    temp: 'temp',
  })
})
test('ships only the Antimono preset', async () => {
  const glob = new Bun.Glob('*.ts')
  const fontFiles = [...glob.scanSync({cwd: path.join(import.meta.dir, '..', 'src', 'fonts')})].toSorted()
  expect(fontFiles).toEqual(['antimono.ts'])
  expect(antimonoPreset.title).toBe('Antimono')
  expect(antimonoPreset.iosevka.version).toBe('34.8.0')
})
test('normalizes Nerd Fonts categories and maps their Unicode ranges', () => {
  expect(nerdFontCategories).toContain('material')
  expect(normalizeNerdFontCategories(['powerline', 'material', 'powerline'])).toEqual(['material', 'powerline'])
  expect(makeNerdFontUnicodes(['material', 'powerline'])).toBe('U+F0001-F1AF0,U+E0A0-E0A2,U+E0B0-E0B3')
  expect(() => normalizeNerdFontCategories(['unknown'])).toThrow('Unknown Nerd Fonts category: unknown')
})
test('CLI help exposes repeatable Nerd Fonts category selection', () => {
  const result = Bun.spawnSync(['bun', path.join(import.meta.dir, '..', 'src', 'main.ts'), '--help'], {
    cwd: path.join(import.meta.dir, '..'),
    stderr: 'pipe',
    stdout: 'pipe',
  })
  expect(result.exitCode).toBe(0)
  const stdout = result.stdout.toString()
  expect(stdout).toContain('--docker-host')
  expect(stdout).toContain('--nerd-font')
  expect(stdout).toContain('fontawesome')
  expect(stdout).toContain('--no-clean')
  const invalidResult = Bun.spawnSync(['bun', path.join(import.meta.dir, '..', 'src', 'main.ts'), '--nerd-font', 'invalid'], {
    cwd: path.join(import.meta.dir, '..'),
    stderr: 'pipe',
    stdout: 'pipe',
  })
  expect(invalidResult.exitCode).not.toBe(0)
  expect(invalidResult.stderr.toString()).toContain('invalid')
})
test('resolves bundled custom icons', async () => {
  const iconsFolder = path.join(import.meta.dir, '..', 'src', 'icons')
  const icons = await loadIcons(iconsFolder)
  expect(icons.map(icon => [icon.id, icon.code])).toEqual([
    ['moon', 'E100'],
    ['sun', 'E101'],
    ['cog', 'E102'],
    ['openrouter', 'E103'],
  ])
  for (const icon of icons) {
    expect(icon.svg).toContain('<svg')
  }
  expect(icons[0].source).toEqual({
    id: 'FaMoon',
    vendor: 'fa6',
  })
  expect(icons[3].source).toBe('openrouter.svg')
})
test('resolves remote SVG icon URLs', async () => {
  const server = Bun.serve({
    port: 0,
    fetch: () => {
      return new Response('<svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>')
    },
  })
  try {
    const svg = await resolveIconSvg('remote', `http://127.0.0.1:${server.port}/icon.svg`, import.meta.dir)
    expect(svg).toContain('viewBox="0 0 10 10"')
  } finally {
    await server.stop(true)
  }
})
test('CLI version comes from this package rather than the calling environment', () => {
  const result = Bun.spawnSync(['bun', path.join(import.meta.dir, '..', 'src', 'main.ts'), '--version'], {
    cwd: path.join(import.meta.dir, '..'),
    env: {
      ...process.env,
      npm_package_version: '99.99.99',
    },
    stderr: 'pipe',
    stdout: 'pipe',
  })
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString().trim()).toBe(`v${packageMetadata.version}`)
})
