import { getAuthDisabled, getToken, triggerUnauthorized } from '@/lib/authStore'

const base = import.meta.env.VITE_API_URL ?? ''

export type UserInfoWithFamily = { id: string; email: string; role: string; familyId: string }

export type AuthSessionResponse = { token: string; user: UserInfoWithFamily }

/** Unauthenticated JSON POST (login/setup/register) — no Bearer header, no 401 global handler. */
async function publicRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  const res = await fetch(`${base}${path}`, { ...options, headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}

function normalizeRecipeDoc(doc: import('./types').RecipeDoc): import('./types').RecipeDoc
function normalizeRecipeDoc(doc: Partial<import('./types').RecipeDoc>): import('./types').RecipeDoc
function normalizeRecipeDoc(
  doc: Partial<import('./types').RecipeDoc>
): import('./types').RecipeDoc {
  return {
    name: doc.name ?? '',
    description: doc.description ?? '',
    ingredients: doc.ingredients ?? [],
    steps: doc.steps ?? [],
    servings: doc.servings ?? 4,
    tags: doc.tags ?? [],
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  if (!getAuthDisabled()) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${base}${path}`, { ...options, headers })
  if (!res.ok) {
    if (res.status === 401 && !getAuthDisabled()) triggerUnauthorized()
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  auth: {
    login: (body: { email: string; password: string }) =>
      publicRequest<AuthSessionResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    setup: (body: { email: string; password: string }) =>
      publicRequest<AuthSessionResponse>('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    registerWithInvite: (body: { token: string; email: string; password: string }) =>
      publicRequest<AuthSessionResponse>('/api/auth/register-invite', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  recipes: {
    list: (params?: { name?: string; tag?: string }) => {
      const q = new URLSearchParams()
      if (params?.name) q.set('name', params.name)
      if (params?.tag) q.set('tag', params.tag)
      const query = q.toString()
      return request<{ id: string; doc: Partial<import('./types').RecipeDoc> }[]>(
        `/api/recipes${query ? `?${query}` : ''}`
      ).then((list) => list.map((r) => ({ ...r, doc: normalizeRecipeDoc(r.doc) })))
    },
    get: (id: string) =>
      request<{ id: string; doc: Partial<import('./types').RecipeDoc> }>(`/api/recipes/${id}`).then(
        (r) => ({ ...r, doc: normalizeRecipeDoc(r.doc) })
      ),
    create: (doc: import('./types').RecipeDoc) =>
      request<{ id: string; doc: Partial<import('./types').RecipeDoc> }>('/api/recipes', {
        method: 'POST',
        body: JSON.stringify(doc),
      }).then((r) => ({ ...r, doc: normalizeRecipeDoc(r.doc) })),
    update: (id: string, doc: import('./types').RecipeDoc) =>
      request<{ id: string; doc: Partial<import('./types').RecipeDoc> }>(`/api/recipes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(doc),
      }).then((r) => ({ ...r, doc: normalizeRecipeDoc(r.doc) })),
    delete: (id: string) =>
      request<void>(`/api/recipes/${id}`, { method: 'DELETE' }),
    tagSuggestions: (
      q: string,
      opts?: { excludeRecipeId?: string; signal?: AbortSignal }
    ) => {
      const params = new URLSearchParams()
      params.set('q', q.trim())
      if (opts?.excludeRecipeId) params.set('excludeRecipeId', opts.excludeRecipeId)
      return request<string[]>(`/api/recipes/tags?${params}`, { signal: opts?.signal })
    },
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
  users: {
    create: (body: { email: string; password: string; role: string }) =>
      request<{ id: string; email: string; role: string; familyId: string }>('/api/users', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  family: {
    get: () =>
      request<{
        id: string
        defaultMealPlanPersons: number
        members: { id: string; email: string }[]
        pendingInvites: { id: string; inviteeEmail: string; token: string; expiresAt: string }[]
      }>('/api/family'),
    patchDefaultPersons: (defaultMealPlanPersons: number) =>
      request<{ defaultMealPlanPersons: number }>('/api/family', {
        method: 'PATCH',
        body: JSON.stringify({ defaultMealPlanPersons }),
      }),
    createInvite: (email: string) =>
      request<{ token: string; expiresAt: string }>('/api/family/invites', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    acceptInvite: (token: string) =>
      request<{ familyId: string }>('/api/family/invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
  },
}
