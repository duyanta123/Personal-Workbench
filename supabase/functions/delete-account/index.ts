import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function claims(token: string) {
  const encoded = token.split('.')[1] ?? ''
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=')
  return JSON.parse(atob(padded)) as { iat?: number; aal?: string }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return response(405, { error: 'method not allowed' })
  try {
    const authorization = request.headers.get('Authorization') ?? ''
    const token = authorization.replace(/^Bearer\s+/i, '')
    if (!token) return response(401, { error: 'not authenticated' })
    const body = await request.json().catch(() => ({})) as { confirmation?: string }
    if (body.confirmation !== 'DELETE') return response(400, { error: 'confirmation required' })

    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
    const admin = createClient(url, serviceRole, { auth: { persistSession: false } })
    const userResult = await userClient.auth.getUser(token)
    if (userResult.error || !userResult.data.user) return response(401, { error: 'invalid session' })

    const jwt = claims(token)
    const factors = await admin.auth.admin.mfa.listFactors({ userId: userResult.data.user.id })
    if (factors.error) throw factors.error
    const hasVerified = factors.data.factors.some((factor) => factor.status === 'verified')
    const age = Date.now() / 1000 - (jwt.iat ?? 0)
    if (!jwt.iat || age > 300 || age < -60) {
      return response(403, { error: 'recent authentication required' })
    }
    if (hasVerified && jwt.aal !== 'aal2') {
      return response(403, { error: 'aal2 required' })
    }

    const bucket = admin.storage.from('avatars')
    const listAll = async (prefix: string): Promise<string[]> => {
      const paths: string[] = []
      for (let offset = 0; ; offset += 1000) {
        const listed = await bucket.list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
        if (listed.error) throw listed.error
        const page = listed.data ?? []
        for (const item of page) {
          const path = `${prefix}/${item.name}`
          if (item.id) paths.push(path)
          else paths.push(...await listAll(path))
        }
        if (page.length < 1000) break
      }
      return paths
    }
    const paths = await listAll(userResult.data.user.id)
    if (paths.length) {
      for (let offset = 0; offset < paths.length; offset += 100) {
        const removed = await bucket.remove(paths.slice(offset, offset + 100))
        if (removed.error) throw removed.error
      }
    }
    const deleted = await admin.auth.admin.deleteUser(userResult.data.user.id)
    if (deleted.error) throw deleted.error
    return response(200, { deleted: true })
  } catch (error) {
    console.error('delete-account failed', error instanceof Error ? error.name : 'unknown')
    return response(500, { error: 'account deletion failed' })
  }
})
