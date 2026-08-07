import { useTranslation } from 'react-i18next'

/**
 * The BCP 47 locale to format dates and numbers with — the language i18next
 * actually resolved, falling back to the requested one before detection
 * settles. Pass it to the `lib/format` helpers.
 */
export function useLocale(): string {
  const { i18n } = useTranslation()
  return i18n.resolvedLanguage ?? i18n.language
}
