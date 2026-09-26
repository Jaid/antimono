import path from 'node:path'

import capturePage from 'capture-page'

type FontSpec = {
  family: string
  note?: string
}

const projectRoot = path.join(import.meta.dir, '..')
const outputFile = path.resolve(projectRoot, Bun.argv[2] ?? 'out/comparison/font-comparison.png')
const htmlOutputFile = outputFile.replace(/\.[^.]+$/u, '.html')
const fontFolder = path.join(projectRoot, 'out', 'woff2')
const readFont = async (fileName: string) => {
  const sourceFile = path.join(fontFolder, fileName)
  const file = Bun.file(sourceFile)
  if (!await file.exists()) {
    throw new Error(`Missing ${path.relative(projectRoot, sourceFile)}. Run bun run start first.`)
  }
  const data = new Uint8Array(await file.arrayBuffer())
  return data.toBase64()
}
const [
  antimonoRegular,
  antimonoItalic,
  antimonoBold,
  antimonoBoldItalic,
] = await Promise.all([
  readFont('antimono_regular.woff2'),
  readFont('antimono_regular-italic.woff2'),
  readFont('antimono_bold.woff2'),
  readFont('antimono_bold-italic.woff2'),
])
const fonts: Array<FontSpec> = [
  {
    family: 'Antimono Comparison',
    note: 'Antimono',
  },
  {family: 'Geist Mono'},
  {family: 'JetBrains Mono'},
  {family: 'Monaspace Neon'},
  {family: 'Cascadia Code'},
  {family: 'Consolas'},
  {family: 'Fira Code'},
  {family: 'Source Code Pro'},
]
const escapeHtml = (value: string) => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
const fontRules = fonts.map((font, index) => {
  return `.font-${index} .specimen { font-family: ${JSON.stringify(font.family)}, monospace; }`
}).join('\n')
const cards = fonts.map((font, index) => {
  const title = font.note ?? font.family
  const badge = index === 0 ? '<span class="badge">current</span>' : ''
  return `
    <section class="card font-${index}">
      <header>
        <div class="font-name">${escapeHtml(title)}</div>
        ${badge}
      </header>
      <div class="specimen">
        <div class="ambiguity">Il1 0Oo rn/m {}[]() @ # _ → ≠ ≤ ≥</div>
        <pre><span class="keyword">export type</span> RequestState = {
  id: string
  enabled: boolean
  retries: number
}

<span class="keyword">const</span> parse = (input: string) =&gt; {
  <span class="keyword">const</span> url = <span class="keyword">new</span> URL(input)
  <span class="keyword">return</span> {
    host: url.hostname,
    port: Number(url.port || <span class="string">'443'</span>),
    ok: url.protocol === <span class="string">'https:'</span>,
  }
}

<span class="comment">// punctuation and identifier rhythm</span>
foo?.bar ??= baz(qux[0])
normalizeNerdFontCategories
fetchCurrentWeeklyQuota()</pre>
      </div>
    </section>
  `
}).join('')
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<style>
@font-face {
  font-family: "Antimono Comparison";
  src: url("data:font/woff2;base64,${antimonoRegular}") format("woff2");
  font-style: normal;
  font-weight: 400;
}
@font-face {
  font-family: "Antimono Comparison";
  src: url("data:font/woff2;base64,${antimonoItalic}") format("woff2");
  font-style: italic;
  font-weight: 400;
}
@font-face {
  font-family: "Antimono Comparison";
  src: url("data:font/woff2;base64,${antimonoBold}") format("woff2");
  font-style: normal;
  font-weight: 700;
}
@font-face {
  font-family: "Antimono Comparison";
  src: url("data:font/woff2;base64,${antimonoBoldItalic}") format("woff2");
  font-style: italic;
  font-weight: 700;
}

:root {
  background: #0d1117;
  color: #e6edf3;
  font-family: system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 100%;
  background: #0d1117;
}

main {
  width: 100%;
  padding: 32px;
}

.page-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.subtitle {
  color: #8b949e;
  font-size: 13px;
  white-space: nowrap;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.card {
  overflow: hidden;
  min-width: 0;
  border: 1px solid #30363d;
  border-radius: 10px;
  background: #161b22;
}

.card header {
  display: flex;
  height: 45px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 17px;
  border-bottom: 1px solid #21262d;
}

.font-name {
  color: #c9d1d9;
  font-size: 13px;
  font-weight: 600;
}

.badge {
  padding: 2px 7px;
  border: 1px solid #3d444d;
  border-radius: 999px;
  color: #8b949e;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.specimen {
  padding: 16px 18px 18px;
  font-synthesis: none;
  font-variant-ligatures: none;
  font-feature-settings: "liga" 0, "calt" 0;
}

.ambiguity {
  overflow: hidden;
  margin-bottom: 14px;
  color: #f0f6fc;
  font-size: 20px;
  line-height: 1.35;
  white-space: nowrap;
}

pre {
  margin: 0;
  overflow: hidden;
  color: #e6edf3;
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  tab-size: 2;
  white-space: pre;
}

.keyword {
  font-weight: 700;
}

.string {
  color: #a5d6a7;
}

.comment {
  color: #8b949e;
  font-style: italic;
}

${fontRules}
</style>
</head>
<body>
<main>
  <div class="page-header">
    <h1>Antimono editor comparison</h1>
    <div class="subtitle">14 px code · 20 px glyph check · ligatures off · Chromium</div>
  </div>
  <div class="grid">
    ${cards}
  </div>
</main>
</body>
</html>`
await Bun.write(htmlOutputFile, html)
const result = await capturePage.save(
  {html},
  outputFile,
  {
    colorScheme: 'dark',
    fullPage: true,
    height: 1000,
    wait: 'load',
    width: 1600,
  },
)
console.log(`${result.buffer.byteLength} bytes · ${Math.round(result.passedTime)} ms → ${path.relative(projectRoot, outputFile)}`)
console.log(`HTML → ${path.relative(projectRoot, htmlOutputFile)}`)
