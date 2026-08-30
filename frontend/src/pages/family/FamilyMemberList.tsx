import { useTranslation } from 'react-i18next'

type FamilyMemberListProps = {
  members: { id: string; email: string }[]
}

export function FamilyMemberList({ members }: FamilyMemberListProps) {
  const { t } = useTranslation()

  return (
    <section className="rounded-2xl bg-card p-1.5 text-card-foreground">
      <h2 className="px-3 pt-2.5 pb-1.5 text-base font-semibold">{t('family.members')}</h2>
      <ul className="m-0 list-none p-0">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex min-h-12 items-center px-3 break-all not-last:border-b not-last:border-border/60"
          >
            {m.email}
          </li>
        ))}
      </ul>
    </section>
  )
}
