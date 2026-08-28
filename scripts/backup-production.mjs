import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { listObjects, putObject, deleteObject, sha256Hex } from './s3.mjs'

const execFile = promisify(execFileCallback)
const ageBin = process.env.AGE_BIN || 'age'
const pgDumpBin = process.env.PG_DUMP_BIN || 'pg_dump'
const recipient = process.env.AGE_RECIPIENT
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const prefix = (process.env.S3_PREFIX || 'personal-workbench').replace(/^\/+|\/+$/g, '')

function required(name, value) {
  if (!value) throw new Error(`${name} 未配置`)
  return value
}

function todayParts() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  const day = `${parts.year}-${parts.month}-${parts.day}`
  return { day, month: day.slice(0, 7), monthly: parts.day === '01' }
}

async function ageEncrypt(input, output) {
  await execFile(ageBin, ['-r', recipient, '-o', output, input])
}

async function uploadFile(key, file) {
  const bytes = await readFile(file)
  await putObject(key, bytes)
  return { key, bytes: bytes.byteLength, sha256: sha256Hex(bytes) }
}

function opaqueAvatarName(storagePath) {
  return `${createHash('sha256').update(storagePath).digest('hex')}.age`
}

async function cleanupRetention() {
  const [daily, monthly] = await Promise.all([listObjects(`${prefix}/daily/`), listObjects(`${prefix}/monthly/`)])
  const keptVersions = (objects, pattern, limit) => {
    const dates = [...new Set(objects.map((object) => object.key.match(pattern)?.[1]).filter(Boolean))].sort().reverse()
    return new Set(dates.slice(0, limit))
  }
  const dailyKeep = keptVersions(daily, /\/daily\/(\d{4}-\d{2}-\d{2})\//, 30)
  const monthlyKeep = keptVersions(monthly, /\/monthly\/(\d{4}-\d{2})\//, 12)
  const expired = [
    ...daily.filter((object) => !dailyKeep.has(object.key.match(/\/daily\/(\d{4}-\d{2}-\d{2})\//)?.[1])),
    ...monthly.filter((object) => !monthlyKeep.has(object.key.match(/\/monthly\/(\d{4}-\d{2})\//)?.[1]))
  ]
  // Retention only runs after every object and both manifests for this backup succeeded.
  await Promise.all(expired.map((object) => deleteObject(object.key)))
  return { dailyVersions: dailyKeep.size, monthlyVersions: monthlyKeep.size, deletedObjects: expired.length }
}

async function main() {
  required('AGE_RECIPIENT', recipient)
  required('SUPABASE_DB_URL', dbUrl)
  required('SUPABASE_URL', supabaseUrl)
  required('SUPABASE_SERVICE_ROLE_KEY', serviceKey)
  const { day, month, monthly } = todayParts()
  const root = await mkdtemp(join(tmpdir(), 'workbench-backup-'))
  try {
    const dump = join(root, 'database.dump')
    // Include user-facing data and private operational evidence/restore tables;
    // Supabase Auth and Storage internals remain managed by their services.
    await execFile(pgDumpBin, ['--dbname', dbUrl, '--format=custom', '--no-owner', '--no-acl', '--schema=public', '--schema=private', '--file', dump])
    const encryptedDump = join(root, 'database.dump.age')
    await ageEncrypt(dump, encryptedDump)

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const bucket = supabase.storage.from('avatars')
    async function listAll(path = '') {
      const files = []
      for (let offset = 0; ; offset += 1000) {
        const listed = await bucket.list(path, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
        if (listed.error) throw listed.error
        const page = listed.data ?? []
        for (const item of page) {
          const child = path ? `${path}/${item.name}` : item.name
          if (item.id) files.push(child)
          else files.push(...await listAll(child))
        }
        if (page.length < 1000) break
      }
      return files
    }

    const storagePaths = await listAll()
    const avatarDir = join(root, 'avatars')
    await mkdir(avatarDir)
    const avatarEntries = []
    for (const storagePath of storagePaths) {
      const downloaded = await bucket.download(storagePath)
      if (downloaded.error) throw downloaded.error
      const encryptedName = opaqueAvatarName(storagePath)
      const source = join(avatarDir, encryptedName.slice(0, -4))
      await writeFile(source, Buffer.from(await downloaded.data.arrayBuffer()))
      const encrypted = join(avatarDir, encryptedName)
      await ageEncrypt(source, encrypted)
      avatarEntries.push({ storage_path: storagePath, object: `avatars/${encryptedName}`, sha256: sha256Hex(await readFile(encrypted)) })
    }

    const targets = [`${prefix}/daily/${day}`, ...(monthly ? [`${prefix}/monthly/${month}`] : [])]
    const createdAt = new Date().toISOString()
    let uploaded = 0
    for (const target of targets) {
      const database = await uploadFile(`${target}/database.dump.age`, encryptedDump)
      const avatars = []
      for (const avatar of avatarEntries) {
        const uploadedAvatar = await uploadFile(`${target}/${avatar.object}`, join(avatarDir, avatar.object.slice('avatars/'.length)))
        avatars.push({ ...avatar, ...uploadedAvatar })
      }
      const manifest = {
        format: 'personal-workbench-backup-v1', created_at: createdAt, target_prefix: target,
        database, avatars, retention: { daily_versions: 30, monthly_versions: 12 }
      }
      const manifestPlain = join(root, `manifest-${uploaded}.json`)
      const manifestEncrypted = `${manifestPlain}.age`
      await writeFile(manifestPlain, JSON.stringify(manifest, null, 2))
      await ageEncrypt(manifestPlain, manifestEncrypted)
      const encryptedManifest = await uploadFile(`${target}/manifest.json.age`, manifestEncrypted)

      // This index contains only opaque object names, lengths, and hashes, so CI can
      // validate storage without access to the offline production age identity.
      const integrity = {
        format: 'personal-workbench-integrity-v1', created_at: createdAt, target_prefix: target,
        objects: [database, ...avatars.map(({ key, bytes, sha256 }) => ({ key, bytes, sha256 })), encryptedManifest]
      }
      await putObject(`${target}/integrity.json`, Buffer.from(JSON.stringify(integrity, null, 2)))
      uploaded += integrity.objects.length + 1
    }

    const retention = await cleanupRetention()
    console.log(JSON.stringify({ day, monthly, avatar_objects: avatarEntries.length, uploaded, retention }))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
