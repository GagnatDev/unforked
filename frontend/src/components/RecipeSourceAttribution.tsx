import { useTranslation } from 'react-i18next'
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
}

/** Read-only source name / URL block for recipe forms and detail views. */
export function RecipeSourceAttribution({
  sourceUrl,
  sourceName,
  className,
}: RecipeSourceAttributionProps) {
  const { t } = useTranslation()
  const sourceUrlRaw = sourceUrl?.trim() ?? ''
  const sourceUrlHref = sourceUrlRaw.length > 0 ? safeHttpUrl(sourceUrlRaw) : null
  const sourceNameRaw = sourceName?.trim() ?? ''

  if (!sourceUrlRaw && !sourceNameRaw) return null

  return (
    <div
      className={cn(
        'mb-4 space-y-1.5 border-l-2 border-border/60 pl-3 text-sm text-muted-foreground',
        className
      )}
    >
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
}
