import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const assetsDir = path.join(root, 'dist', 'assets')
const budget = JSON.parse(await readFile(path.join(root, 'config', 'bundle-budget.json'), 'utf8'))
const names = (await readdir(assetsDir)).filter((name) => /\.(?:js|css)$/.test(name))
const normalize = (name) => name.replace(/-[A-Za-z0-9_-]{8}(?=\.(?:js|css)$)/, '')
const current = new Map()

for (const file of names) {
  const bytes = await readFile(path.join(assetsDir, file))
  current.set(normalize(file), gzipSync(bytes, { level: 9 }).byteLength)
}

const failures = []
const total = [...current.values()].reduce((sum, value) => sum + value, 0)
const totalLimit = Math.ceil(budget.totalGzip * (1 + budget.totalGrowthPercent / 100))
if (total > totalLimit) failures.push(`总 gzip ${total} 超过预算 ${totalLimit}`)

for (const [name, baseline] of Object.entries(budget.files)) {
  const size = current.get(name)
  if (size === undefined) {
    failures.push(`基线 chunk 缺失：${name}`)
    continue
  }
  const limit = Math.ceil(baseline * (1 + budget.existingChunkGrowthPercent / 100))
  if (size > limit) failures.push(`${name} gzip ${size} 超过预算 ${limit}`)
}

for (const [name, size] of current) {
  if (!(name in budget.files) && size > budget.maxNewChunkGzip) {
    failures.push(`新 chunk ${name} gzip ${size} 超过预算 ${budget.maxNewChunkGzip}`)
  }
}

if (failures.length) {
  console.error(['Bundle budget failed:', ...failures.map((item) => `- ${item}`)].join('\n'))
  process.exitCode = 1
} else {
  console.log(`Bundle budget passed: ${total}/${totalLimit} gzip bytes`)
}
