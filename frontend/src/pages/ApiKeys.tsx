import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api'
import { BackLink } from '@/components/BackLink'
import { CheckboxField } from '@/components/CheckboxField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAsync } from '@/hooks/useAsync'
import { useLocale } from '@/hooks/useLocale'
import { formatIsoDate, formatIsoDateTime } from '@/lib/format'
import { formatLoadErrorMessage, mapAsyncCatchError } from '@/lib/loadErrors'
import type { ApiKey } from '@/types'

/**
 * Manage machine-API keys for the current user: create (plaintext shown once),
 * list, revoke. Keys are pasted into a trusted app's configuration — see
 * docs/aivo-integration.md in the repo.
 */
export default function ApiKeys() {
  const { t } = useTranslation()
  const locale = useLocale()
  const [reloadKey, setReloadKey] = useState(0)
  const { data: keys, loading, error: loadError } = useAsync(
    (_signal) => api.apiKeys.list(),
    [reloadKey],
    { keepPreviousData: true },
  )
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [allowWrite, setAllowWrite] = useState(false)
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
      const created = await api.apiKeys.create(name.trim(), allowWrite ? ['write'] : [])
      setCreatedKey({ name: created.name, key: created.key })
      setName('')
      setAllowWrite(false)
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
    <div className="space-y-4">
      <header>
        <BackLink to="/profile" label={t('nav.profile')} />
        <h1 className="mt-1 mb-0">{t('apiKeys.title')}</h1>
        <p className="mt-2 mb-0 max-w-prose text-sm text-muted-foreground">
          {t('apiKeys.intro')}
        </p>
      </header>

      {loadError && (
        <p className="rounded-2xl bg-card px-4 py-3 text-sm text-destructive" role="alert">
          {formatLoadErrorMessage(loadError, t)}
        </p>
      )}
      {error && (
        <p className="rounded-2xl bg-card px-4 py-3 text-sm text-destructive" role="alert">
          {formatLoadErrorMessage(error, t)}
        </p>
      )}

      <form
        onSubmit={(e) => void createKey(e)}
        className="space-y-3 rounded-2xl bg-card p-4 text-card-foreground"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="mb-1.5 block text-sm font-medium">{t('apiKeys.nameLabel')}</span>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('apiKeys.namePlaceholder')}
              className="h-11 w-full rounded-xl"
            />
          </label>
          <Button type="submit" disabled={creating} className="h-11 shrink-0 rounded-full px-5">
            {creating ? t('common.loading') : t('apiKeys.create')}
          </Button>
        </div>
        <CheckboxField
          checked={allowWrite}
          onCheckedChange={setAllowWrite}
          className="min-h-11 items-start gap-2.5"
          label={
            <span className="block">
              {t('apiKeys.writeLabel')}
              <span className="block text-xs text-muted-foreground">{t('apiKeys.writeHint')}</span>
            </span>
          }
        />
      </form>

      {/* Shown once, and only once: tinted so the one moment the plaintext key
          exists on screen is unmistakable. */}
      {createdKey && (
        <div className="space-y-2 rounded-2xl bg-accent p-4 text-accent-foreground">
          <div>
            <p className="font-semibold">{t('apiKeys.createdTitle')}</p>
            <p className="mt-1 text-sm">{t('apiKeys.createdHint')}</p>
          </div>
          <code className="block rounded-xl bg-card px-3 py-2.5 font-mono text-xs break-all text-card-foreground">
            {createdKey.key}
          </code>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void copyKey()}
            className="h-11 rounded-full px-4"
          >
            {copied ? t('apiKeys.copied') : t('apiKeys.copy')}
          </Button>
        </div>
      )}

      {keys && keys.length === 0 && (
        <p className="rounded-2xl bg-card px-4 py-3 text-sm text-muted-foreground">
          {t('apiKeys.empty')}
        </p>
      )}

      {keys && keys.length > 0 && (
        <ul className="m-0 list-none rounded-2xl bg-card p-1.5 text-card-foreground">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex min-h-14 items-center gap-3 px-3 py-2 not-last:border-b not-last:border-border/60"
            >
              <div className="min-w-0 flex-1">
                <p
                  className={
                    key.revokedAt
                      ? 'font-medium text-muted-foreground line-through'
                      : 'font-medium'
                  }
                >
                  <span className="break-all">{key.name}</span>
                  {key.scopes.includes('write') && (
                    <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {t('apiKeys.writeBadge')}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {t('apiKeys.createdAt')} {formatIsoDate(key.createdAt, locale)}
                  {' · '}
                  {key.lastUsedAt
                    ? `${t('apiKeys.lastUsed')} ${formatIsoDateTime(key.lastUsedAt, locale)}`
                    : t('apiKeys.neverUsed')}
                </p>
              </div>
              {key.revokedAt ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t('apiKeys.revoked')}
                </span>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void revokeKey(key)}
                  className="h-11 shrink-0 rounded-full px-4"
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
