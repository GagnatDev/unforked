import { type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import { getLocalRecipe } from '@/local/db'
import { pullRecipe } from '@/local/sync'
import { useBackgroundPull } from '@/local/useBackgroundPull'
import { useLocal } from '@/local/useLocal'
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
  photo: null,
}

export function useRecipeFormState(id: string | undefined) {
  const [doc, setDocState] = useState<RecipeDoc>(emptyDoc)
  const [submitError, setSubmitError] = useState<string | null>(null)
  /** Once the user edits, background store updates must not clobber the form. */
  const editedRef = useRef(false)

  const { data: localRecipe, loading: localLoading } = useLocal(
    () => getLocalRecipe(id ?? ''),
    ['recipes'],
    [id],
    { enabled: !!id },
  )
  const { error: pullError } = useBackgroundPull(
    () => pullRecipe(id ?? ''),
    [id],
    { enabled: !!id },
  )

  // With no local copy yet, stay in loading until the pull lands in the
  // store (or fails); with a local copy, pull errors are irrelevant offline noise.
  const loading = !!id && (localLoading || (localRecipe == null && pullError == null))
  const loadError = id && localRecipe == null ? pullError : null
  const error = submitError ?? loadError

  useEffect(() => {
    editedRef.current = false
    if (!id) setDocState(emptyDoc)
  }, [id])

  useEffect(() => {
    if (localRecipe && !editedRef.current) setDocState(localRecipe.doc)
  }, [localRecipe])

  const setDoc = useCallback((next: SetStateAction<RecipeDoc>) => {
    editedRef.current = true
    setDocState(next)
  }, [])

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

  const moveIngredient = useCallback((from: number, to: number) => {
    setDoc((d) => {
      const last = d.ingredients.length - 1
      if (from === to || from < 0 || to < 0 || from > last || to > last) return d
      const ingredients = [...d.ingredients]
      const [moved] = ingredients.splice(from, 1)
      ingredients.splice(to, 0, moved)
      return { ...d, ingredients }
    })
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
    setError: setSubmitError,
    update,
    addIngredient,
    updateIngredient,
    removeIngredient,
    moveIngredient,
    addStep,
    updateStep,
    removeStep,
  }
}
