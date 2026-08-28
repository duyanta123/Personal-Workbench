import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

type Preference = { user_id: string; timezone: string; todo_digest_time: string; push_preview_mode: 'summary' | 'content' }
type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth_key: string; enabled: boolean }
type Habit = { id: string; user_id: string; name: string; reminder_time: string | null }
type HabitLog = { habit_id: string; user_id: string; log_date: string; state: string }
type Todo = { user_id: string; text: string; due_date: string | null; done: boolean }

function localParts(timezone: string, now = new Date()) {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  } catch {
    // A malformed legacy preference must not abort delivery for every user.
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  }
  const parts = formatter.formatToParts(now)
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return { date: `${value.year}-${value.month}-${value.day}`, minute: Number(value.hour) * 60 + Number(value.minute) }
}

function code(error: unknown) {
  const value = error as { statusCode?: number; code?: string }
  return value.statusCode === 410 ? 'subscription_gone' : String(value.code ?? value.statusCode ?? 'push_failed').slice(0, 100)
}

function retryable(error: unknown) {
  const value = error as { statusCode?: number }
  return value.statusCode === undefined || value.statusCode === 408 || value.statusCode === 429 || value.statusCode >= 500
}

async function sendWithBackoff(subscription: Subscription, payload: string) {
  let last: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } }, payload)
      return
    } catch (error) {
      last = error
      if (!retryable(error) || attempt === 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt))
    }
  }
  throw last
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const secret = Deno.env.get('WORKBENCH_SCHEDULER_SECRET')
  if (!secret || request.headers.get('x-workbench-scheduler-secret') !== secret) return new Response('unauthorized', { status: 401 })
  const body = await request.json().catch(() => ({})) as { run_id?: string }
  if (!body.run_id) return new Response('run_id required', { status: 400 })
  const url = Deno.env.get('SUPABASE_URL')!
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  let sent = 0
  try {
    await service.rpc('report_reminder_run', { p_run_id: body.run_id, p_status: 'running', p_sent_count: 0 })
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
    const [preferences, subscriptions, habits, logs, todos] = await Promise.all([
      service.from('user_preferences').select('user_id,timezone,todo_digest_time,push_preview_mode'),
      service.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth_key,enabled').eq('enabled', true),
      service.from('habits').select('id,user_id,name,reminder_time').not('reminder_time', 'is', null),
      service.from('habit_logs').select('habit_id,user_id,log_date,state').gte('log_date', new Date(Date.now() - 86400000).toISOString().slice(0, 10)),
      service.from('todos').select('user_id,text,due_date,done').eq('done', false).not('due_date', 'is', null)
    ])
    for (const result of [preferences, subscriptions, habits, logs, todos]) if (result.error) throw result.error
    const byUser = new Map<string, Preference>((preferences.data as Preference[]).map((row) => [row.user_id, row]))
    const userSubs = new Map<string, Subscription[]>()
    for (const row of subscriptions.data as Subscription[]) userSubs.set(row.user_id, [...(userSubs.get(row.user_id) ?? []), row])
    const userLogs = logs.data as HabitLog[]
    const userHabits = habits.data as Habit[]
    const userTodos = todos.data as Todo[]
    for (const [userId, preference] of byUser) {
      const local = localParts(preference.timezone || 'Asia/Shanghai')
      const userSubscriptions = userSubs.get(userId) ?? []
      if (!userSubscriptions.length) continue
      const done = new Set(userLogs.filter((log) => log.user_id === userId && log.log_date === local.date && ['done', 'skipped'].includes(log.state)).map((log) => log.habit_id))
      const notifications: Array<{ key: string; title: string; body: string; url: string }> = []
      for (const habit of userHabits.filter((item) => item.user_id === userId && item.reminder_time && !done.has(item.id))) {
        const [hour, minute] = habit.reminder_time!.split(':').map(Number)
        if (local.minute >= hour * 60 + minute) notifications.push({
          key: `habit:${habit.id}:${local.date}`,
          title: '习惯提醒',
          body: preference.push_preview_mode === 'content' ? `${habit.name.slice(0, 80)} 还未记录。` : '今天还有习惯未记录。',
          url: '/checkins'
        })
      }
      const openTodos = userTodos.filter((todo) => todo.user_id === userId && todo.due_date && todo.due_date <= local.date)
      const digestTime = preference.todo_digest_time || '09:00'
      const [digestHour, digestMinute] = digestTime.split(':').map(Number)
      if (openTodos.length && local.minute >= digestHour * 60 + digestMinute) {
        const preview = preference.push_preview_mode === 'content'
          ? `例如：${openTodos.slice(0, 3).map((todo) => todo.text.slice(0, 40)).join('、')}`
          : `今日及逾期还有 ${openTodos.length} 项待办。`
        notifications.push({ key: `todo-digest:${local.date}`, title: '今日待办摘要', body: `${preview}${openTodos.length > 3 ? '等' : ''}`, url: '/todos?view=overdue' })
      }
      for (const notification of notifications) {
        const claim = await service.rpc('claim_notification', { p_user_id: userId, p_receipt_key: notification.key })
        if (claim.error || claim.data !== true) continue
        let delivered = 0
        let failed = 0
        for (const subscription of userSubscriptions) {
          try {
            await sendWithBackoff(subscription, JSON.stringify(notification))
            sent++
            delivered++
          } catch (error) {
            if (code(error) === 'subscription_gone') await service.from('push_subscriptions').delete().eq('id', subscription.id)
            else failed++
          }
        }
        await service.rpc('finish_notification', {
          p_user_id: userId,
          p_receipt_key: notification.key,
          p_status: delivered > 0 && failed === 0 ? 'sent' : delivered > 0 ? 'sent' : 'failed',
          p_error_code: failed > 0 ? 'delivery_failed' : null
        })
      }
    }
    await service.rpc('report_reminder_run', { p_run_id: body.run_id, p_status: 'completed', p_sent_count: sent })
    return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    await service.rpc('report_reminder_run', { p_run_id: body.run_id, p_status: 'failed', p_sent_count: sent, p_error_code: code(error) })
    console.error('send-reminders failed', code(error))
    return new Response('reminder dispatch failed', { status: 500 })
  }
})
