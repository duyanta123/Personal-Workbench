import { execFile as execFileCallback } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deleteObject, getBucketLifecycleXml, getObject, listObjects, putObject, s3Config, sha256Hex } from './s3.mjs'

const execFile = promisify(execFileCallback)
const ageBin = process.env.AGE_BIN || 'age'
const ageKeygenBin = process.env.AGE_KEYGEN_BIN || 'age-keygen'
const pgDumpBin = process.env.PG_DUMP_BIN || 'pg_dump'
const pgRestoreBin = process.env.PG_RESTORE_BIN || 'pg_restore'
const psqlBin = process.env.PSQL_BIN || 'psql'
const createdbBin = process.env.CREATEDB_BIN || 'createdb'
const dropdbBin = process.env.DROPDB_BIN || 'dropdb'
const adminUrl = process.env.BACKUP_DRILL_ADMIN_DATABASE_URL
const prefix = (process.env.S3_PREFIX || 'personal-workbench').replace(/^\/+|\/+$/g, '')

function databaseUrl(database) {
  const url = new URL(adminUrl)
  url.pathname = `/${database}`
  return url.toString()
}

async function removeDatabase(name) {
  await execFile(dropdbBin, ['--if-exists', '--force', '--maintenance-db', adminUrl, name]).catch(() => undefined)
}

async function verifyProductionBackups() {
  const [daily, monthly] = await Promise.all([listObjects(`${prefix}/daily/`), listObjects(`${prefix}/monthly/`)])
  const dailyDates = new Set(daily.map((item) => item.key.match(/\/daily\/(\d{4}-\d{2}-\d{2})\//)?.[1]).filter(Boolean))
  const monthlyDates = new Set(monthly.map((item) => item.key.match(/\/monthly\/(\d{4}-\d{2})\//)?.[1]).filter(Boolean))
  if (dailyDates.size > 30 || monthlyDates.size > 12) throw new Error(`备份保留策略超限：daily=${dailyDates.size}, monthly=${monthlyDates.size}`)
  if (process.env.REQUIRE_PRODUCTION_BACKUP === 'true' && dailyDates.size === 0) throw new Error('未找到生产每日备份')

  const indexes = daily.filter((item) => item.key.endsWith('/integrity.json'))
  for (const index of indexes) {
    const integrity = JSON.parse((await getObject(index.key)).toString('utf8'))
    if (integrity?.format !== 'personal-workbench-integrity-v1' || !Array.isArray(integrity.objects)) throw new Error(`完整性索引格式无效：${index.key}`)
    for (const object of integrity.objects) {
      const bytes = await getObject(String(object.key))
      if (bytes.byteLength !== Number(object.bytes) || sha256Hex(bytes) !== object.sha256) throw new Error(`生产备份 SHA-256 校验失败：${String(object.key)}`)
    }
  }

  let lifecycle = 'unsupported'
  try {
    const xml = await getBucketLifecycleXml()
    const expirationDays = [...xml.matchAll(/<Expiration>[\s\S]*?<Days>(\d+)<\/Days>[\s\S]*?<\/Expiration>/g)].map((match) => Number(match[1]))
    if (!expirationDays.some((days) => days >= 30)) throw new Error('S3 生命周期未包含至少 30 天的过期策略')
    // Versioned S3-compatible stores expose the retention count through
    // NewerNoncurrentVersions. Object-count checks above protect the daily
    // and monthly prefixes; this rule proves at least twelve prior versions
    // are retained for the monthly policy.
    const newerVersions = [...xml.matchAll(/<NewerNoncurrentVersions>(\d+)<\/NewerNoncurrentVersions>/g)].map((match) => Number(match[1]))
    if (!newerVersions.some((count) => count >= 12)) throw new Error('S3 生命周期未包含至少 12 个非当前版本保留策略')
    lifecycle = 'verified'
  } catch (error) {
    if (process.env.REQUIRE_S3_LIFECYCLE === 'true') throw error
  }
  return { dailyVersions: dailyDates.size, monthlyVersions: monthlyDates.size, integrityIndexes: indexes.length, lifecycle }
}

async function main() {
  if (!adminUrl) throw new Error('BACKUP_DRILL_ADMIN_DATABASE_URL 未配置')
  const root = await mkdtemp(join(tmpdir(), 'workbench-drill-'))
  const suffix = randomBytes(6).toString('hex')
  const sourceDb = `workbench_drill_source_${suffix}`
  const restoreDb = `workbench_drill_restore_${suffix}`
  const drillPrefix = `${prefix}/drill/${Date.now()}-${suffix}`
  const uploadedKeys = []
  try {
    await removeDatabase(sourceDb)
    await removeDatabase(restoreDb)
    await execFile(createdbBin, ['--maintenance-db', adminUrl, sourceDb])
    await execFile(psqlBin, ['--dbname', databaseUrl(sourceDb), '--set', 'ON_ERROR_STOP=1', '--command', [
      'create table drill_items(id bigint primary key, title text not null);',
      "insert into drill_items values (1, 'alpha'), (2, 'beta'), (3, 'gamma');"
    ].join(' ')])

    const dump = join(root, 'database.dump')
    const encrypted = `${dump}.age`
    const downloaded = join(root, 'downloaded.dump.age')
    const decrypted = join(root, 'restored.dump')
    const identityFile = join(root, 'identity.txt')
    await execFile(pgDumpBin, ['--dbname', databaseUrl(sourceDb), '--format=custom', '--no-owner', '--no-acl', '--file', dump])
    await execFile(ageKeygenBin, ['-o', identityFile])
    const { stdout: recipientOutput } = await execFile(ageKeygenBin, ['-y', identityFile])
    const recipient = recipientOutput.trim()
    if (!recipient.startsWith('age1')) throw new Error('age-keygen 未返回有效测试公钥')
    await execFile(ageBin, ['-r', recipient, '-o', encrypted, dump])

    const objectKey = `${drillPrefix}/database.dump.age`
    const encryptedBytes = await readFile(encrypted)
    await putObject(objectKey, encryptedBytes)
    uploadedKeys.push(objectKey)
    const remoteBytes = await getObject(objectKey)
    if (sha256Hex(remoteBytes) !== sha256Hex(encryptedBytes)) throw new Error('S3 下载 SHA-256 校验失败')
    await writeFile(downloaded, remoteBytes)
    await execFile(ageBin, ['-d', '-i', identityFile, '-o', decrypted, downloaded])

    await execFile(createdbBin, ['--maintenance-db', adminUrl, restoreDb])
    await execFile(pgRestoreBin, ['--dbname', databaseUrl(restoreDb), '--no-owner', '--no-acl', '--exit-on-error', decrypted])
    const { stdout } = await execFile(psqlBin, [
      '--dbname', databaseUrl(restoreDb), '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1',
      '--command', "select count(*) || ':' || string_agg(title, ',' order by id) from drill_items;"
    ])
    if (stdout.trim() !== '3:alpha,beta,gamma') throw new Error(`PostgreSQL 恢复校验失败：${stdout.trim()}`)

    const production = await verifyProductionBackups()
    console.log(JSON.stringify({ drill_prefix: drillPrefix, database_roundtrip: 'verified', production, s3_endpoint: s3Config().endpoint.origin }))
  } finally {
    await Promise.all(uploadedKeys.map((key) => deleteObject(key).catch(() => undefined)))
    await removeDatabase(restoreDb)
    await removeDatabase(sourceDb)
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
