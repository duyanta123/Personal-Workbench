import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAddTodo, useDeleteTodo, useTodos, useToggleTodo } from '../hooks/useTodos'
import type { Priority } from '../types'

const LEVEL_META: Record<Priority, { label: string; cls: string }> = {
  high: { label: '高', cls: 'bg-danger/10 text-danger' },
  mid: { label: '中', cls: 'bg-m3/15 text-m3' },
  low: { label: '低', cls: 'bg-m2/15 text-m2' }
}

export default function Todos() {
  const { data: todos, isLoading } = useTodos()
  const addTodo = useAddTodo()
  const toggleTodo = useToggleTodo()
  const deleteTodo = useDeleteTodo()

  const [text, setText] = useState('')
  const [level, setLevel] = useState<Priority>('mid')

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    addTodo.mutate({ text: t, level })
    setText('')
  }

  const inputCls =
    'w-full rounded-xl border border-ink/15 bg-card px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">每日计划</h1>

      {/* 添加表单 */}
      <form onSubmit={handleAdd} className="rounded-2xl bg-card p-4 shadow-card">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="今天要做什么？"
          className={inputCls}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {(Object.keys(LEVEL_META) as Priority[]).map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setLevel(lv)}
                className={`rounded-lg px-3 py-1.5 text-xs transition ${
                  level === lv ? LEVEL_META[lv].cls : 'bg-nested text-ink-3'
                }`}
              >
                {LEVEL_META[lv].label}优先级
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={!text.trim()}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-page disabled:opacity-40"
          >
            ＋ 添加
          </button>
        </div>
      </form>

      {/* 待办列表 */}
      {isLoading ? (
        <p className="py-8 text-center text-sm text-ink-3">加载中…</p>
      ) : !todos?.length ? (
        <p className="py-8 text-center text-sm text-ink-3">暂无待办，从上面添加第一条吧。</p>
      ) : (
        <ul className="space-y-2">
          {todos.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-card"
            >
              <button
                onClick={() => toggleTodo.mutate({ id: t.id, done: !t.done })}
                aria-label="切换完成"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs transition ${
                  t.done ? 'border-m1 bg-m1 text-page' : 'border-ink/25 text-transparent hover:border-accent'
                }`}
              >
                ✓
              </button>
              <span className={`flex-1 text-sm ${t.done ? 'text-ink-3 line-through' : ''}`}>{t.text}</span>
              <span className={`rounded-md px-2 py-0.5 text-xs ${LEVEL_META[t.level].cls}`}>
                {LEVEL_META[t.level].label}
              </span>
              <button
                onClick={() => deleteTodo.mutate(t.id)}
                aria-label="删除"
                className="text-sm text-ink-3 transition hover:text-danger"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
