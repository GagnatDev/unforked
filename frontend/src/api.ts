const base = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  recipes: {
    list: (params?: { name?: string; tag?: string }) => {
      const q = new URLSearchParams()
      if (params?.name) q.set('name', params.name)
      if (params?.tag) q.set('tag', params.tag)
      const query = q.toString()
      return request<{ id: string; doc: import('./types').RecipeDoc }[]>(
        `/api/recipes${query ? `?${query}` : ''}`
      )
    },
    get: (id: string) =>
      request<{ id: string; doc: import('./types').RecipeDoc }>(`/api/recipes/${id}`),
    create: (doc: import('./types').RecipeDoc) =>
      request<{ id: string; doc: import('./types').RecipeDoc }>('/api/recipes', {
        method: 'POST',
        body: JSON.stringify(doc),
      }),
    update: (id: string, doc: import('./types').RecipeDoc) =>
      request<{ id: string; doc: import('./types').RecipeDoc }>(`/api/recipes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(doc),
      }),
    delete: (id: string) =>
      request<void>(`/api/recipes/${id}`, { method: 'DELETE' }),
  },
  mealPlans: {
    getCurrent: (week?: string) =>
      request<import('./types').MealPlanDoc>(
        `/api/meal-plans/current${week ? `?week=${encodeURIComponent(week)}` : ''}`
      ),
    putCurrent: (doc: import('./types').MealPlanDoc, week?: string) =>
      request<import('./types').MealPlanDoc>(
        `/api/meal-plans/current${week ? `?week=${encodeURIComponent(week)}` : ''}`,
        { method: 'PUT', body: JSON.stringify(doc) }
      ),
  },
  shoppingList: (week?: string) =>
    request<import('./types').ShoppingListDoc>(
      `/api/shopping-lists${week ? `?week=${encodeURIComponent(week)}` : ''}`
    ),
}
