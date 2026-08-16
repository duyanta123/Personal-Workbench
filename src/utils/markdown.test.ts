import { describe, expect, it } from 'vitest'
import { renderSafeMarkdown } from './markdown'

describe('safe markdown', () => {
  it('renders common markdown constructs', () => {
    const html = renderSafeMarkdown('# 标题\n- **重要**\n- `code`')
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<strong>重要</strong>')
    expect(html).toContain('<code>code</code>')
  })

  it('never executes raw HTML or javascript URLs', () => {
    const html = renderSafeMarkdown('<script>alert(1)</script>\n[x](javascript:alert(1))')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('href="javascript:')
  })

  it('renders GFM tables with escaped cells', () => {
    const html = renderSafeMarkdown('| 名称 | 金额 |\n| --- | --- |\n| <b>咖啡</b> | 30 |')
    expect(html).toContain('<table><tbody>')
    expect(html).toContain('<th>名称</th>')
    expect(html).toContain('<td>&lt;b&gt;咖啡&lt;/b&gt;</td>')
    expect(html).toContain('<td>30</td>')
  })

  it('renders GFM task lists with disabled checkboxes', () => {
    const html = renderSafeMarkdown('- [ ] 待办\n- [x] 已完成')
    expect(html).toContain('<li class="md-task"><input type="checkbox" disabled /> 待办</li>')
    expect(html).toContain('<li class="md-task"><input type="checkbox" disabled checked /> 已完成</li>')
  })

  it('renders blockquotes and closes them before other blocks', () => {
    const html = renderSafeMarkdown('> 引用一\n> 引用二\n\n正文')
    expect(html).toContain('<blockquote><p>引用一</p><p>引用二</p></blockquote>')
    expect(html).toContain('<p>正文</p>')
  })

  it('escapes table cells that attempt script injection', () => {
    const html = renderSafeMarkdown('| a |\n| --- |\n| <img src=x onerror=alert(1)> |')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})
