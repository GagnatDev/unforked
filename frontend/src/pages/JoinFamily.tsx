import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/api'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Accept a family invitation. Invite links land here; by the time this renders
 * the auth sidecar has already made the visitor log in (or sign up) with
 * homectl-auth, so joining is a single confirmation — no local account form.
 */
export default function JoinFamily() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { joinFamily } = useAuth()
  const [token, setToken] = useState(() => searchParams.get('token') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { familyId } = await api.family.acceptInvite(token.trim())
      await joinFamily(familyId)
      navigate('/family', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 pt-8">
      <header>
        <h1 className="mb-0">{t('family.acceptInviteTitle')}</h1>
      </header>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-3 rounded-2xl bg-card p-4 text-card-foreground"
      >
        <p className="text-sm text-muted-foreground">{t('family.acceptInviteHint')}</p>
        <div>
          <label htmlFor="invite-token" className="mb-1.5 block text-sm font-medium">
            {t('family.inviteToken')}
          </label>
          <Input
            id="invite-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            className="h-11 w-full rounded-xl font-mono text-sm"
          />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button
          type="submit"
          disabled={submitting || !token.trim()}
          className="h-11 w-full rounded-full px-5"
        >
          {submitting ? t('common.loading') : t('family.joinFamily')}
        </Button>
      </form>
    </div>
  )
}
