import { reloadForLogin } from '@/lib/session'
import type {
  ApiKey,
  MealPlanDoc,
  PersistedShoppingListDoc,
  RecipeDoc,
  ShoppingCategory,
  ShoppingListEntry,
} from '@/types'

const base = import.meta.env.VITE_API_URL ?? ''

function normalizeRecipeDoc(doc: RecipeDoc): RecipeDoc
function normalizeRecipeDoc(doc: Partial<RecipeDoc>): RecipeDoc
function normalizeRecipeDoc(doc: Partial<RecipeDoc>): RecipeDoc {
  return {
    name: doc.name ?? '',
    description: doc.description ?? '',
    sourceUrl: doc.sourceUrl ?? null,
    sourceName: doc.sourceName ?? null,
    ingredients: doc.ingredients ?? [],
    steps: doc.steps ?? [],
    servings: doc.servings ?? 4,
    tags: doc.tags ?? [],
  }
}

/**
 * Same-origin JSON request. Auth is invisible to the SPA — the auth-proxy
 * sidecar authenticates from its session cookie. A 401 means no session: bounce
 * to a full page load so the sidecar can run its login redirect.
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  const res = await fetch(`${base}${path}`, { ...options, headers })
  if (!res.ok) {
    if (res.status === 401) reloadForLogin()
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
      return request<{ id: string; doc: Partial<RecipeDoc> }[]>(
        `/api/recipes${query ? `?${query}` : ''}`
      ).then((list) => list.map((r) => ({ ...r, doc: normalizeRecipeDoc(r.doc) })))
    },
    get: (id: string) =>
      request<{ id: string; doc: Partial<RecipeDoc> }>(`/api/recipes/${id}`).then(
        (r) => ({ ...r, doc: normalizeRecipeDoc(r.doc) })
      ),
    create: (doc: RecipeDoc) =>
      request<{ id: string; doc: Partial<RecipeDoc> }>('/api/recipes', {
        method: 'POST',
        body: JSON.stringify(doc),
      }).then((r) => ({ ...r, doc: normalizeRecipeDoc(r.doc) })),
    update: (id: string, doc: RecipeDoc) =>
      request<{ id: string; doc: Partial<RecipeDoc> }>(`/api/recipes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(doc),
      }).then((r) => ({ ...r, doc: normalizeRecipeDoc(r.doc) })),
    delete: (id: string) =>
      request<void>(`/api/recipes/${id}`, { method: 'DELETE' }),
    importFromUrl: (url: string) =>
      request<{ doc: Partial<RecipeDoc>; warnings?: string[] }>(
        `/api/recipes/import`,
        { method: 'POST', body: JSON.stringify({ url }) }
      ).then((r) => ({
        doc: normalizeRecipeDoc(r.doc),
        warnings: Array.isArray(r.warnings) ? r.warnings : [],
      })),
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
      request<MealPlanDoc>(
        `/api/meal-plans/current${week ? `?week=${encodeURIComponent(week)}` : ''}`
      ),
    putCurrent: (doc: MealPlanDoc, week?: string) =>
      request<MealPlanDoc>(
        `/api/meal-plans/current${week ? `?week=${encodeURIComponent(week)}` : ''}`,
        { method: 'PUT', body: JSON.stringify(doc) }
      ),
  },
  shoppingList: {
    get: (week?: string) =>
      request<PersistedShoppingListDoc>(
        `/api/shopping-lists${week ? `?week=${encodeURIComponent(week)}` : ''}`
      ),
    patchItem: (
      id: string,
      body: { checked?: boolean; category?: ShoppingCategory },
      week?: string
    ) =>
      request<ShoppingListEntry>(
        `/api/shopping-lists/items/${id}${week ? `?week=${encodeURIComponent(week)}` : ''}`,
        { method: 'PATCH', body: JSON.stringify(body) }
      ),
    addItem: (
      body: { name: string; quantity?: string; unit?: string; category?: ShoppingCategory },
      week?: string
    ) =>
      request<ShoppingListEntry>(
        `/api/shopping-lists/items${week ? `?week=${encodeURIComponent(week)}` : ''}`,
        { method: 'POST', body: JSON.stringify(body) }
      ),
    deleteItem: (id: string, week?: string) =>
      request<void>(
        `/api/shopping-lists/items/${id}${week ? `?week=${encodeURIComponent(week)}` : ''}`,
        { method: 'DELETE' }
      ),
  },
  apiKeys: {
    list: () => request<ApiKey[]>('/api/api-keys'),
    // The response's `key` is the plaintext, returned exactly once at creation.
    // Scopes: every key can read; pass ['write'] to also allow mutations
    // (adding shopping-list items) — the server always includes 'read'.
    create: (name: string, scopes: string[] = []) =>
      request<ApiKey & { key: string }>('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name, scopes }),
      }),
    revoke: (id: string) => request<void>(`/api/api-keys/${id}`, { method: 'DELETE' }),
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
