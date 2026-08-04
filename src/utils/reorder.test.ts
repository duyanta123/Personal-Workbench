import { describe, expect, it } from 'vitest'
import { reorder } from './reorder'

describe('reorder', () => {
  it('把 from 位置的元素移动到 to 位置', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(reorder(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('from === to 时原样返回', () => {
    expect(reorder(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })

  it('越界索引不改变数组', () => {
    expect(reorder(['a', 'b'], -1, 1)).toEqual(['a', 'b'])
    expect(reorder(['a', 'b'], 0, 9)).toEqual(['a', 'b'])
  })

  it('不修改原数组', () => {
    const src = ['a', 'b', 'c']
    const out = reorder(src, 0, 2)
    expect(src).toEqual(['a', 'b', 'c'])
    expect(out).toEqual(['b', 'c', 'a'])
  })
})
