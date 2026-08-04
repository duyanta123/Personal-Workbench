import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 弱网/离线场景：优先复用缓存数据，联网后自动重新拉取
      staleTime: 30 * 1000,
      retry: 1,
      refetchOnReconnect: true
    }
  }
})
