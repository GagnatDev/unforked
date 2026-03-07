import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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

  if (error) return <p style={{ color: 'crimson' }}>{error}</p>
  if (loading) return <p>Loading recipes…</p>

  return (
    <div>
      <h1>Recipes</h1>
      <p>
        <input
          type="search"
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: 8, width: 260 }}
        />
      </p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {recipes.map((r) => (
          <li
            key={r.id}
            style={{
              padding: 12,
              marginBottom: 8,
              background: '#fff',
              borderRadius: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <Link to={`/recipes/${r.id}/edit`} style={{ fontWeight: 600 }}>
                {r.doc.name}
              </Link>
              {r.doc.servings > 0 && (
                <span style={{ color: '#666', marginLeft: 8 }}>
                  Serves {r.doc.servings}
                </span>
              )}
              {r.doc.tags.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>
                  {r.doc.tags.join(', ')}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleDelete(r.id, r.doc.name)}
              style={{ color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {recipes.length === 0 && <p>No recipes yet. <Link to="/recipes/new">Add one</Link>.</p>}
    </div>
  )
}
