import { createHash, createHmac } from 'node:crypto'

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest()
}

// AWS URI encoding differs from encodeURIComponent for these five characters.
export function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

function encodePath(value) {
  return value.split('/').map(awsEncode).join('/')
}

function decodeXml(value) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function xmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match ? decodeXml(match[1]) : ''
}

export function parseListObjectsXml(xml) {
  const objects = []
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const contents = match[1]
    const key = xmlValue(contents, 'Key')
    const size = Number(xmlValue(contents, 'Size'))
    const lastModified = xmlValue(contents, 'LastModified')
    if (key && Number.isSafeInteger(size) && size >= 0 && lastModified) {
      objects.push({ key, size, lastModified })
    }
  }
  objects.sort((left, right) => left.key.localeCompare(right.key))
  return { objects, nextToken: xmlValue(xml, 'NextContinuationToken') }
}

function endpointConfig() {
  const raw = process.env.S3_ENDPOINT
  if (!raw || !process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
    throw new Error('S3_ENDPOINT、S3_BUCKET、S3_ACCESS_KEY_ID、S3_SECRET_ACCESS_KEY 必须同时配置')
  }
  const endpoint = new URL(raw)
  return {
    endpoint,
    bucket: process.env.S3_BUCKET,
    accessKey: process.env.S3_ACCESS_KEY_ID,
    secretKey: process.env.S3_SECRET_ACCESS_KEY,
    region: process.env.S3_REGION || 'us-east-1'
  }
}

async function request(method, key, body = undefined, query = '') {
  const { endpoint, bucket, accessKey, secretKey, region } = endpointConfig()
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const date = amzDate.slice(0, 8)
  const path = `${endpoint.pathname.replace(/\/$/, '')}/${encodePath(bucket)}/${encodePath(key)}`
  const url = new URL(`${endpoint.origin}${path}${query}`)
  const payload = body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(body)
  const payloadHash = sha256Hex(payload)
  const headers = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate }
  const signedHeaders = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaders.map((name) => `${name}:${headers[name]}\n`).join('')
  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([leftName, leftValue], [rightName, rightValue]) => leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue))
    .map(([name, value]) => `${awsEncode(name)}=${awsEncode(value)}`)
    .join('&')
  const canonicalRequest = [method, url.pathname, canonicalQuery, canonicalHeaders, signedHeaders.join(';'), payloadHash].join('\n')
  const scope = `${date}/${region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, date), region), 's3'), 'aws4_request')
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${createHmac('sha256', signingKey).update(stringToSign).digest('hex')}`
  const response = await fetch(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : payload })
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!response.ok) throw new Error(`S3 ${method} ${key} failed (${response.status}): ${bytes.toString('utf8').slice(0, 500)}`)
  return { response, bytes }
}

export async function putObject(key, body) { return request('PUT', key, body) }
export async function getObject(key) { return (await request('GET', key)).bytes }
export async function deleteObject(key) { return request('DELETE', key) }

export async function listObjects(prefix) {
  endpointConfig()
  const out = []
  let token = ''
  do {
    const query = `?list-type=2&prefix=${awsEncode(prefix)}${token ? `&continuation-token=${awsEncode(token)}` : ''}`
    const { bytes } = await request('GET', '', undefined, query)
    const page = parseListObjectsXml(bytes.toString('utf8'))
    out.push(...page.objects)
    token = page.nextToken
  } while (token)
  return out.sort((left, right) => left.key.localeCompare(right.key))
}

export async function getBucketLifecycleXml() {
  return (await request('GET', '', undefined, '?lifecycle=')).bytes.toString('utf8')
}

export function s3Config() { return endpointConfig() }
