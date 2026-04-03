import { useCallback, useEffect, useState } from 'react'

export type StepChecklist = {
  checkedSteps: boolean[]
  toggleStep: (idx: number) => void
  resetProgress: () => void
}

/**
 * Persists per-step completion for a recipe's steps under `storageKey`.
 * When `storageKey` is null or there are no steps, nothing is read/written from storage.
 */
export function useStepChecklist(steps: string[], storageKey: string | null): StepChecklist {
  const [checkedSteps, setCheckedSteps] = useState<boolean[]>([])

  // Stable across fresh `[]` references with the same step text (avoids hydrate effect loops in tests).
  const stepsKey = steps.join('\u0000')

  useEffect(() => {
    if (!storageKey || steps.length === 0) {
      setCheckedSteps(steps.map(() => false))
      return
    }
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) {
        setCheckedSteps(steps.map(() => false))
        return
      }
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) {
        setCheckedSteps(steps.map(() => false))
        return
      }
      const next = steps.map((_, i) => Boolean(parsed[i]))
      setCheckedSteps(next)
    } catch {
      setCheckedSteps(steps.map(() => false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `steps` tracked via stepsKey to avoid unstable [] identity loops
  }, [storageKey, stepsKey])

  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(checkedSteps))
    } catch {
      // ignore quota/private mode issues
    }
  }, [storageKey, checkedSteps])

  const toggleStep = useCallback((idx: number) => {
    setCheckedSteps((prev) => prev.map((v, i) => (i === idx ? !v : v)))
  }, [])

  const resetProgress = useCallback(() => {
    setCheckedSteps(steps.map(() => false))
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey)
      } catch {
        // ignore
      }
    }
  }, [steps, storageKey])

  return { checkedSteps, toggleStep, resetProgress }
}
