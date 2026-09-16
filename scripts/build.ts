// eslint-disable-next-line no-restricted-imports -- Packaging uses the native filesystem API only.
import {cp, mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import * as path from 'node:path'

const projectRoot = path.join(import.meta.dir, '..')
const outFolder = path.join(projectRoot, 'out')
const distFolder = path.join(projectRoot, 'dist')
const cssFolder = path.join(distFolder, 'css')
const copyFolder = async (sourceName: string, destinationName: string) => {
  const source = path.join(outFolder, sourceName)
  const destination = path.join(distFolder, destinationName)
  await cp(source, destination, {
    force: true,
    recursive: true,
  })
}
await rm(distFolder, {
  force: true,
  recursive: true,
})
await mkdir(cssFolder, {recursive: true})
await copyFolder('ttf', 'ttf')
await copyFolder('woff2', 'woff')
const manifest = JSON.parse(await readFile(path.join(outFolder, 'manifest.json'), 'utf8')) as unknown
await writeFile(path.join(distFolder, 'manifest.json'), JSON.stringify(manifest))
const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8')) as {
  description: string
  funding: string
  license: string
  name: string
  repository: {
    type: string
    url: string
  }
  version: string
}
await writeFile(path.join(distFolder, 'package.json'), JSON.stringify({
  name: packageJson.name,
  version: packageJson.version,
  sideEffects: false,
  description: packageJson.description,
  repository: packageJson.repository,
  license: packageJson.license,
  funding: packageJson.funding,
}))
const outEntries = await readdir(outFolder, {withFileTypes: true})
for (const entry of outEntries) {
  if (!entry.isFile() || !entry.name.endsWith('.css')) {
    continue
  }
  const source = path.join(outFolder, entry.name)
  const destination = path.join(cssFolder, entry.name)
  const content = await readFile(source, 'utf8')
  await writeFile(destination, content.replaceAll('./woff2/', '../woff/'))
}
console.log(`Built distribution in ${distFolder}`)
