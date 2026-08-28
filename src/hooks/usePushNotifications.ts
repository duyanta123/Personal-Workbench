import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

function decodeKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

function supported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function usePushNotifications() {
  const { userId } = useAuth()
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY

  const read = useCallback(async () => {
    if (!userId || !supported()) return
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    setEnabled(Boolean(subscription))
  }, [userId])

  useEffect(() => { void read().catch(() => undefined) }, [read])

  async function enable() {
    if (!userId || !supabase || !supported() || !publicKey) throw new Error('当前环境尚未配置 Web Push')
    setBusy(true); setError('')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('通知权限未开启')
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) })
      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('浏览器未返回完整推送订阅')
      const result = await supabase!.rpc('upsert_push_subscription', {
        p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth_key: json.keys.auth, p_user_agent: navigator.userAgent
      })
      if (result.error) throw result.error
      setEnabled(true)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '推送启用失败'
      setError(message)
      throw cause
    } finally { setBusy(false) }
  }

  async function disable() {
    if (!userId || !supabase || !supported()) return
    setBusy(true); setError('')
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const result = await supabase!.rpc('remove_push_subscription', { p_endpoint: subscription.endpoint })
        if (result.error) throw result.error
        await subscription.unsubscribe()
      }
      setEnabled(false)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '推送停用失败'
      setError(message)
      throw cause
    } finally { setBusy(false) }
  }

  return { supported: Boolean(supabase) && supported() && Boolean(publicKey), enabled, busy, error, enable, disable, refresh: read }
}
