import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import AuthPage from './components/AuthPage'
import Dashboard from './pages/Dashboard'
import Todos from './pages/Todos'
import Checkins from './pages/Checkins'
import Ledger from './pages/Ledger'
import Goals from './pages/Goals'
import Notes from './pages/Notes'
import Practice from './pages/Practice'
import Workout from './pages/Workout'
import Insight from './pages/Insight'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
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
  )
}
