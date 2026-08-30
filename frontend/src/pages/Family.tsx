import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api'
import { BackLink } from '@/components/BackLink'
import { useAsync } from '@/hooks/useAsync'
import { formatLoadErrorMessage, mapAsyncCatchError } from '@/lib/loadErrors'
import { useAuth } from '@/contexts/AuthContext'
import { FamilyAcceptInvite } from './family/FamilyAcceptInvite'
import { FamilyDefaultPeople } from './family/FamilyDefaultPeople'
import { FamilyInviteForm } from './family/FamilyInviteForm'
import { FamilyMemberList } from './family/FamilyMemberList'

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
      setError(mapAsyncCatchError(e))
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
      setError(mapAsyncCatchError(err))
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
      setError(mapAsyncCatchError(err))
    } finally {
      setAcceptBusy(false)
    }
  }

  if (loading && !family) {
    return <p className="text-muted-foreground">{t('common.loading')}</p>
  }

  return (
    <div className="space-y-4">
      <header>
        <BackLink to="/profile" label={t('nav.profile')} />
        <h1 className="mt-1 mb-0">{t('family.title')}</h1>
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

      {family && (
        <>
          <FamilyDefaultPeople
            value={defaultPeople}
            saving={savingDefaults}
            onChange={setDefaultPeople}
            onSave={() => void saveDefaults()}
          />

          <FamilyMemberList members={family.members} />

          <FamilyInviteForm
            inviteEmail={inviteEmail}
            busy={inviteBusy}
            lastInviteUrl={lastInviteUrl}
            pendingInvites={family.pendingInvites}
            onInviteEmailChange={setInviteEmail}
            onSendInvite={(e) => void sendInvite(e)}
            onCopyInviteUrl={() => void copyInviteUrl()}
          />

          <FamilyAcceptInvite
            token={acceptToken}
            busy={acceptBusy}
            onTokenChange={setAcceptToken}
            onAcceptInvite={(e) => void acceptInvite(e)}
          />
        </>
      )}
    </div>
  )
}
