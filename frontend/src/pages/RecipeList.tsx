import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '../api'
import type { Recipe } from '../types'

export default function RecipeList() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.recipes
      .list(search ? { name: search } : undefined)
      .then((data) => {
        if (!cancelled) setRecipes(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [search])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    try {
      await api.recipes.delete(id)
      setRecipes((prev) => prev.filter((r) => r.id !== id))
    } catch (e) {
      alert((e as Error).message)
    }
  }

  if (error) return <p className="text-destructive">{error}</p>
  if (loading) return <p>Loading recipes…</p>

  return (
    <div>
      <h1>Recipes</h1>
      <p className="mb-4">
        <Input
          type="search"
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </p>
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
                  Serves {r.doc.servings}
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
              Delete
            </Button>
          </li>
        ))}
      </ul>
      {recipes.length === 0 && <p>No recipes yet. <Link to="/recipes/new">Add one</Link>.</p>}
    </div>
  )
}
