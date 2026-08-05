import { describe, expect, test } from 'vitest'
import { goalRestoreInput, habitRestoreInput, noteRestoreInput, practiceRestoreInput, todoRestoreInput } from './restore'
import type { Goal, Habit, Note, PracticeProblem, Todo } from '../types'

const baseTodo: Todo = {
  id: 't1',
  user_id: 'u',
  text: '写周报',
  level: 'high',
  done: true,
  sort_order: 7,
  due_date: '2026-08-05',
  pinned: true,
  created_at: '',
  updated_at: ''
}

describe('todoRestoreInput', () => {
  test('保留完成态 / 置顶 / 排序，撤销不丢状态', () => {
    expect(todoRestoreInput(baseTodo)).toEqual({
      text: '写周报',
      level: 'high',
      due_date: '2026-08-05',
      done: true,
      pinned: true,
      sort_order: 7
    })
  })
})

const baseNote: Note = {
  id: 'n1',
  user_id: 'u',
  title: '摘录',
  body: '正文',
  tags: ['a'],
  pinned: true,
  layout: 'quote',
  image_url: 'https://x/y.jpg',
  created_at: '',
  updated_at: ''
}

describe('noteRestoreInput', () => {
  test('保留布局与图片，撤销不降级', () => {
    expect(noteRestoreInput(baseNote)).toEqual({
      title: '摘录',
      body: '正文',
      tags: ['a'],
      pinned: true,
      layout: 'quote',
      image_url: 'https://x/y.jpg'
    })
  })
})

const baseGoal: Goal = {
  id: 'g1',
  user_id: 'u',
  name: '读书',
  emoji: '📖',
  current: 3,
  target: 24,
  unit: '本',
  note: null,
  pinned: true,
  created_at: '',
  updated_at: ''
}

describe('goalRestoreInput', () => {
  test('保留进度与置顶', () => {
    expect(goalRestoreInput(baseGoal)).toEqual({
      name: '读书',
      emoji: '📖',
      current: 3,
      target: 24,
      unit: '本',
      pinned: true
    })
  })
})

const baseHabit: Habit = {
  id: 'h1',
  user_id: 'u',
  name: '喝水',
  emoji: '💧',
  pinned: true,
  created_at: ''
}

describe('habitRestoreInput', () => {
  test('保留置顶状态', () => {
    expect(habitRestoreInput(baseHabit)).toEqual({ name: '喝水', emoji: '💧', pinned: true })
  })
})

const baseProblem: PracticeProblem = {
  id: 'p1',
  user_id: 'u',
  title: '两数之和',
  platform: 'leetcode',
  difficulty: 'easy',
  status: 'ac_solo',
  tags: ['数组'],
  url: 'https://x',
  note: '双指针',
  solved_at: '2026-07-01',
  created_at: '',
  updated_at: ''
}

describe('practiceRestoreInput', () => {
  test('保留 solved_at，撤销不污染今日统计', () => {
    expect(practiceRestoreInput(baseProblem)).toEqual({
      title: '两数之和',
      platform: 'leetcode',
      difficulty: 'easy',
      status: 'ac_solo',
      tags: ['数组'],
      url: 'https://x',
      note: '双指针',
      solved_at: '2026-07-01'
    })
  })
})
