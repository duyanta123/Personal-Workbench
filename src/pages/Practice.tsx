import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronLeft, ChevronRight, Code2, Flame, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import {
  useAddProblem,
  useDeleteProblem,
  useProblems,
  usePracticeStats,
  practiceListKey,
  PRACTICE_PAGE_SIZE,
  useUpdateProblem
} from '../hooks/useProblems'
import type { NewProblem, PracticePage } from '../hooks/useProblems'
import { useDeferredDelete } from '../hooks/useDeferredDelete'
import { useTouch } from '../hooks/useTouch'
import { useToastStore } from '../stores/toast'
import { buildMonthGrid } from '../utils/calendar'
import type { PracticeDifficulty, PracticeProblem, PracticeStatus } from '../types'
import Button from '../components/ui/Button'
import Input, { Textarea } from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Segmented from '../components/ui/Segmented'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import Ring from '../components/ui/Ring'
import SideCard from '../components/ui/SideCard'
import { cn } from '../lib/cn'
import QueryError from '../components/ui/QueryError'
import { useAuth } from '../hooks/useAuth'
import { useCurrentDate } from '../hooks/useCurrentDate'
import { LIMITS, parseTags, requireLength, safeExternalUrl, safeExternalUrlOrNull } from '../utils/validation'
import { useClampPage } from '../hooks/useClampPage'

const WEEK = ['一', '二', '三', '四', '五', '六', '日']

const PLATFORMS = [
  { value: 'leetcode', label: 'LeetCode' },
  { value: 'nowcoder', label: '牛客' },
  { value: 'luogu', label: '洛谷' },
  { value: 'codeforces', label: 'Codeforces' },
  { value: 'other', label: '其他' }
] as const

const DIFFICULTY_META: Record<PracticeDifficulty, { label: string; variant: 'accent' | 'warning' | 'danger' }> = {
  easy: { label: '简单', variant: 'accent' },
  medium: { label: '中等', variant: 'warning' },
  hard: { label: '困难', variant: 'danger' }
}

const STATUS_META: Record<PracticeStatus, { label: string; variant: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  todo: { label: '待做', variant: 'neutral' },
  doing: { label: '进行中', variant: 'warning' },
  ac_solo: { label: '独立 AC', variant: 'success' },
  ac_hint: { label: '看题解 AC', variant: 'success' },
  failed: { label: '未 AC', variant: 'danger' }
}

/** 热力图配色：0 / 1 / 2 / 3+ 四档 */
function heatCls(count: number, future: boolean): string {
  if (future) return 'bg-nested text-ink-3/50'
  if (count === 0) return 'bg-nested text-ink-3/60'
  if (count === 1) return 'bg-m5/25 font-medium text-m5'
  if (count === 2) return 'bg-m5/45 font-medium text-m5'
  return 'bg-m5 font-semibold text-white'
}

const EMPTY_FORM = {
  title: '',
  platform: 'leetcode' as string,
  difficulty: 'medium' as PracticeDifficulty,
  status: 'todo' as PracticeStatus,
  tags: '',
  url: '',
  note: ''
}

export default function Practice() {
  const addProblem = useAddProblem()
  const updateProblem = useUpdateProblem()
  const deleteProblem = useDeleteProblem()
  const push = useToastStore((s) => s.push)
  const touch = useTouch()
  const { userId } = useAuth()

  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const [page, setPage] = useState(0)
  const [platformFilter, setPlatformFilter] = useState<string | null>(null)
  const [diffFilter, setDiffFilter] = useState<PracticeDifficulty | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  const today = useCurrentDate()
  const monthPrefix = today.slice(0, 7)
  const [year, month] = monthPrefix.split('-').map(Number)
  const problemsQuery = useProblems({ page, query: deferredQuery, platform: platformFilter, difficulty: diffFilter, tag: tagFilter })
  useClampPage(problemsQuery.data?.total, PRACTICE_PAGE_SIZE, page, setPage)
  const problems = problemsQuery.data?.items ?? []
  const isLoading = problemsQuery.isLoading
  const statsQuery = usePracticeStats(today, monthPrefix)
  const grid = buildMonthGrid(year, month)
  const heatmap = useMemo(() => {
    const map = new Map((statsQuery.data?.heatmap ?? []).map((d) => [d.date, d.count]))
    return map
  }, [statsQuery.data?.heatmap])

  const monthSolved = statsQuery.data?.month_solved ?? 0
  const streak = statsQuery.data?.streak ?? 0
  const byDiff = useMemo(
    () => statsQuery.data?.difficulty ?? { easy: 0, medium: 0, hard: 0 },
    [statsQuery.data?.difficulty]
  )
  const allTags = statsQuery.data?.tags ?? []
  const acCount = statsQuery.data?.ac_count ?? 0
  const todaySolved = statsQuery.data?.today_solved ?? 0
  const problemTotal = statsQuery.data?.total ?? 0

  // 侧栏统计
  const acRate = problemTotal ? Math.round((acCount / problemTotal) * 100) : 0
  const diffRows = useMemo(
    () =>
      ([
        { key: 'easy' as const, label: '简单', color: 'var(--accent)', count: byDiff.easy },
        { key: 'medium' as const, label: '中等', color: 'var(--m3)', count: byDiff.medium },
        { key: 'hard' as const, label: '困难', color: 'var(--danger)', count: byDiff.hard }
      ] as const),
    [byDiff]
  )
  const platformRows = (statsQuery.data?.platforms ?? []).slice(0, 6)
  const filtered = problems

  useEffect(() => setPage(0), [query, platformFilter, diffFilter, tagFilter])

  const pageOptions = { page, query: deferredQuery, platform: platformFilter, difficulty: diffFilter, tag: tagFilter }
  const { requestDelete, isPending: isDeletePending, remainingSeconds } = useDeferredDelete<PracticeProblem, PracticePage>({
    key: practiceListKey(userId, pageOptions),
    label: (p) => p.title,
    remove: (id) => deleteProblem.mutateAsync(id),
    cache: {
      getItems: (cache) => cache?.items ?? [],
      remove: (cache, id) => cache && { items: cache.items.filter((item) => item.id !== id), total: Math.max(0, cache.total - 1) },
      restore: (cache) => cache
    }
  })

  function reset() {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      const title = requireLength(form.title.trim(), LIMITS.title, '题目名称', 1)
      const payload: NewProblem = {
        title,
        platform: form.platform,
        difficulty: form.difficulty,
        status: form.status,
        tags: parseTags(form.tags),
        url: safeExternalUrl(form.url),
        note: form.note.trim() ? requireLength(form.note.trim(), LIMITS.body, '解题思路') : null
      }
      if (editingId) {
        await updateProblem.mutateAsync({ id: editingId, patch: payload })
        push({ kind: 'success', message: '已保存修改' })
      } else {
        await addProblem.mutateAsync(payload)
        push({ kind: 'success', message: `已添加「${title}」` })
      }
      reset()
    } catch (error) {
      push({ kind: 'error', message: error instanceof Error ? error.message : editingId ? '题目更新失败，请重试' : '题目添加失败，请重试' })
    }
  }

  function startEdit(p: PracticeProblem) {
    setEditingId(p.id)
    setForm({
      title: p.title,
      platform: p.platform,
      difficulty: p.difficulty,
      status: p.status,
      tags: p.tags.join(', '),
      url: p.url ?? '',
      note: p.note ?? ''
    })
  }

  /** 点击状态徽章循环切换 */
  async function cycleStatus(p: PracticeProblem) {
    const order: PracticeStatus[] = ['todo', 'doing', 'ac_solo', 'ac_hint', 'failed']
    const next = order[(order.indexOf(p.status) + 1) % order.length]
    try {
      await updateProblem.mutateAsync({ id: p.id, patch: { status: next } })
      push({ kind: 'info', message: `「${p.title}」→ ${STATUS_META[next].label}` })
    } catch {
      push({ kind: 'error', message: '状态更新失败，请重试' })
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="CODING"
        title="刷题记录"
        description="算法之路，每天进步一点。"
      />
      {(problemsQuery.isError || statsQuery.isError) && <QueryError onRetry={() => { problemsQuery.refetch(); statsQuery.refetch() }} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
      {/* 月度热力图 */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink">{year} 年 {month} 月</span>
          <span className="text-ink-2 tabular-nums">本月 {monthSolved} 题</span>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-ink-3">
          {WEEK.map((w) => (
            <span key={w} className="py-0.5">{w}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {grid.map((d, i) => {
            if (!d) return <span key={i} />
            const count = heatmap.get(d) ?? 0
            const future = d > today
            return (
              <div
                key={i}
                title={`${d} · ${count} 题`}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-md text-[11px] tabular-nums',
                  heatCls(count, future)
                )}
              >
                {Number(d.slice(8, 10))}
              </div>
            )
          })}
        </div>
      </div>

      {/* 录入 / 编辑表单 */}
      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="题目名称，如：两数之和"
          maxLength={LIMITS.title}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={form.platform}
            onChange={(v) => setForm({ ...form, platform: v })}
            options={[...PLATFORMS]}
          />
          <Segmented
            value={form.difficulty}
            onChange={(v) => setForm({ ...form, difficulty: v })}
            options={[
              { value: 'easy', label: '简单' },
              { value: 'medium', label: '中等' },
              { value: 'hard', label: '困难' }
            ]}
          />
          <Segmented
            value={form.status}
            onChange={(v) => setForm({ ...form, status: v })}
            options={[
              { value: 'todo', label: '待做' },
              { value: 'doing', label: '进行中' },
              { value: 'ac_solo', label: '独立 AC' },
              { value: 'ac_hint', label: '看题解' },
              { value: 'failed', label: '未 AC' }
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="标签，用逗号分隔（可选）"
            maxLength={LIMITS.tags * (LIMITS.tag + 1)}
            className="min-w-40 flex-1"
          />
          <Input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="题目链接（可选）"
            maxLength={LIMITS.url}
            className="min-w-40 flex-1"
          />
          <div className="flex gap-2">
            {editingId && (
              <Button type="button" variant="ghost" onClick={reset}>
                取消
              </Button>
            )}
            <Button type="submit" disabled={!form.title.trim() || addProblem.isPending || updateProblem.isPending}>
              <Plus size={16} />
              {editingId ? '保存修改' : '添加'}
            </Button>
          </div>
        </div>
        <Textarea
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="解题思路或复盘（可选）"
          rows={3}
          maxLength={LIMITS.body}
        />
      </form>

      {/* 筛选 */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索题目、标签…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setPlatformFilter(null)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
              platformFilter === null
                ? 'bg-accent text-white'
                : 'bg-surface text-ink-2 hover:bg-hover hover:text-ink'
            )}
          >
            全部平台
          </button>
          {PLATFORMS.map((pl) => (
            <button
              key={pl.value}
              onClick={() => setPlatformFilter(platformFilter === pl.value ? null : pl.value)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                platformFilter === pl.value
                  ? 'bg-accent text-white'
                  : 'bg-surface text-ink-2 hover:bg-hover hover:text-ink'
              )}
            >
              {pl.label}
            </button>
          ))}
          {(Object.keys(DIFFICULTY_META) as PracticeDifficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => setDiffFilter(diffFilter === d ? null : d)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                diffFilter === d
                  ? 'bg-accent text-white'
                  : 'bg-surface text-ink-2 hover:bg-hover hover:text-ink'
              )}
            >
              {DIFFICULTY_META[d].label}
            </button>
          ))}
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                tagFilter === t
                  ? 'bg-accent text-white'
                  : 'bg-surface text-ink-2 hover:bg-hover hover:text-ink'
              )}
            >
              #{t}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !filtered.length ? (
        <EmptyState
          icon={<Code2 size={22} />}
          title={query || platformFilter || diffFilter || tagFilter ? '没有匹配的题目' : '还没有题目'}
          description={query || platformFilter || diffFilter || tagFilter ? undefined : '从上面添加第一道题吧。'}
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => (
            <li
              key={p.id}
              className={cn('group flex items-center gap-3 rounded-2xl border bg-surface px-4 py-3 transition-colors duration-150 hover:bg-hover', isDeletePending(p.id) ? 'border-danger/40 opacity-60' : 'border-border')}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{p.title}</span>
                  {safeExternalUrlOrNull(p.url) && (
                    <a
                      href={safeExternalUrlOrNull(p.url)!}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-ink-3 underline-offset-2 hover:text-accent hover:underline"
                    >
                      链接
                    </a>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="neutral">{p.platform}</Badge>
                  <Badge variant={DIFFICULTY_META[p.difficulty].variant}>
                    {DIFFICULTY_META[p.difficulty].label}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => cycleStatus(p)}
                    disabled={isDeletePending(p.id)}
                    title="点击切换状态"
                    className="cursor-pointer"
                  >
                    <Badge variant={STATUS_META[p.status].variant}>{STATUS_META[p.status].label}</Badge>
                  </button>
                  {p.tags.map((t) => (
                    <Badge key={t} variant="neutral">
                      #{t}
                    </Badge>
                  ))}
                  {p.solved_at && (
                    <span className="text-[11px] text-ink-3 tabular-nums">{p.solved_at.slice(5).replace('-', '/')}</span>
                  )}
                </div>
                {p.note && <p className="mt-1 line-clamp-2 text-xs text-ink-3">{p.note}</p>}
                {isDeletePending(p.id) && <p className="mt-1 text-[10px] font-medium text-danger">待删除 {remainingSeconds(p.id)}s</p>}
              </div>
              <div
                className={cn(
                  'flex shrink-0 items-center gap-0.5',
                  touch ? '' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'
                )}
              >
                <IconButton size="sm" onClick={() => startEdit(p)} disabled={isDeletePending(p.id)} aria-label="编辑">
                  <Pencil size={15} />
                </IconButton>
                <IconButton size="sm" onClick={() => requestDelete(p)} disabled={isDeletePending(p.id)} aria-label="删除">
                  <Trash2 size={15} />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {(problemsQuery.data?.total ?? 0) > PRACTICE_PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3">
          <IconButton onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || problemsQuery.isFetching} aria-label="上一页"><ChevronLeft size={17} /></IconButton>
          <span className="text-xs text-ink-3 tabular-nums">第 {page + 1} / {Math.ceil((problemsQuery.data?.total ?? 0) / PRACTICE_PAGE_SIZE)} 页</span>
          <IconButton onClick={() => setPage((value) => value + 1)} disabled={(page + 1) * PRACTICE_PAGE_SIZE >= (problemsQuery.data?.total ?? 0) || problemsQuery.isFetching} aria-label="下一页"><ChevronRight size={17} /></IconButton>
        </div>
      )}
        </div>

        {/* 右栏统计 */}
        <aside className="h-fit space-y-3 lg:sticky lg:top-4">
          <SideCard title="完成情况" icon={<Code2 size={14} />}>
            <div className="flex items-center gap-4">
              <Ring value={acRate} size={88} color="var(--m5)">
                <span className="text-lg font-bold tabular-nums text-ink">{acRate}%</span>
              </Ring>
              <div className="text-xs text-ink-2">
                <div>
                  已 AC <span className="font-bold text-ink tabular-nums">{acCount}</span> /{' '}
                  {problemTotal}
                </div>
                <div className="mt-1 text-ink-3">其余进行中或待做</div>
              </div>
            </div>
          </SideCard>
          <SideCard title="连续刷题" icon={<Flame size={14} />}>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-ink">{streak}</span>
              <span className="text-xs text-ink-2">天</span>
            </div>
            <p className="mt-1 text-xs text-ink-3">
              {todaySolved > 0 ? `今日已 AC ${todaySolved} 题，继续保持` : '今天还没刷题，来一道吧'}
            </p>
          </SideCard>
          <SideCard title="难度分布" icon={<Code2 size={14} />}>
            <ul className="space-y-2">
              {diffRows.map((r) => (
                <li key={r.key} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className="shrink-0 text-ink-2">{r.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nested">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(r.count / Math.max(1, ...diffRows.map((d) => d.count))) * 100}%`,
                        background: r.color
                      }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-ink-3 tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          </SideCard>
          <SideCard title="平台分布" icon={<Code2 size={14} />}>
            {platformRows.length === 0 ? (
              <p className="py-2 text-center text-xs text-ink-3">暂无题目</p>
            ) : (
              <ul className="space-y-2">
                {platformRows.map(([p, c]) => {
                  const max = platformRows[0][1]
                  return (
                    <li key={p} className="flex items-center gap-2 text-xs">
                      <span className="w-16 shrink-0 truncate text-ink-2">{p}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nested">
                        <div className="h-full rounded-full bg-m2" style={{ width: `${(c / max) * 100}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-ink-3 tabular-nums">{c}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </SideCard>
        </aside>
      </div>
    </div>
  )
}
