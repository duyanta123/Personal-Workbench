import test from 'node:test'
import assert from 'node:assert/strict'
import { awsEncode, parseListObjectsXml, sha256Hex } from './s3.mjs'

test('AWS URI encoding escapes characters encodeURIComponent leaves behind', () => {
  assert.equal(awsEncode("a !'()*"), 'a%20%21%27%28%29%2A')
})

test('list objects parser is order independent and decodes XML entities', () => {
  const xml = `<?xml version="1.0"?><ListBucketResult>
    <Contents><Key>daily/a&amp;b/file.age</Key><LastModified>2026-08-19T01:00:00Z</LastModified><ETag>etag</ETag><Size>42</Size></Contents>
    <Contents><Size>7</Size><Key>daily/a/file.age</Key><LastModified>2026-08-18T01:00:00Z</LastModified></Contents>
    <NextContinuationToken>next&amp;page</NextContinuationToken>
  </ListBucketResult>`
  assert.deepEqual(parseListObjectsXml(xml), {
    objects: [
      { key: 'daily/a/file.age', size: 7, lastModified: '2026-08-18T01:00:00Z' },
      { key: 'daily/a&b/file.age', size: 42, lastModified: '2026-08-19T01:00:00Z' }
    ],
    nextToken: 'next&page'
  })
})

test('sha256 helper accepts byte buffers', () => {
  assert.equal(sha256Hex(Buffer.from('workbench')), 'd85b40105dd0b9cdbe46a1ee1b96abdf1474ae96fb86bd28ca701f44f017ac3b')
})
