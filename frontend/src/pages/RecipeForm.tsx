import { useId, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  RecipeTagsInput,
  type RecipeTagsInputHandle,
} from '@/components/RecipeTagsInput'
import { RecipeImportUrlDialog } from '@/components/RecipeImportUrlDialog'
import { RecipeSourceAttribution } from '@/components/RecipeSourceAttribution'
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/api'
import { IngredientListEditor } from './recipe-form/IngredientListEditor'
import { StepListEditor } from './recipe-form/StepListEditor'
import { useRecipeFormState } from './recipe-form/useRecipeFormState'

export default function RecipeForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const tagsFieldId = useId()
  const tagsInputRef = useRef<RecipeTagsInputHandle>(null)
  const {
    doc,
    setDoc,
    loading,
    error,
    setError,
    update,
    addIngredient,
    updateIngredient,
    removeIngredient,
    moveIngredient,
    addStep,
    updateStep,
    removeStep,
  } = useRecipeFormState(id)
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importWarnings, setImportWarnings] = useState<string[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const tags = tagsInputRef.current?.commitPending() ?? doc.tags
    const docToSave = { ...doc, tags }
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

  if (loading) return <p>{t('recipeForm.loading')}</p>

  return (
    <div>
      <h1>{id ? t('recipeForm.editRecipe') : t('recipeForm.newRecipe')}</h1>
      {!id && (
        <>
          <div className="mb-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              {t('recipeForm.importFromUrl')}
            </Button>
          </div>
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
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="mb-2 block font-medium">
            {t('recipeForm.name')} <Input
              required
              autoCapitalize="none"
              value={doc.name}
              onChange={(e) => update({ name: e.target.value })}
              className="mt-1 w-full"
            />
          </label>
        </div>
        <div className="mb-4">
          <label className="mb-2 block font-medium">
            {t('recipeForm.description')}{' '}
            <AutoGrowTextarea
              value={doc.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={2}
              className="mt-1 w-full"
            />
          </label>
        </div>
        <RecipeSourceAttribution
          sourceUrl={doc.sourceUrl}
          sourceName={doc.sourceName}
          collapsible
        />
        <div className="mb-4">
          <label className="mb-2 block font-medium">
            {t('recipeForm.servings')} <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={doc.servings}
              onChange={(e) => update({ servings: Number(e.target.value) || 1 })}
              className="mt-1 w-20"
            />
          </label>
        </div>
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

        <IngredientListEditor
          ingredients={doc.ingredients}
          onAdd={addIngredient}
          onUpdate={updateIngredient}
          onRemove={removeIngredient}
          onMove={moveIngredient}
        />

        <StepListEditor
          steps={doc.steps}
          onAdd={addStep}
          onUpdate={updateStep}
          onRemove={removeStep}
        />

        <div className="sticky bottom-0 z-10 -mx-6 mt-6 border-t border-border bg-background/90 px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-end">
            <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
              {saving ? t('recipeForm.saving') : id ? t('recipeForm.update') : t('recipeForm.create')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
