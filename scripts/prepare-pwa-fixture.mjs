import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

// The upgrade test needs a realistic generateSW-era worker. Keep this fixture
// out of public/ so it can never ship in production; write it only into the
// preview dist directory immediately before the test server starts.
await mkdir('dist', { recursive: true })
await mkdir('dist/pwa-test', { recursive: true })
await writeFile('dist/pwa-test/index.html', `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>个人工作台</title></head><body><h1>个人工作台</h1></body></html>`)
async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(path))
    else files.push(path)
  }
  return files
}

const shellFiles = (await listFiles('dist'))
  .filter((path) => /\.(?:html|js|css|svg|png|woff2)$/.test(path) && !path.endsWith(`${sep}sw.js`) && !path.endsWith(`${sep}legacy-sw.js`))
  .map((path) => `/${relative('dist', path).split(sep).join('/')}`)

await writeFile('dist/legacy-sw.js', `
const SHELL_FILES = ${JSON.stringify(shellFiles)};
self.addEventListener('install', event => event.waitUntil(caches.open('legacy-generate-sw-v1').then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => { if (event.request.mode === 'navigate') event.respondWith(caches.match(event.request).then(cached => cached || caches.match('/pwa-test/index.html')).then(cached => cached || fetch(event.request))); });
`)
