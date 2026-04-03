import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api'
import type { Ingredient, RecipeDoc } from '@/types'

const emptyDoc: RecipeDoc = {
  name: '',
  description: '',
  sourceUrl: null,
  sourceName: null,
  ingredients: [],
  steps: [],
  servings: 4,
  tags: [],
}

export function useRecipeFormState(id: string | undefined) {
  const [doc, setDoc] = useState<RecipeDoc>(emptyDoc)
  const [loading, setLoading] = useState(!!id)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api.recipes
      .get(id)
      .then((r) => {
        if (!cancelled) {
          setDoc(r.doc)
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const update = useCallback((patch: Partial<RecipeDoc>) => {
    setDoc((d) => ({ ...d, ...patch }))
  }, [])

  const addIngredient = useCallback(() => {
    setDoc((d) => ({
      ...d,
      ingredients: [...d.ingredients, { name: '', quantity: '', unit: '' }],
    }))
  }, [])

  const updateIngredient = useCallback((i: number, patch: Partial<Ingredient>) => {
    setDoc((d) => ({
      ...d,
      ingredients: d.ingredients.map((ing, j) =>
        j === i ? { ...ing, ...patch } : ing
      ),
    }))
  }, [])

  const removeIngredient = useCallback((i: number) => {
    setDoc((d) => ({
      ...d,
      ingredients: d.ingredients.filter((_, j) => j !== i),
    }))
  }, [])

  const addStep = useCallback(() => {
    setDoc((d) => ({ ...d, steps: [...d.steps, ''] }))
  }, [])

  const updateStep = useCallback((i: number, value: string) => {
    setDoc((d) => ({
      ...d,
      steps: d.steps.map((s, j) => (j === i ? value : s)),
    }))
  }, [])

  const removeStep = useCallback((i: number) => {
    setDoc((d) => ({
      ...d,
      steps: d.steps.filter((_, j) => j !== i),
    }))
  }, [])

  return {
    doc,
    setDoc,
    loading,
    error,
    setError,
    update,
    addIngredient,
    updateIngredient,
    removeIngredient,
    addStep,
    updateStep,
    removeStep,
  }
}
