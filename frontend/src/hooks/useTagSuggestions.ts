import { useEffect, useRef, useState } from 'react'

import { api } from '@/api'

const DEBOUNCE_MS = 250

export type UseTagSuggestionsOptions = {
  excludeRecipeId?: string
}

export type UseTagSuggestionsResult = {
  suggestions: string[]
  loading: boolean
  error: Error | null
}

/**
 * Debounced tag suggestions from the API; aborts in-flight requests when the
 * query changes or the hook unmounts.
 */
export function useTagSuggestions(
  query: string,
  options?: UseTagSuggestionsOptions
): UseTagSuggestionsResult {
  const excludeRecipeId = options?.excludeRecipeId
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setSuggestions([])
      setLoading(false)
      setError(null)
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      return
    }

    setError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      const rid = ++requestIdRef.current
      setLoading(true)
      api.recipes
        .tagSuggestions(q, { excludeRecipeId, signal: ac.signal })
        .then((list) => {
          if (ac.signal.aborted || rid !== requestIdRef.current) return
          setSuggestions(list)
          setError(null)
          setLoading(false)
        })
        .catch((e) => {
          if (ac.signal.aborted || rid !== requestIdRef.current) return
          if ((e as Error).name === 'AbortError') return
          setSuggestions([])
          setError(e instanceof Error ? e : new Error(String(e)))
          setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [query, excludeRecipeId])

  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    []
  )

  return { suggestions, loading, error }
}
