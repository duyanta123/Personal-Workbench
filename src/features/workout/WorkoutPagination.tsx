import type { Dispatch, SetStateAction } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import IconButton from '../../components/ui/IconButton'
import { WORKOUT_PAGE_SIZE } from '../../hooks/useWorkouts'

export default function WorkoutPagination({ page, total, fetching, onPageChange }: {
  page: number
  total: number
  fetching: boolean
  onPageChange: Dispatch<SetStateAction<number>>
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <IconButton onClick={() => onPageChange((value) => Math.max(0, value - 1))} disabled={page === 0 || fetching} aria-label="上一页"><ChevronLeft size={17} /></IconButton>
      <span className="text-xs text-ink-3 tabular-nums">第 {page + 1} / {Math.ceil(total / WORKOUT_PAGE_SIZE)} 页</span>
      <IconButton onClick={() => onPageChange((value) => value + 1)} disabled={(page + 1) * WORKOUT_PAGE_SIZE >= total || fetching} aria-label="下一页"><ChevronRight size={17} /></IconButton>
    </div>
  )
}
