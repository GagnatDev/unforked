import { useTranslation } from 'react-i18next'
import { ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Returns href for `<a>` or null if not a safe http(s) URL. */
function safeHttpUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href
    return null
  } catch {
    return null
  }
}

export type RecipeSourceAttributionProps = {
  sourceUrl?: string | null
  sourceName?: string | null
  className?: string
  /** Render collapsed behind a summary row; expands on tap. */
  collapsible?: boolean
}

/** Read-only source name / URL block for recipe forms and detail views. */
export function RecipeSourceAttribution({
  sourceUrl,
  sourceName,
  className,
  collapsible = false,
}: RecipeSourceAttributionProps) {
  const { t } = useTranslation()
  const sourceUrlRaw = sourceUrl?.trim() ?? ''
  const sourceUrlHref = sourceUrlRaw.length > 0 ? safeHttpUrl(sourceUrlRaw) : null
  const sourceNameRaw = sourceName?.trim() ?? ''

  if (!sourceUrlRaw && !sourceNameRaw) return null

  const body = (
    <div className="space-y-1.5 border-l-2 border-border/60 pl-3 text-sm text-muted-foreground">
      {sourceNameRaw && (
        <p className="leading-snug">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
            {t('recipeForm.sourceName')}
          </span>
          <span className="ml-1.5">{sourceNameRaw}</span>
        </p>
      )}
      {sourceUrlRaw && (
        <p className="leading-snug">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
            {t('recipeForm.sourceUrl')}
          </span>
          <span className="ml-1.5 inline-block break-all">
            {sourceUrlHref ? (
              <a
                href={sourceUrlHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/40"
              >
                {sourceUrlRaw}
              </a>
            ) : (
              sourceUrlRaw
            )}
          </span>
        </p>
      )}
    </div>
  )

  if (!collapsible) return <div className={cn('mb-4', className)}>{body}</div>

  const preview =
    sourceNameRaw ||
    (sourceUrlHref ? new URL(sourceUrlHref).host : sourceUrlRaw)

  return (
    <details className={cn('group mb-4', className)}>
      <summary className="flex min-w-0 cursor-pointer list-none select-none items-center gap-1.5 py-1 text-sm font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-4 shrink-0 transition-transform group-open:rotate-90" />
        {t('recipeForm.sourceName')}
        <span className="min-w-0 truncate font-normal text-muted-foreground/70 group-open:hidden">
          · {preview}
        </span>
      </summary>
      <div className="mt-2">{body}</div>
    </details>
  )
}
