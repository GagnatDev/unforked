import { ChevronLeftIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

type BackLinkProps = {
  to: string
  label: string
}

/**
 * The way back out of a settings page. Installed as a PWA there is no browser
 * chrome, so a screen reached from Profile has to carry its own return path.
 * Quiet on purpose: it is furniture, not an action, so it takes no green.
 */
export function BackLink({ to, label }: BackLinkProps) {
  return (
    <Link
      to={to}
      className="-ml-1 inline-flex min-h-11 items-center gap-1 pr-2 pl-1 text-sm font-medium text-muted-foreground no-underline transition-colors hover:text-foreground hover:no-underline"
    >
      <ChevronLeftIcon className="size-4 shrink-0" />
      {label}
    </Link>
  )
}
