import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/hooks/useLocale'
import { formatIsoDateTime } from '@/lib/format'

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
  const locale = useLocale()

  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 text-card-foreground">
      <div>
        <h2 className="text-base font-semibold">{t('family.inviteSomeone')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('family.inviteHint')}</p>
      </div>
      <form onSubmit={onSendInvite} className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          required
          value={inviteEmail}
          onChange={(e) => onInviteEmailChange(e.target.value)}
          placeholder={t('auth.email')}
          className="h-11 flex-1 rounded-xl"
        />
        <Button type="submit" disabled={busy} className="h-11 shrink-0 rounded-full px-5">
          {busy ? t('common.loading') : t('family.createInvite')}
        </Button>
      </form>

      {/* The link just came into existence and has to leave with you: tinted,
          like every other "this has happened" surface in the app. */}
      {lastInviteUrl && (
        <div className="space-y-2 rounded-xl bg-accent p-3 text-accent-foreground">
          <p className="text-sm font-medium">{t('family.inviteLinkReady')}</p>
          <code className="block rounded-lg bg-card px-3 py-2 text-xs break-all text-card-foreground">
            {lastInviteUrl}
          </code>
          <Button
            type="button"
            variant="secondary"
            onClick={onCopyInviteUrl}
            className="h-11 rounded-full px-4"
          >
            {t('family.copyInviteLink')}
          </Button>
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div>
          <p className="mb-0.5 text-sm font-medium">{t('family.pendingInvites')}</p>
          <ul className="m-0 list-none p-0">
            {pendingInvites.map((p) => (
              <li
                key={p.id}
                className="flex min-h-11 flex-wrap items-center gap-x-2 py-1.5 text-sm not-last:border-b not-last:border-border/60"
              >
                <span className="break-all">{p.inviteeEmail}</span>
                <span className="text-muted-foreground">
                  {t('family.expires')} {formatIsoDateTime(p.expiresAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
