import { useEffect, useState } from 'react'
import { dailyQuote, weekNumber } from '../../utils/quotes'
import { todayStr } from '../../utils/date'

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 13) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 首页时钟问候卡：问候语 + 每日一句 + 实时时钟 + 日期周数 */
export default function ClockCard() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const dateLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 周${WEEK_CN[now.getDay()]}`

  return (
    <div
      className="relative flex min-h-44 flex-col justify-between overflow-hidden rounded-2xl p-5 shadow-card"
      style={{ background: 'var(--grad-dark)', color: 'var(--ink-on-dark)' }}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-accent/25 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-m1/20 blur-2xl" />
      <div className="relative">
        <div className="text-lg font-bold">{greeting()}，今天也要按自己的节奏来。</div>
        <div className="mt-1 text-xs" style={{ opacity: 0.6 }}>
          {dailyQuote()}
        </div>
      </div>
      <div className="relative mt-4">
        <div className="text-[40px] font-bold leading-none tracking-wide tabular-nums">
          {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px]" style={{ opacity: 0.6 }}>
          <span>{dateLabel}</span>
          <span className="h-1 w-1 rounded-full bg-current" />
          <span>第 {weekNumber()} 周</span>
          <span className="h-1 w-1 rounded-full bg-current" />
          <span>{todayStr()}</span>
        </div>
      </div>
    </div>
  )
}
