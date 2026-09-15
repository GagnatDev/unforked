import { useId, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  RecipeTagsInput,
  type RecipeTagsInputHandle,
} from '@/components/RecipeTagsInput'
import { RecipeImportUrlDialog } from '@/components/RecipeImportUrlDialog'
import { RecipePhotoSection } from '@/components/RecipePhotoSection'
import { RecipeSourceAttribution } from '@/components/RecipeSourceAttribution'
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea'
import { Button } from '@/components/ui/button'
import { BackLink } from '@/components/BackLink'
import { formatLoadErrorMessage } from '@/lib/loadErrors'
import { Input } from '@/components/ui/input'
import { createRecipe, updateRecipe } from '@/local/mutations'
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
    unavailable,
    pullError,
    error,
    setError,
    releaseUnsaved,
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
      // Apply to the local store and queue the server write (offline-first):
      // the recipe list and Today view reflect the save immediately, and the
      // outbox drains it to the server when the network allows.
      if (id) {
        await updateRecipe(id, docToSave)
      } else {
        const created = await createRecipe(docToSave)
        navigate(`/recipes/${created.id}/edit`, { replace: true })
      }
      // The draft is durable now (local store + outbox), so it no longer holds
      // back a deferred re-auth: this is the break silent re-auth waits for.
      releaseUnsaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p>{t('recipeForm.loading')}</p>

  const pullStatus = pullError && (
    <p role="status" className="mb-4 text-sm text-muted-foreground">
      {formatLoadErrorMessage(pullError, t)}
    </p>
  )

  if (unavailable) {
    return (
      <div className="space-y-4">
        <BackLink to="/recipes" label={t('recipeForm.backToRecipes')} />
        <h1>{t('recipeForm.editRecipe')}</h1>
        {pullStatus}
        <p>{t('recipeForm.unavailableLocally')}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="mb-0">{id ? t('recipeForm.editRecipe') : t('recipeForm.newRecipe')}</h1>
        {!id && (
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-full px-4"
            onClick={() => setImportOpen(true)}
          >
            {t('recipeForm.importFromUrl')}
          </Button>
        )}
      </div>
      {!id && (
        <>
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
        <div className="mb-4 rounded-2xl bg-card px-4 py-3 text-sm text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">{t('recipeForm.importNotes')}</p>
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
      {pullStatus}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* What the recipe is, in one sheet; what it is made of and how to cook
            it get a sheet each below. */}
        <section className="space-y-4 rounded-2xl bg-card p-4 text-card-foreground">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t('recipeForm.name')}</span>
            <Input
              required
              autoCapitalize="none"
              value={doc.name}
              onChange={(e) => update({ name: e.target.value })}
              className="h-11 w-full rounded-xl"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              {t('recipeForm.description')}
            </span>
            <AutoGrowTextarea
              value={doc.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={2}
              className="w-full rounded-xl"
            />
          </label>
          <RecipeSourceAttribution
            sourceUrl={doc.sourceUrl}
            sourceName={doc.sourceName}
            collapsible
            className="mb-0"
          />
          {id && (
            <RecipePhotoSection
              recipeId={id}
              photo={doc.photo}
              onPhotoChange={(photo) => update({ photo })}
              alt={doc.name}
            />
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t('recipeForm.servings')}</span>
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={doc.servings}
              onChange={(e) => update({ servings: Number(e.target.value) || 1 })}
              className="h-11 w-24 rounded-xl"
            />
          </label>
          <div>
            <label htmlFor={tagsFieldId} className="mb-1.5 block text-sm font-medium">
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
        </section>

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

        {/* Sticky save, parked above the tab bar rather than under it, so a
            long form never hides the one action that finishes it. */}
        <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 flex flex-col items-stretch gap-2 sm:items-end">
          {error && (
            <p className="rounded-xl bg-card px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          <Button
            type="submit"
            disabled={saving}
            className="h-12 rounded-full px-6 shadow-[0_8px_22px_-8px_oklch(0.23_0.02_156/0.55)]"
          >
            {saving ? t('recipeForm.saving') : id ? t('recipeForm.update') : t('recipeForm.create')}
          </Button>
        </div>
      </form>
    </div>
  )
}
