export const LIMITS = {
  short: 200,
  title: 1000,
  body: 100000,
  url: 2048,
  tags: 50,
  tag: 100
} as const

export function parseTags(value: string): string[] {
  const tags = value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean)
  return validateTags(tags)
}

export function validateTags(tags: string[]): string[] {
  if (tags.length > LIMITS.tags) throw new Error(`标签最多 ${LIMITS.tags} 个`)
  if (tags.some((tag) => tag.length > LIMITS.tag)) throw new Error(`单个标签不能超过 ${LIMITS.tag} 个字符`)
  return [...new Set(tags)]
}

export function requireLength(value: string, max: number, label: string, min = 0) {
  if (value.length < min || value.length > max) throw new Error(`${label}长度应为 ${min}-${max} 个字符`)
  return value
}

export function safeExternalUrl(value: string | null | undefined): string | null {
  const input = value?.trim() ?? ''
  if (!input) return null
  if (input.length > LIMITS.url) throw new Error(`链接不能超过 ${LIMITS.url} 个字符`)
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new Error('链接格式无效')
  }
  const localHttp = import.meta.env.DEV && parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !localHttp) throw new Error('只允许 HTTPS 链接')
  if (parsed.username || parsed.password) throw new Error('链接不能包含账号密码')
  return parsed.toString()
}

export function safeExternalUrlOrNull(value: string | null | undefined) {
  try {
    return safeExternalUrl(value)
  } catch {
    return null
  }
}
