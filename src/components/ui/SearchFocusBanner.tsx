import { useEffect } from 'react'
import { Link2, LocateFixed, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import EntityLinksPanel from './EntityLinksPanel'
import type { LinkKind } from '../../hooks/useWorkbenchArtifacts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const TARGETS: Partial<Record<string, { table: string; kind: LinkKind; title: string; subtitle?: string }>> = {
  '/checkins': { table: 'habits', kind: 'habit', title: 'name' },
  '/goals': { table: 'goals', kind: 'goal', title: 'name', subtitle: 'note' },
  '/practice': { table: 'practice_problems', kind: 'practice', title: 'title', subtitle: 'platform' },
  '/workout': { table: 'workout_sessions', kind: 'workout', title: 'body_part', subtitle: 'date' }
}

export default function SearchFocusBanner() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { userId } = useAuth()
  const target = TARGETS[location.pathname]
  const focusId = searchParams.get('focus')
  const validFocus = Boolean(target && focusId && UUID.test(focusId))
  const query = useQuery({
    queryKey: ['search_focus', userId, location.pathname, focusId],
    queryFn: async () => {
      const { data, error } = await supabase!.from(target!.table).select('*').eq('id', focusId!).maybeSingle()
      if (error) throw error
      return data as Record<string, unknown> | null
    },
    enabled: !!supabase && !!userId && validFocus
  })

  useEffect(() => {
    if (!target || !focusId || validFocus) return
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
  }, [focusId, searchParams, setSearchParams, target, validFocus])

  if (!target || !focusId || !validFocus) return null
  const close = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="mb-4 space-y-3">
      <section className="rounded-xl border border-accent/30 bg-accent-2 p-4">
        <div className="flex items-start gap-3">
          <LocateFixed size={17} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">搜索定位</p>
            {query.isLoading ? <p className="mt-1 text-sm text-ink-3">正在加载记录…</p> : query.isError ? (
              <p role="alert" className="mt-1 text-sm text-danger">记录加载失败，请稍后重试。</p>
            ) : query.data ? (
              <>
                <p className="mt-1 truncate text-sm font-semibold text-ink">{String(query.data[target.title] ?? '无标题')}</p>
                {target.subtitle && query.data[target.subtitle] != null && <p className="mt-1 line-clamp-2 text-xs text-ink-2">{String(query.data[target.subtitle])}</p>}
              </>
            ) : <p className="mt-1 text-sm text-ink-3">记录已不存在或不可访问。</p>}
          </div>
          <button type="button" onClick={close} aria-label="关闭搜索定位" className="text-ink-3 hover:text-ink"><X size={17} /></button>
        </div>
      </section>
      {query.data && (
        <div>
          <div className="mb-1 flex items-center gap-1 text-[11px] text-ink-3"><Link2 size={12} />当前记录的关联</div>
          <EntityLinksPanel sourceKind={target.kind} sourceId={focusId} />
        </div>
      )}
    </div>
  )
}
