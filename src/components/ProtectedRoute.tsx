import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured } from '../lib/supabase'

export default function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-ink-3">
        加载中…
      </div>
    )
  }

  // 未配置 Supabase 时放行（本地开发模式），页面顶部会显示配置提示
  if (!session && isSupabaseConfigured) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
