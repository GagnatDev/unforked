import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAsync } from '@/hooks/useAsync'
import { formatLoadErrorMessage, mapAsyncCatchError } from '@/lib/loadErrors'
import type { ApiKey } from '@/types'

/**
 * Manage machine-API keys for the current user: create (plaintext shown once),
 * list, revoke. Keys are pasted into a trusted app's configuration — see
 * docs/aivo-integration.md in the repo.
 */
export default function ApiKeys() {
  const { t } = useTranslation()
  const [reloadKey, setReloadKey] = useState(0)
  const { data: keys, loading, error: loadError } = useAsync(
    (_signal) => api.apiKeys.list(),
    [reloadKey],
    { keepPreviousData: true },
  )
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<{ name: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    setCreatedKey(null)
    setCopied(false)
    try {
      const created = await api.apiKeys.create(name.trim())
      setCreatedKey({ name: created.name, key: created.key })
      setName('')
      refetch()
    } catch (err) {
      setError(mapAsyncCatchError(err))
    } finally {
      setCreating(false)
    }
  }

  const copyKey = async () => {
    if (!createdKey) return
    await navigator.clipboard.writeText(createdKey.key)
    setCopied(true)
  }

  const revokeKey = async (key: ApiKey) => {
    if (!window.confirm(t('apiKeys.revokeConfirm', { name: key.name }))) return
    setError(null)
    try {
      await api.apiKeys.revoke(key.id)
      refetch()
    } catch (err) {
      setError(mapAsyncCatchError(err))
    }
  }

  if (loading && !keys) {
    return <p className="text-muted-foreground">{t('common.loading')}</p>
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{t('apiKeys.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('apiKeys.intro')}</p>
      </div>

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {formatLoadErrorMessage(loadError, t)}
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {formatLoadErrorMessage(error, t)}
        </p>
      )}

      <form onSubmit={(e) => void createKey(e)} className="flex max-w-md flex-col gap-2 sm:flex-row">
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('apiKeys.namePlaceholder')}
          aria-label={t('apiKeys.nameLabel')}
          className="flex-1"
        />
        <Button type="submit" disabled={creating}>
          {creating ? t('common.loading') : t('apiKeys.create')}
        </Button>
      </form>

      {createdKey && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p className="mb-1 font-medium">{t('apiKeys.createdTitle')}</p>
          <p className="mb-2 text-muted-foreground">{t('apiKeys.createdHint')}</p>
          <code className="mb-2 block break-all text-xs">{createdKey.key}</code>
          <Button type="button" variant="secondary" size="sm" onClick={() => void copyKey()}>
            {copied ? t('apiKeys.copied') : t('apiKeys.copy')}
          </Button>
        </div>
      )}

      {keys && keys.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('apiKeys.empty')}</p>
      )}

      {keys && keys.length > 0 && (
        <ul className="max-w-xl divide-y divide-border rounded-md border border-border">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className={key.revokedAt ? 'font-medium line-through opacity-60' : 'font-medium'}>
                  {key.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('apiKeys.createdAt')} {new Date(key.createdAt).toLocaleDateString()}
                  {' · '}
                  {key.lastUsedAt
                    ? `${t('apiKeys.lastUsed')} ${new Date(key.lastUsedAt).toLocaleString()}`
                    : t('apiKeys.neverUsed')}
                </p>
              </div>
              {key.revokedAt ? (
                <span className="text-xs text-muted-foreground">{t('apiKeys.revoked')}</span>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void revokeKey(key)}
                >
                  {t('apiKeys.revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
