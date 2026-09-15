import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { PlusIcon } from 'lucide-react'
import { recipePhotoUrl } from '@/api'
import { buttonVariants } from '@/components/ui/button'
import { SwipeToDelete } from '@/components/SwipeToDelete'
import { Input } from '@/components/ui/input'
import { listLocalRecipes } from '@/local/db'
import { deleteRecipe } from '@/local/mutations'
import { pullRecipes } from '@/local/pullDemand'
import { useBackgroundPull } from '@/local/useBackgroundPull'
import { useLocal } from '@/local/useLocal'
import { formatLoadErrorMessage } from '@/lib/loadErrors'
import { cn } from '@/lib/utils'

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

  const loading = localLoading

  // No confirm dialog: swiping the row open and then pressing the trash panel
  // is itself the two-step confirmation.
  const handleDelete = async (id: string) => {
    try {
      // Optimistic: removes locally and queues the server delete (offline-first).
      await deleteRecipe(id)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <div>
      {/* "New recipe" lives here rather than in the tab bar: capturing a recipe
          is a rare, sit-down action that belongs to the library itself. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="mb-0">{t('recipes.title')}</h1>
        <Link
          to="/recipes/new"
          className={cn(buttonVariants({ size: 'lg' }), 'h-11 gap-1.5 rounded-full px-4 no-underline hover:no-underline')}
        >
          <PlusIcon className="size-4" />
          {t('nav.newRecipe')}
        </Link>
      </div>
      <p className="mb-4">
        <Input
          type="search"
          placeholder={t('recipes.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 w-full rounded-full sm:w-72"
        />
      </p>
      {pullError && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          {formatLoadErrorMessage(pullError, t)}
        </p>
      )}
      {loading ? (
        <p>{t('recipes.loading')}</p>
      ) : (
        <>
          <ul className="list-none p-0 space-y-2">
            {recipes.map((r) => (
              <li key={r.id}>
                <SwipeToDelete
                  onDelete={() => void handleDelete(r.id)}
                  deleteLabel={t('recipes.deleteRecipe', { name: r.doc.name })}
                >
                  <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-card px-4 py-3 text-card-foreground">
                    {r.doc.photo && (
                      <Link
                        to={`/recipes/${r.id}/edit`}
                        className="shrink-0"
                        tabIndex={-1}
                        aria-hidden="true"
                      >
                        <img
                          src={recipePhotoUrl(r.id, 'thumb', r.doc.photo.key)}
                          crossOrigin="anonymous"
                          loading="lazy"
                          alt=""
                          className="h-12 w-12 rounded-xl object-cover"
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
                </SwipeToDelete>
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
