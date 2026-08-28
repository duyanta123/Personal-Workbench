import type { FormEvent } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import type { WorkoutExercise, WorkoutSession } from '../../types'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import IconButton from '../../components/ui/IconButton'
import { cn } from '../../lib/cn'

export type ExerciseForm = { name: string; sets: string; reps: string; weight: string; note: string }

export default function SessionCard({
  session, bodyPartLabel, exercises, exForm, editingExercise, touch,
  sessionDeletePending, sessionDeleteSeconds, exerciseDeletePending, exerciseDeleteSeconds,
  busy, onEditSession, onDeleteSession, onEditExercise, onDeleteExercise,
  onExFormChange, onSubmitExercise, onCancelEditExercise
}: {
  session: WorkoutSession
  bodyPartLabel: string
  exercises: WorkoutExercise[]
  exForm: ExerciseForm
  editingExercise: boolean
  touch: boolean
  sessionDeletePending: boolean
  sessionDeleteSeconds: number
  exerciseDeletePending: (id: string) => boolean
  exerciseDeleteSeconds: (id: string) => number
  busy: boolean
  onEditSession: () => void
  onDeleteSession: () => void
  onEditExercise: (exercise: WorkoutExercise) => void
  onDeleteExercise: (exercise: WorkoutExercise) => void
  onExFormChange: (form: ExerciseForm) => void
  onSubmitExercise: (event: FormEvent) => void
  onCancelEditExercise: () => void
}) {
  return (
    <li
      className={cn('group rounded-2xl border bg-surface p-4 transition-colors duration-150 hover:bg-hover', sessionDeletePending ? 'border-danger/40 opacity-60' : 'border-border')}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink tabular-nums">
            {session.date.slice(5).replace('-', '/')}
          </span>
          <Badge variant="accent">{bodyPartLabel}</Badge>
          {session.duration_min && <span className="text-xs text-ink-3 tabular-nums">{session.duration_min} 分钟</span>}
          <span className="text-xs text-ink-3 tabular-nums">{exercises.length} 个动作</span>
          {sessionDeletePending && <span className="text-[10px] font-medium text-danger">待删除 {sessionDeleteSeconds}s</span>}
        </div>
        <div className={cn('flex items-center gap-0.5', touch ? '' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100')}>
          <IconButton size="sm" onClick={onEditSession} disabled={sessionDeletePending} aria-label="编辑训练">
            <Pencil size={15} />
          </IconButton>
          <IconButton size="sm" onClick={onDeleteSession} disabled={sessionDeletePending} aria-label="删除训练">
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>
      {session.note && <p className="mt-1 text-xs text-ink-3">{session.note}</p>}

      {exercises.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {exercises.map((ex) => (
            <li key={ex.id} className={cn('flex items-center gap-3 py-1.5 text-sm', exerciseDeletePending(ex.id) && 'opacity-60')}>
              <span className="flex-1 text-ink">{ex.name}</span>
              <span className="text-ink-2 tabular-nums">
                {ex.sets} 组 × {ex.reps} 次 × {ex.weight}kg
              </span>
              {ex.note && <span className="max-w-28 truncate text-xs text-ink-3">{ex.note}</span>}
              {exerciseDeletePending(ex.id) && <span className="text-[10px] text-danger">待删除 {exerciseDeleteSeconds(ex.id)}s</span>}
              <IconButton size="sm" onClick={() => onEditExercise(ex)} disabled={exerciseDeletePending(ex.id)} aria-label="编辑动作" className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}>
                <Pencil size={14} />
              </IconButton>
              <IconButton
                size="sm"
                onClick={() => onDeleteExercise(ex)}
                disabled={exerciseDeletePending(ex.id)}
                aria-label="删除动作"
                className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
              >
                <Trash2 size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={onSubmitExercise}
        className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2"
      >
        <Input
          value={exForm.name}
          onChange={(e) => onExFormChange({ ...exForm, name: e.target.value })}
          placeholder="动作名，如：卧推"
          maxLength={200}
          className="min-w-36 flex-1"
        />
        <Input
          type="number"
          min="0"
          value={exForm.sets}
          onChange={(e) => onExFormChange({ ...exForm, sets: e.target.value })}
          placeholder="组"
          max="10000"
          className="w-16 tabular-nums"
        />
        <Input
          type="number"
          min="0"
          value={exForm.reps}
          onChange={(e) => onExFormChange({ ...exForm, reps: e.target.value })}
          placeholder="次"
          max="10000"
          className="w-16 tabular-nums"
        />
        <Input
          type="number"
          min="0"
          step="0.5"
          value={exForm.weight}
          onChange={(e) => onExFormChange({ ...exForm, weight: e.target.value })}
          placeholder="kg"
          max="10000"
          className="w-20 tabular-nums"
        />
        <Input
          value={exForm.note}
          onChange={(e) => onExFormChange({ ...exForm, note: e.target.value })}
          placeholder="备注"
          maxLength={100000}
          className="min-w-24 flex-1"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={sessionDeletePending || !exForm.name.trim() || busy}>
          <Plus size={14} />
          {editingExercise ? '保存' : '添加'}
        </Button>
        {editingExercise && <IconButton type="button" size="sm" onClick={onCancelEditExercise} aria-label="取消编辑"><X size={14} /></IconButton>}
      </form>
    </li>
  )
}
