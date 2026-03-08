import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en.json'
import nb from './locales/nb.json'

const supportedLngs = ['en', 'nb'] as const

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    supportedLngs: [...supportedLngs],
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    resources: {
      en: { translation: en },
      nb: { translation: nb },
    },
  })

const updateDocLang = (lng: string) => {
  document.documentElement.lang = lng.startsWith('nb') ? 'nb' : 'en'
}
i18n.on('initialized', () => updateDocLang(i18n.language))
i18n.on('languageChanged', updateDocLang)

export default i18n
