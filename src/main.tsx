import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { queryClient } from './lib/queryClient'
import { useThemeStore } from './stores/theme'
import { AuthProvider } from './hooks/useAuth'
import QueryPersistence from './components/QueryPersistence'
import ChunkErrorBoundary from './components/ChunkErrorBoundary'
import PwaUpdatePrompt from './components/PwaUpdatePrompt'
import { initMonitoring } from './lib/monitoring'
import './index.css'

initMonitoring()
useThemeStore.getState().init()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <QueryPersistence />
        <ChunkErrorBoundary>
          <BrowserRouter>
            <App />
            <PwaUpdatePrompt />
          </BrowserRouter>
        </ChunkErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
