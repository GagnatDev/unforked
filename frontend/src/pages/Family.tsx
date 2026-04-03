import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/contexts/AuthContext'

export default function Family() {
  const { t } = useTranslation()
  const { refreshUser } = useAuth()
  const [reloadKey, setReloadKey] = useState(0)
  const { data: family, loading, error: loadError } = useAsync(
    (_signal) => api.family.get(),
    [reloadKey],
    { keepPreviousData: true },
  )
  const [error, setError] = useState<string | null>(null)
  const [defaultPeople, setDefaultPeople] = useState('')
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null)
  const [acceptToken, setAcceptToken] = useState('')
  const [acceptBusy, setAcceptBusy] = useState(false)

  const refetch = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (family) {
      setDefaultPeople(String(family.defaultMealPlanPersons))
    }
  }, [family])

  const saveDefaults = async () => {
    const n = Number.parseInt(defaultPeople, 10)
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      setError(t('family.defaultPeopleInvalid'))
      return
    }
    setSavingDefaults(true)
    setError(null)
    try {
      await api.family.patchDefaultPersons(n)
      refetch()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSavingDefaults(false)
    }
  }

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteBusy(true)
    setError(null)
    setLastInviteUrl(null)
    try {
      const { token } = await api.family.createInvite(inviteEmail.trim())
      const url = `${window.location.origin}/register-invite?token=${encodeURIComponent(token)}`
      setLastInviteUrl(url)
      setInviteEmail('')
      refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInviteBusy(false)
    }
  }

  const copyInviteUrl = async () => {
    if (!lastInviteUrl) return
    await navigator.clipboard.writeText(lastInviteUrl)
  }

  const acceptInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setAcceptBusy(true)
    setError(null)
    try {
      await api.family.acceptInvite(acceptToken.trim())
      setAcceptToken('')
      await refreshUser()
      refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAcceptBusy(false)
    }
  }

  if (loading && !family) {
    return <p className="text-muted-foreground">{t('common.loading')}</p>
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">{t('family.title')}</h1>
      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {family && (
        <>
          <section className="space-y-2">
            <h2 className="text-lg font-medium">{t('family.defaultMealPlanning')}</h2>
            <p className="text-sm text-muted-foreground">{t('family.defaultMealPlanningHint')}</p>
            <div className="flex max-w-xs flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="family-default-people" className="mb-1 block text-sm font-medium">
                  {t('family.defaultPeople')}
                </label>
                <Input
                  id="family-default-people"
                  type="number"
                  min={1}
                  max={50}
                  value={defaultPeople}
                  onChange={(e) => setDefaultPeople(e.target.value)}
                />
              </div>
              <Button type="button" onClick={() => void saveDefaults()} disabled={savingDefaults}>
                {savingDefaults ? t('common.loading') : t('family.save')}
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium">{t('family.members')}</h2>
            <ul className="list-inside list-disc text-sm">
              {family.members.map((m) => (
                <li key={m.id}>{m.email}</li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium">{t('family.inviteSomeone')}</h2>
            <p className="text-sm text-muted-foreground">{t('family.inviteHint')}</p>
            <form onSubmit={(e) => void sendInvite(e)} className="flex max-w-md flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t('auth.email')}
                className="flex-1"
              />
              <Button type="submit" disabled={inviteBusy}>
                {inviteBusy ? t('common.loading') : t('family.createInvite')}
              </Button>
            </form>
            {lastInviteUrl && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <p className="mb-2 font-medium">{t('family.inviteLinkReady')}</p>
                <code className="mb-2 block break-all text-xs">{lastInviteUrl}</code>
                <Button type="button" variant="secondary" size="sm" onClick={() => void copyInviteUrl()}>
                  {t('family.copyInviteLink')}
                </Button>
              </div>
            )}
            {family.pendingInvites.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">{t('family.pendingInvites')}</p>
                <ul className="text-sm text-muted-foreground">
                  {family.pendingInvites.map((p) => (
                    <li key={p.id}>
                      {p.inviteeEmail} — {t('family.expires')} {new Date(p.expiresAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium">{t('family.acceptInviteTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('family.acceptInviteHint')}</p>
            <form onSubmit={(e) => void acceptInvite(e)} className="max-w-md space-y-2">
              <Input
                value={acceptToken}
                onChange={(e) => setAcceptToken(e.target.value)}
                placeholder={t('family.inviteTokenPlaceholder')}
                className="font-mono text-sm"
              />
              <Button type="submit" disabled={acceptBusy || !acceptToken.trim()}>
                {acceptBusy ? t('common.loading') : t('family.joinFamily')}
              </Button>
            </form>
          </section>
        </>
      )}
    </div>
  )
}
