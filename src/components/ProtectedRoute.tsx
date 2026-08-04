import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured } from '../lib/supabase'
import Skeleton from './ui/Skeleton'
import Card from './ui/Card'

export default function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-3 px-4">
        <Card>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-2 h-3 w-full" />
        </Card>
        <Card>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-2 h-3 w-full" />
        </Card>
        <Card>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="mt-2 h-3 w-full" />
        </Card>
      </div>
    )
  }

  // 未配置 Supabase 时放行（本地开发模式），页面顶部会显示配置提示
  if (!session && isSupabaseConfigured) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
