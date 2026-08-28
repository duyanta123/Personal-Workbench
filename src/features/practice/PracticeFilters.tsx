import { Search } from 'lucide-react'
import type { PracticeDifficulty } from '../../types'
import Input from '../../components/ui/Input'
import { cn } from '../../lib/cn'
import { DIFFICULTY_META } from './meta'

const PLATFORMS = [
  { value: 'leetcode', label: 'LeetCode' },
  { value: 'nowcoder', label: '牛客' },
  { value: 'luogu', label: '洛谷' },
  { value: 'codeforces', label: 'Codeforces' },
  { value: 'other', label: '其他' }
] as const

export default function PracticeFilters({ query, onQueryChange, platformFilter, onPlatformFilter, diffFilter, onDiffFilter, tagFilter, onTagFilter, allTags }: {
  query: string
  onQueryChange: (value: string) => void
  platformFilter: string | null
  onPlatformFilter: (value: string | null) => void
  diffFilter: PracticeDifficulty | null
  onDiffFilter: (value: PracticeDifficulty | null) => void
  tagFilter: string | null
  onTagFilter: (value: string | null) => void
  allTags: string[]
}) {
  return (
    <div className="space-y-2.5">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="搜索题目、标签…"
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onPlatformFilter(null)}
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
            onClick={() => onPlatformFilter(platformFilter === pl.value ? null : pl.value)}
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
            onClick={() => onDiffFilter(diffFilter === d ? null : d)}
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
            onClick={() => onTagFilter(tagFilter === t ? null : t)}
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
  )
}
