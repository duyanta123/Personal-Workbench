import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

const AuthPage = lazy(() => import('./components/AuthPage'))
const ForgotPasswordPage = lazy(() => import('./components/ForgotPasswordPage'))
const UpdatePasswordPage = lazy(() => import('./components/UpdatePasswordPage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Todos = lazy(() => import('./pages/Todos'))
const Checkins = lazy(() => import('./pages/Checkins'))
const Ledger = lazy(() => import('./pages/Ledger'))
const Goals = lazy(() => import('./pages/Goals'))
const Notes = lazy(() => import('./pages/Notes'))
const Practice = lazy(() => import('./pages/Practice'))
const Workout = lazy(() => import('./pages/Workout'))
const Insight = lazy(() => import('./pages/Insight'))

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/update-password" element={<UpdatePasswordPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/checkins" element={<Checkins />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/workout" element={<Workout />} />
            <Route path="/insight" element={<Insight />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
