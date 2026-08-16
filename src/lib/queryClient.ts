import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 弱网/离线场景：优先复用缓存数据，联网后自动重新拉取
      staleTime: 30 * 1000,
      retry: 1,
      refetchOnReconnect: true
    },
    mutations: {
      // 离线优先：写操作由 commands.ts 的本地命令队列接管（IndexedDB outbox），
      // 不允许 React Query 的网络门控（默认 networkMode:'online'）在离线时
      // 暂停 mutationFn —— 否则离线创建会静默挂起直到重新联网。
      networkMode: 'always'
    }
  }
})
