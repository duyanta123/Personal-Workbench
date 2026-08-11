import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'

export function useClampPage(
  total: number | undefined,
  pageSize: number,
  page: number,
  setPage: Dispatch<SetStateAction<number>>
) {
  useEffect(() => {
    if (total === undefined) return
    const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1)
    if (page > lastPage) setPage(lastPage)
  }, [total, pageSize, page, setPage])
}
