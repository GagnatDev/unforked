import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type PendingInvite = { id: string; inviteeEmail: string; expiresAt: string }

type FamilyInviteFormProps = {
  inviteEmail: string
  busy: boolean
  lastInviteUrl: string | null
  pendingInvites: PendingInvite[]
  onInviteEmailChange: (next: string) => void
  onSendInvite: (e: React.FormEvent) => void
  onCopyInviteUrl: () => void
}

export function FamilyInviteForm({
  inviteEmail,
  busy,
  lastInviteUrl,
  pendingInvites,
  onInviteEmailChange,
  onSendInvite,
  onCopyInviteUrl,
}: FamilyInviteFormProps) {
  const { t } = useTranslation()

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{t('family.inviteSomeone')}</h2>
      <p className="text-sm text-muted-foreground">{t('family.inviteHint')}</p>
      <form onSubmit={onSendInvite} className="flex max-w-md flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          required
          value={inviteEmail}
          onChange={(e) => onInviteEmailChange(e.target.value)}
          placeholder={t('auth.email')}
          className="flex-1"
        />
        <Button type="submit" disabled={busy}>
          {busy ? t('common.loading') : t('family.createInvite')}
        </Button>
      </form>

      {lastInviteUrl && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p className="mb-2 font-medium">{t('family.inviteLinkReady')}</p>
          <code className="mb-2 block break-all text-xs">{lastInviteUrl}</code>
          <Button type="button" variant="secondary" size="sm" onClick={onCopyInviteUrl}>
            {t('family.copyInviteLink')}
          </Button>
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">{t('family.pendingInvites')}</p>
          <ul className="text-sm text-muted-foreground">
            {pendingInvites.map((p) => (
              <li key={p.id}>
                {p.inviteeEmail} — {t('family.expires')} {new Date(p.expiresAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
