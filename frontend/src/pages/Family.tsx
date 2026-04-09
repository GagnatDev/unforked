import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
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
