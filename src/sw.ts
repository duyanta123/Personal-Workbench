/// <reference lib="webworker" />

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & typeof globalThis

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

self.addEventListener('push', (event) => {
  const data = event.data?.json?.() as { title?: string; body?: string; url?: string } | undefined
  const title = data?.title || '个人工作台'
  const options: NotificationOptions = {
    body: data?.body || '有新的工作台提醒。',
    tag: data?.url || 'workbench-reminder',
    data: { url: data?.url || '/' },
    icon: '/icon-192.png',
    badge: '/icon-192.png'
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = typeof event.notification.data?.url === 'string' ? event.notification.data.url : '/'
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = open[0]
    if (existing) {
      await existing.focus()
      await existing.navigate(new URL(target, self.location.origin).toString())
    } else {
      await self.clients.openWindow(new URL(target, self.location.origin).toString())
    }
  })())
})
