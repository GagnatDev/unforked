import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { recipePhotoUrl } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listLocalRecipes } from '@/local/db'
import { deleteRecipe } from '@/local/mutations'
import { pullRecipes } from '@/local/sync'
import { useBackgroundPull } from '@/local/useBackgroundPull'
import { useLocal } from '@/local/useLocal'
import { formatLoadErrorMessage } from '@/lib/loadErrors'

export default function RecipeList() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const { data: allRecipes, loading: localLoading } = useLocal(
    () => listLocalRecipes(),
    ['recipes'],
    [],
  )
  const { error: pullError } = useBackgroundPull(() => pullRecipes(), [])

  // Search filters the local store (matches the server's case-insensitive
  // substring match), so it works offline and never waits on the network.
  const recipes = useMemo(() => {
    if (!allRecipes) return []
    const query = search.trim().toLowerCase()
    if (!query) return allRecipes
    return allRecipes.filter((r) => r.doc.name.toLowerCase().includes(query))
  }, [allRecipes, search])

  // With nothing local yet, stay in loading until the pull lands in the
  // store (or fails); with local data, pull errors are irrelevant offline noise.
  const loading = localLoading || (allRecipes == null && pullError == null)
  const error = allRecipes == null ? pullError : null

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('recipes.deleteConfirm', { name }))) return
    try {
      // Optimistic: removes locally and queues the server delete (offline-first).
      await deleteRecipe(id)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  if (error) {
    return (
      <p className="text-destructive">{formatLoadErrorMessage(error, t)}</p>
    )
  }

  return (
    <div>
      <h1>{t('recipes.title')}</h1>
      <p className="mb-4">
        <Input
          type="search"
          placeholder={t('recipes.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </p>
      {loading ? (
        <p>{t('recipes.loading')}</p>
      ) : (
        <>
          <ul className="list-none p-0 space-y-2">
            {recipes.map((r) => (
              <li
              key={r.id}
              className="flex justify-between items-center gap-2 rounded-lg bg-card border border-border px-3 py-3 text-card-foreground"
            >
              <div className="flex min-w-0 items-center gap-3">
                {r.doc.photo && (
                  <Link to={`/recipes/${r.id}/edit`} className="shrink-0" tabIndex={-1} aria-hidden="true">
                    <img
                      src={recipePhotoUrl(r.id, 'thumb', r.doc.photo.key)}
                      crossOrigin="anonymous"
                      loading="lazy"
                      alt=""
                      className="h-12 w-12 rounded-md border border-border object-cover"
                    />
                  </Link>
                )}
                <div className="min-w-0">
                <Link to={`/recipes/${r.id}/edit`} className="font-semibold">
                  {r.doc.name}
                </Link>
                {r.doc.servings > 0 && (
                  <span className="ml-2 text-muted-foreground">
                    {t('recipes.serves', { count: r.doc.servings })}
                  </span>
                )}
                {r.doc.tags.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {r.doc.tags.join(', ')}
                  </span>
                )}
                </div>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(r.id, r.doc.name)}
              >
                {t('recipes.delete')}
              </Button>
            </li>
            ))}
          </ul>
          {recipes.length === 0 && (
            <p>
              <Trans i18nKey="recipes.noRecipes" components={{ 1: <Link to="/recipes/new" /> }} />
            </p>
          )}
        </>
      )}
    </div>
  )
}
