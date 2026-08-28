import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import QueryError from '../components/ui/QueryError'
import { useAuth } from '../hooks/useAuth'
import { useCurrentDate } from '../hooks/useCurrentDate'
import { LIMITS, parseTags, requireLength, safeExternalUrl } from '../utils/validation'
import { useClampPage } from '../hooks/useClampPage'
import PracticeEditor from '../features/practice/PracticeEditor'
import PracticeHeatmap from '../features/practice/PracticeHeatmap'
import PracticeFilters from '../features/practice/PracticeFilters'
import PracticeList from '../features/practice/PracticeList'
import PracticeStatsSidebar from '../features/practice/PracticeStatsSidebar'
import { STATUS_META } from '../features/practice/meta'

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
      <PracticeHeatmap year={year} month={month} monthSolved={monthSolved} today={today} grid={grid} heatmap={heatmap} />

      <PracticeEditor form={form} editing={Boolean(editingId)} busy={addProblem.isPending || updateProblem.isPending} onChange={setForm} onSubmit={handleSubmit} onCancel={reset} />

      {/* 筛选 */}
      <PracticeFilters
        query={query}
        onQueryChange={setQuery}
        platformFilter={platformFilter}
        onPlatformFilter={setPlatformFilter}
        diffFilter={diffFilter}
        onDiffFilter={setDiffFilter}
        tagFilter={tagFilter}
        onTagFilter={setTagFilter}
        allTags={allTags}
      />

      {/* 列表 */}
      <PracticeList
        loading={isLoading}
        problems={filtered}
        hasFilter={Boolean(query || platformFilter || diffFilter || tagFilter)}
        touch={touch}
        isDeletePending={isDeletePending}
        remainingSeconds={remainingSeconds}
        onEdit={startEdit}
        onDelete={requestDelete}
        onCycleStatus={cycleStatus}
      />
      {(problemsQuery.data?.total ?? 0) > PRACTICE_PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3">
          <IconButton onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || problemsQuery.isFetching} aria-label="上一页"><ChevronLeft size={17} /></IconButton>
          <span className="text-xs text-ink-3 tabular-nums">第 {page + 1} / {Math.ceil((problemsQuery.data?.total ?? 0) / PRACTICE_PAGE_SIZE)} 页</span>
          <IconButton onClick={() => setPage((value) => value + 1)} disabled={(page + 1) * PRACTICE_PAGE_SIZE >= (problemsQuery.data?.total ?? 0) || problemsQuery.isFetching} aria-label="下一页"><ChevronRight size={17} /></IconButton>
        </div>
      )}
        </div>

        {/* 右栏统计 */}
        <PracticeStatsSidebar
          acRate={acRate}
          acCount={acCount}
          problemTotal={problemTotal}
          streak={streak}
          todaySolved={todaySolved}
          diffRows={diffRows}
          platformRows={platformRows}
        />
      </div>
    </div>
  )
}
