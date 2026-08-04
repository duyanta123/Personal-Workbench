import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** 单次请求超时（毫秒）。海外实例网络波动大，超时后自动重试。 */
const TIMEOUT_MS = 15000
/** 网络错误自动重试次数 */
const MAX_RETRIES = 2

/**
 * 包装 fetch：给每个请求加超时，网络层错误（超时/连接失败）自动重试数次。
 * 仅对「请求根本没到达服务器」的情况重试；HTTP 4xx/5xx 正常返回，不重试。
 */
function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const attempt = (n: number) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      fetch(input, { ...init, signal: controller.signal })
        .then((res) => {
          clearTimeout(timer)
          resolve(res)
        })
        .catch((err) => {
          clearTimeout(timer)
          if (n < MAX_RETRIES) {
            setTimeout(() => attempt(n + 1), 400 * (n + 1))
          } else {
            reject(err)
          }
        })
    }
    attempt(0)
  })
}

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, { global: { fetch: fetchWithRetry } })
    : null
export const isSupabaseConfigured = Boolean(supabase)
