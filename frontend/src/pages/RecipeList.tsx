import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAsync } from '@/hooks/useAsync'
import { api } from '../api'
import type { Recipe } from '../types'

export default function RecipeList() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const { data, loading, error } = useAsync(
    (_signal) => api.recipes.list(search ? { name: search } : undefined),
    [search],
  )
  const [recipes, setRecipes] = useState<Recipe[]>([])

  useEffect(() => {
    if (data) setRecipes(data)
  }, [data])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('recipes.deleteConfirm', { name }))) return
    try {
      await api.recipes.delete(id)
      setRecipes((prev) => prev.filter((r) => r.id !== id))
    } catch (e) {
      alert((e as Error).message)
    }
  }

  if (error) return <p className="text-destructive">{error}</p>

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
              <div>
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
