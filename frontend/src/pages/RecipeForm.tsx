import { useEffect, useId, useRef, useState } from 'react'
import { useAsync } from '@/hooks/useAsync'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  RecipeTagsInput,
  type RecipeTagsInputHandle,
} from '@/components/RecipeTagsInput'
import { RecipeImportUrlDialog } from '@/components/RecipeImportUrlDialog'
import { RecipeSourceAttribution } from '@/components/RecipeSourceAttribution'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '../api'
import type { RecipeDoc, Ingredient } from '../types'

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

export default function RecipeForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const tagsFieldId = useId()
  const tagsInputRef = useRef<RecipeTagsInputHandle>(null)
  const [doc, setDoc] = useState<RecipeDoc>(emptyDoc)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importWarnings, setImportWarnings] = useState<string[]>([])

  const { data: fetchedDoc, loading, error: loadError } = useAsync(
    async (signal) => {
      const r = await api.recipes.get(id!)
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      return r.doc
    },
    [id],
    { enabled: !!id },
  )

  useEffect(() => {
    if (!id) setDoc(emptyDoc)
  }, [id])

  useEffect(() => {
    if (fetchedDoc) setDoc(fetchedDoc)
  }, [fetchedDoc])

  const update = (patch: Partial<RecipeDoc>) => setDoc((d) => ({ ...d, ...patch }))

  const addIngredient = () => {
    setDoc((d) => ({
      ...d,
      ingredients: [...d.ingredients, { name: '', quantity: '', unit: '' }],
    }))
  }
  const updateIngredient = (i: number, patch: Partial<Ingredient>) => {
    setDoc((d) => ({
      ...d,
      ingredients: d.ingredients.map((ing, j) =>
        j === i ? { ...ing, ...patch } : ing
      ),
    }))
  }
  const removeIngredient = (i: number) => {
    setDoc((d) => ({
      ...d,
      ingredients: d.ingredients.filter((_, j) => j !== i),
    }))
  }

  const addStep = () => {
    setDoc((d) => ({ ...d, steps: [...d.steps, ''] }))
  }
  const updateStep = (i: number, value: string) => {
    setDoc((d) => ({
      ...d,
      steps: d.steps.map((s, j) => (j === i ? value : s)),
    }))
  }
  const removeStep = (i: number) => {
    setDoc((d) => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const tags = tagsInputRef.current?.commitPending() ?? doc.tags
    const docToSave: RecipeDoc = { ...doc, tags }
    setSaving(true)
    setError(null)
    try {
      if (id) {
        await api.recipes.update(id, docToSave)
      } else {
        const res = await api.recipes.create(docToSave)
        navigate(`/recipes/${res.id}/edit`, { replace: true })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (id && loading) return <p>{t('recipeForm.loading')}</p>
  if (id && loadError) return <p className="text-destructive">{loadError}</p>

  return (
    <div>
      <h1>{id ? t('recipeForm.editRecipe') : t('recipeForm.newRecipe')}</h1>
      {!id && (
        <>
          <p className="mb-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              {t('recipeForm.importFromUrl')}
            </Button>
          </p>
          <RecipeImportUrlDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            onImported={({ doc: imported, warnings }) => {
              setDoc(imported)
              setImportWarnings(warnings)
            }}
          />
        </>
      )}
      {!id && importWarnings.length > 0 && (
        <div className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <p className="mb-1 font-medium text-foreground/80">{t('recipeForm.importNotes')}</p>
          <ul className="mb-2 list-disc pl-5">
            {importWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <Button type="button" variant="ghost" size="sm" onClick={() => setImportWarnings([])}>
            {t('recipeForm.dismissImportNotes')}
          </Button>
        </div>
      )}
      {error && <p className="text-destructive">{error}</p>}
      <form onSubmit={handleSubmit}>
        <p className="mb-4">
          <label className="mb-2 block font-medium">
            {t('recipeForm.name')} <Input
              required
              value={doc.name}
              onChange={(e) => update({ name: e.target.value })}
              className="mt-1 w-full"
            />
          </label>
        </p>
        <p className="mb-4">
          <label className="mb-2 block font-medium">
            {t('recipeForm.description')} <textarea
              value={doc.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-md border-2 border-input bg-background px-3 py-2 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2"
            />
          </label>
        </p>
        <RecipeSourceAttribution sourceUrl={doc.sourceUrl} sourceName={doc.sourceName} />
        <p className="mb-4">
          <label className="mb-2 block font-medium">
            {t('recipeForm.servings')} <Input
              type="number"
              min={1}
              value={doc.servings}
              onChange={(e) => update({ servings: Number(e.target.value) || 1 })}
              className="mt-1 w-20"
            />
          </label>
        </p>
        <div className="mb-4">
          <label htmlFor={tagsFieldId} className="mb-2 block font-medium">
            {t('recipeForm.tagsLabel')}
          </label>
          <RecipeTagsInput
            key={id ?? 'new'}
            ref={tagsInputRef}
            id={tagsFieldId}
            tags={doc.tags}
            onChange={(tags) => update({ tags })}
            excludeRecipeId={id}
          />
        </div>

        <h3>{t('recipeForm.ingredients')}</h3>
        {doc.ingredients.map((ing, i) => (
          <div key={i} className="mb-2 flex flex-wrap gap-2">
            <Input
              placeholder={t('recipeForm.placeholderName')}
              aria-label={t('recipeForm.ingredientNameAria')}
              value={ing.name}
              onChange={(e) => updateIngredient(i, { name: e.target.value })}
              className="min-w-32 flex-1"
            />
            <Input
              placeholder={t('recipeForm.placeholderQty')}
              aria-label={t('recipeForm.ingredientQtyAria')}
              value={ing.quantity}
              onChange={(e) => updateIngredient(i, { quantity: e.target.value })}
              className="w-20"
            />
            <Input
              placeholder={t('recipeForm.placeholderUnit')}
              aria-label={t('recipeForm.ingredientUnitAria')}
              value={ing.unit}
              onChange={(e) => updateIngredient(i, { unit: e.target.value })}
              className="w-20"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => removeIngredient(i)}>
              {t('recipeForm.remove')}
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={addIngredient}>
          {t('recipeForm.addIngredient')}
        </Button>

        <h3>{t('recipeForm.steps')}</h3>
        {doc.steps.map((step, i) => (
          <div key={i} className="mb-2">
            <textarea
              value={step}
              onChange={(e) => updateStep(i, e.target.value)}
              rows={2}
              className="w-full rounded-md border-2 border-input bg-background px-3 py-2 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2"
            />
            <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => removeStep(i)}>
              {t('recipeForm.remove')}
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={addStep}>
          {t('recipeForm.addStep')}
        </Button>

        <p className="mt-6">
          <Button type="submit" disabled={saving}>
            {saving ? t('recipeForm.saving') : id ? t('recipeForm.update') : t('recipeForm.create')}
          </Button>
        </p>
      </form>
    </div>
  )
}
