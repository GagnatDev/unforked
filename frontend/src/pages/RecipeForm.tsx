import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import type { RecipeDoc, Ingredient } from '../types'

const emptyDoc: RecipeDoc = {
  name: '',
  description: '',
  ingredients: [],
  steps: [],
  servings: 4,
  tags: [],
}

export default function RecipeForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<RecipeDoc>(emptyDoc)
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api.recipes
      .get(id)
      .then((r) => {
        if (!cancelled) setDoc(r.doc)
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
  }, [id])

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
    setSaving(true)
    setError(null)
    try {
      if (id) {
        await api.recipes.update(id, doc)
      } else {
        const res = await api.recipes.create(doc)
        navigate(`/recipes/${res.id}/edit`, { replace: true })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h1>{id ? 'Edit recipe' : 'New recipe'}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <p>
          <label>
            Name <input
              required
              value={doc.name}
              onChange={(e) => update({ name: e.target.value })}
              style={{ width: '100%', padding: 8 }}
            />
          </label>
        </p>
        <p>
          <label>
            Description <textarea
              value={doc.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={2}
              style={{ width: '100%', padding: 8 }}
            />
          </label>
        </p>
        <p>
          <label>
            Servings <input
              type="number"
              min={1}
              value={doc.servings}
              onChange={(e) => update({ servings: Number(e.target.value) || 1 })}
              style={{ width: 80, padding: 8 }}
            />
          </label>
        </p>
        <p>
          <label>
            Tags (comma-separated){' '}
            <input
              value={doc.tags.join(', ')}
              onChange={(e) =>
                update({
                  tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                })
              }
              style={{ width: '100%', padding: 8 }}
            />
          </label>
        </p>

        <h3>Ingredients</h3>
        {doc.ingredients.map((ing, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <input
              placeholder="Name"
              value={ing.name}
              onChange={(e) => updateIngredient(i, { name: e.target.value })}
              style={{ flex: 2, minWidth: 120, padding: 8 }}
            />
            <input
              placeholder="Qty"
              value={ing.quantity}
              onChange={(e) => updateIngredient(i, { quantity: e.target.value })}
              style={{ width: 80, padding: 8 }}
            />
            <input
              placeholder="Unit"
              value={ing.unit}
              onChange={(e) => updateIngredient(i, { unit: e.target.value })}
              style={{ width: 80, padding: 8 }}
            />
            <button type="button" onClick={() => removeIngredient(i)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={addIngredient}>Add ingredient</button>

        <h3>Steps</h3>
        {doc.steps.map((step, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <textarea
              value={step}
              onChange={(e) => updateStep(i, e.target.value)}
              rows={2}
              style={{ width: '100%', padding: 8 }}
            />
            <button type="button" onClick={() => removeStep(i)}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={addStep}>Add step</button>

        <p style={{ marginTop: 24 }}>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : id ? 'Update' : 'Create'}
          </button>
        </p>
      </form>
    </div>
  )
}
