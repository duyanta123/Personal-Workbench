import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  Code2,
  Database,
  Dumbbell,
  Flame,
  Home,
  ListTodo,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  Cloud,
  Target,
  TriangleAlert,
  Wallet,
  WifiOff,
  X
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useOnline } from '../hooks/useOnline'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useAvatars, useAvatarSources, useAvatarStorageReconciliation, useDeleteAvatar, useSetActiveAvatar, useUploadAvatar } from '../hooks/useAvatars'
import { useUiStore } from '../stores/ui'
import { THEME_KEY_SIDEBAR } from '../stores/theme'
import { cn } from '../lib/cn'
import ThemeToggle from './ui/ThemeToggle'
import IconButton from './ui/IconButton'
import AvatarPicker from './ui/AvatarPicker'
import ToastHost from './ui/ToastHost'
import GlobalSearch from './ui/GlobalSearch'
import DataManager from './ui/DataManager'
import QuickCaptureDialog from './ui/QuickCaptureDialog'
import SyncCenter from './ui/SyncCenter'
import SecuritySettings from './ui/SecuritySettings'
import SearchFocusBanner from './ui/SearchFocusBanner'
import Modal from './ui/Modal'
import { cancelAllPendingDeletes } from '../hooks/useDeferredDelete'
import { useToastStore } from '../stores/toast'
import { useOutboxSync } from '../hooks/useOutboxSync'
import { useAuth } from '../hooks/useAuth'
import { discardPendingOperations, pendingOperationCount } from '../lib/outbox'
import { listCommands } from '../lib/commands'
import { clearUserLocalData } from '../lib/localData'
import { clearPomodoroRuntime } from '../utils/pomodoroRuntime'
import { queryClient } from '../lib/queryClient'
import { useQuickCaptureShortcut } from '../hooks/useQuickCaptureShortcut'
import { useRecurrenceMaterialization } from '../hooks/useRecurrences'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  tab: boolean
  group: string
}

export const NAV: NavItem[] = [
  { to: '/', label: '首页', icon: Home, tab: true, group: '工作台' },
  { to: '/todos', label: '每日计划', icon: ListTodo, tab: true, group: '工作台' },
  { to: '/checkins', label: '习惯打卡', icon: Flame, tab: true, group: '工作台' },
  { to: '/ledger', label: '记账', icon: Wallet, tab: true, group: '记录' },
  { to: '/goals', label: '长期目标', icon: Target, tab: true, group: '记录' },
  { to: '/notes', label: '内容记录', icon: BookOpen, tab: false, group: '记录' },
  { to: '/practice', label: '刷题记录', icon: Code2, tab: false, group: '记录' },
  { to: '/workout', label: '健身记录', icon: Dumbbell, tab: false, group: '记录' },
  { to: '/insight', label: '洞察复盘', icon: BarChart3, tab: false, group: '记录' }
]

const GROUPS = ['工作台', '记录']

export default function Layout() {
  useAvatarStorageReconciliation()
  useOutboxSync()
  useRecurrenceMaterialization()
  const online = useOnline()
  const drawerOpen = useUiStore((s) => s.drawerOpen)
  const setDrawerOpen = useUiStore((s) => s.setDrawerOpen)
  useQuickCaptureShortcut()
  const location = useLocation()
  const currentTitle = NAV.find((n) => n.to === location.pathname)?.label ?? '个人工作台'
  const [searchOpen, setSearchOpen] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)

  const { data: avatarRows } = useAvatars()
  const uploadAvatar = useUploadAvatar()
  const setActiveAvatar = useSetActiveAvatar()
  const deleteAvatar = useDeleteAvatar()
  const push = useToastStore((s) => s.push)
  const { userId } = useAuth()

  const activePath = avatarRows?.find((a) => a.is_active)?.storage_path ?? null
  const avatarSources = useAvatarSources(avatarRows)
  const currentSrc = activePath ? avatarSources[activePath] ?? null : null
  const avatarItems = (avatarRows ?? []).map((a) => ({
    id: a.id,
    src: avatarSources[a.storage_path] ?? '',
    isActive: a.is_active
  }))

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY_SIDEBAR) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY_SIDEBAR, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  async function logout() {
    cancelAllPendingDeletes()
    if (userId) {
      const [legacyPending, commandRows] = await Promise.all([
        pendingOperationCount(userId),
        listCommands(userId)
      ])
      const pending = legacyPending + commandRows.filter((command) => command.status !== 'resolved').length
      if (pending > 0 && !window.confirm(`还有 ${pending} 条操作尚未同步。退出将永久丢弃这些操作，确定继续吗？`)) return
      await discardPendingOperations(userId)
      clearPomodoroRuntime(localStorage, userId)
      queryClient.clear()
      await clearUserLocalData(userId)
    }
    try { localStorage.removeItem('workbench:last-user:v1') } catch { /* ignore */ }
    const { error } = await supabase!.auth.signOut({ scope: 'local' })
    if (error) push({ kind: 'error', message: `退出失败：${error.message}` })
  }

  async function uploadAvatarFile(file: File) {
    try {
      await uploadAvatar.mutateAsync(file)
      push({ kind: 'success', message: '头像已更新' })
    } catch (error) {
      push({ kind: 'error', message: `头像上传失败：${(error as Error).message}` })
    }
  }

  async function selectAvatar(id: string) {
    try {
      await setActiveAvatar.mutateAsync(id)
      push({ kind: 'success', message: '已切换头像' })
    } catch {
      push({ kind: 'error', message: '头像切换失败，请重试' })
    }
  }

  async function removeAvatar(id: string) {
    try {
      await deleteAvatar.mutateAsync(id)
      push({ kind: 'success', message: '头像已删除' })
    } catch {
      push({ kind: 'error', message: '头像删除失败，请重试' })
    }
  }

  const avatarBusy = uploadAvatar.isPending || setActiveAvatar.isPending || deleteAvatar.isPending

  function navItemCls(isActive: boolean) {
    return cn(
      'flex items-center gap-3 rounded-xl text-sm transition-colors duration-150',
      collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
      isActive
        ? 'bg-nested font-medium text-ink'
        : 'text-ink-2 hover:bg-hover hover:text-ink'
    )
  }

  function renderLogo() {
    return (
      <div className="flex items-center gap-2.5">
        <AvatarPicker
          currentSrc={currentSrc}
          avatars={avatarItems}
          onUpload={uploadAvatarFile}
          onSelect={selectAvatar}
          onDelete={removeAvatar}
          busy={avatarBusy}
        />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-ink">个人工作台</div>
            {!collapsed && (
              <div className="truncate text-[10px] text-ink-3">计划 · 打卡 · 记账 · 笔记</div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* 离线提示 */}
      {!online && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-1.5 bg-m3/15 px-4 py-1.5 text-center text-xs font-medium text-m3">
          <WifiOff size={14} />
          当前离线，修改会保存在本机并在联网后同步
        </div>
      )}
      {/* 未配置 Supabase 提示 */}
      {!isSupabaseConfigured && (
        <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-1.5 bg-danger/10 px-4 py-1.5 text-center text-xs font-medium text-danger">
          <TriangleAlert size={14} />
          尚未配置 Supabase（缺 .env），数据不会保存。详见 .env.example
        </div>
      )}

      {/* 桌面端侧栏 */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex',
          collapsed ? 'w-16' : 'w-[260px]'
        )}
      >
        <div className={cn('flex items-center py-5', collapsed ? 'justify-center px-0' : 'px-5')}>
          {renderLogo()}
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2.5">
          {GROUPS.map((g) => (
            <div key={g}>
              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                  {g}
                </p>
              )}
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === g).map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === '/'}
                    className={({ isActive }) => navItemCls(isActive)}
                    title={collapsed ? n.label : undefined}
                  >
                    <n.icon size={20} className="shrink-0" />
                    {!collapsed && <span>{n.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div
          className={cn(
            'flex flex-col gap-1 border-t border-border py-3',
            collapsed ? 'items-center px-2' : 'px-2.5'
          )}
        >
          {!collapsed && (
            <>
              <button
                onClick={() => setSyncOpen(true)}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
              >
                <Cloud size={20} className="shrink-0" />
                同步中心
              </button>
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
              >
                <Search size={20} className="shrink-0" />
                搜索
              </button>
              <button
                onClick={() => setDataOpen(true)}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
              >
                <Database size={20} className="shrink-0" />
                数据备份
              </button>
              <button
                onClick={() => setSecurityOpen(true)}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
              >
                <ShieldCheck size={20} className="shrink-0" />
                账号安全
              </button>
              <button
                onClick={logout}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
              >
                <LogOut size={20} className="shrink-0" />
                退出登录
              </button>
            </>
          )}
          {collapsed && (
            <>
              <IconButton onClick={() => setSearchOpen(true)} aria-label="搜索" title="搜索">
                <Search size={20} />
              </IconButton>
              <IconButton onClick={() => setDataOpen(true)} aria-label="数据备份" title="数据备份">
                <Database size={20} />
              </IconButton>
              <IconButton onClick={() => setSyncOpen(true)} aria-label="同步中心" title="同步中心">
                <Cloud size={20} />
              </IconButton>
              <IconButton onClick={() => setSecurityOpen(true)} aria-label="账号安全" title="账号安全">
                <ShieldCheck size={20} />
              </IconButton>
              <IconButton onClick={logout} aria-label="退出登录" title="退出登录">
                <LogOut size={20} />
              </IconButton>
            </>
          )}
          <div className={cn('flex items-center', collapsed ? '' : 'justify-between')}>
            <ThemeToggle />
            <IconButton
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
              title={collapsed ? '展开侧栏' : '折叠侧栏'}
            >
              {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </IconButton>
          </div>
        </div>
      </aside>

      {/* 移动端顶栏 */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-page/90 px-4 py-3 backdrop-blur md:hidden">
        <IconButton onClick={() => setDrawerOpen(true)} aria-label="打开菜单">
          <Menu size={20} />
        </IconButton>
        <div className="text-sm font-semibold text-ink">{currentTitle}</div>
        <div className="flex items-center gap-1">
          <IconButton onClick={() => setSearchOpen(true)} aria-label="搜索">
            <Search size={20} />
          </IconButton>
          <AvatarPicker
            currentSrc={currentSrc}
            avatars={avatarItems}
            onUpload={uploadAvatarFile}
            onSelect={selectAvatar}
            onDelete={removeAvatar}
            busy={avatarBusy}
          />
        </div>
      </header>

      {/* 移动端抽屉 */}
      <Modal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="导航菜单"
        containerClassName="justify-start p-0 sm:pt-0 md:hidden"
        panelClassName="h-full max-w-64"
      >
          <div className="flex h-full w-64 flex-col bg-surface p-4 text-ink">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AvatarPicker
                  currentSrc={currentSrc}
                  avatars={avatarItems}
                  onUpload={uploadAvatarFile}
                  onSelect={selectAvatar}
                  onDelete={removeAvatar}
                  busy={avatarBusy}
                />
                <span className="text-sm font-bold">个人工作台</span>
              </div>
              <IconButton onClick={() => setDrawerOpen(false)} aria-label="关闭菜单">
                <X size={20} />
              </IconButton>
            </div>
            <nav className="mt-4 flex-1 space-y-4 overflow-y-auto">
              {GROUPS.map((g) => (
                <div key={g}>
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    {g}
                  </p>
                  <div className="space-y-0.5">
                    {NAV.filter((n) => n.group === g).map((n) => (
                      <NavLink
                        key={n.to}
                        to={n.to}
                        end={n.to === '/'}
                        onClick={() => setDrawerOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-150',
                            isActive
                              ? 'bg-nested font-medium text-ink'
                              : 'text-ink-2 hover:bg-hover hover:text-ink'
                          )
                        }
                      >
                        <n.icon size={20} className="shrink-0" />
                        {n.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <button
              onClick={() => {
                setDrawerOpen(false)
                setSyncOpen(true)
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              <Cloud size={20} className="shrink-0" />
              同步中心
            </button>
            <button
              onClick={() => {
                setDrawerOpen(false)
                setSearchOpen(true)
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              <Search size={20} className="shrink-0" />
              搜索
            </button>
            <button
              onClick={() => {
                setDrawerOpen(false)
                setDataOpen(true)
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              <Database size={20} className="shrink-0" />
              数据备份
            </button>
            <button
              onClick={() => {
                setDrawerOpen(false)
                setSecurityOpen(true)
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              <ShieldCheck size={20} className="shrink-0" />
              账号安全
            </button>
            <button
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              <LogOut size={20} className="shrink-0" />
              退出登录
            </button>
          </div>
      </Modal>

      {/* 主内容区 */}
      <main
        className={cn(
          'min-h-screen px-4 pb-24 pt-4 transition-[margin] duration-200 md:px-8 md:pb-10 md:pt-8',
          collapsed ? 'md:ml-16' : 'md:ml-[260px]'
        )}
      >
        <div className="mx-auto w-full max-w-5xl">
          <SearchFocusBanner />
          <Outlet />
        </div>
      </main>

      {/* 移动端底部 Tab */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.filter((n) => n.tab).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition-colors duration-150',
                isActive ? 'font-medium text-accent' : 'text-ink-3'
              )
            }
          >
            <n.icon size={20} />
            {n.label}
          </NavLink>
        ))}
      </nav>

      {/* 全局浮层 */}
      <ToastHost />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <DataManager open={dataOpen} onClose={() => setDataOpen(false)} />
      <SyncCenter open={syncOpen} onClose={() => setSyncOpen(false)} />
      <SecuritySettings open={securityOpen} onClose={() => setSecurityOpen(false)} />
      <QuickCaptureDialog />
    </div>
  )
}
