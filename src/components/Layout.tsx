import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useOnline } from '../hooks/useOnline'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useUiStore } from '../stores/ui'

export const NAV = [
  { to: '/', label: '首页', icon: '🏠', tab: true },
  { to: '/todos', label: '每日计划', icon: '📋', tab: true },
  { to: '/checkins', label: '习惯打卡', icon: '🔥', tab: true },
  { to: '/ledger', label: '记账', icon: '💰', tab: true },
  { to: '/goals', label: '长期目标', icon: '🎯', tab: true },
  { to: '/notes', label: '内容记录', icon: '📝', tab: false }
]

export default function Layout() {
  const online = useOnline()
  const drawerOpen = useUiStore((s) => s.drawerOpen)
  const setDrawerOpen = useUiStore((s) => s.setDrawerOpen)
  const location = useLocation()
  const currentTitle = NAV.find((n) => n.to === location.pathname)?.label ?? '个人工作台'

  async function logout() {
    await supabase?.auth.signOut()
  }

  const navItemCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
      isActive ? 'bg-page/15 font-medium' : 'text-page/70 hover:bg-page/10'
    }`

  return (
    <div className="min-h-screen">
      {!online && (
        <div className="fixed inset-x-0 top-0 z-50 bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-800">
          ⚠️ 当前离线，页面显示的是缓存数据，恢复联网后会自动更新
        </div>
      )}
      {!isSupabaseConfigured && (
        <div className="fixed inset-x-0 z-40 bg-orange-100 px-4 py-1.5 text-center text-xs text-orange-800">
          尚未配置 Supabase（缺 .env），数据不会保存。详见 .env.example
        </div>
      )}

      {/* 桌面端侧栏 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-ink text-page md:flex">
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-6">
          <span className="text-2xl">🧭</span>
          <div>
            <div className="text-base font-semibold">个人工作台</div>
            <div className="text-xs opacity-60">计划 · 打卡 · 记账 · 笔记</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={navItemCls}>
              <span>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={logout}
          className="mx-3 mb-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-page/70 transition hover:bg-page/10"
        >
          <span>⏻</span>
          退出登录
        </button>
      </aside>

      {/* 移动端顶栏 */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink/5 bg-page/90 px-4 py-3 backdrop-blur md:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          className="text-xl"
          aria-label="打开菜单"
        >
          ☰
        </button>
        <div className="text-sm font-medium">{currentTitle}</div>
        <span className="text-xl">🧭</span>
      </header>

      {/* 移动端抽屉 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-ink p-4 text-page">
            <div className="flex items-center justify-between px-2 py-3">
              <div className="text-base font-semibold">个人工作台</div>
              <button onClick={() => setDrawerOpen(false)} className="text-page/70">
                ✕
              </button>
            </div>
            <nav className="mt-2 space-y-1">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  className={navItemCls}
                  onClick={() => setDrawerOpen(false)}
                >
                  <span>{n.icon}</span>
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <button
              onClick={logout}
              className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-page/70 transition hover:bg-page/10"
            >
              <span>⏻</span>
              退出登录
            </button>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <main className="min-h-screen px-4 pb-24 pt-4 md:ml-60 md:px-8 md:pb-10 md:pt-8">
        <div className="mx-auto w-full max-w-5xl">
          <Outlet />
        </div>
      </main>

      {/* 移动端底部 Tab */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink/5 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.filter((n) => n.tab).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                isActive ? 'font-medium text-accent' : 'text-ink-3'
              }`
            }
          >
            <span className="text-lg leading-none">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
