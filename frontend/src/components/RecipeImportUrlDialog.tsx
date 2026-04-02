import { useTranslation } from 'react-i18next'
import { UrlPromptDialog } from '@/components/UrlPromptDialog'
import { api } from '@/api'
import type { RecipeDoc } from '@/types'

export type RecipeImportUrlDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (result: { doc: RecipeDoc; warnings: string[] }) => void
}

export function RecipeImportUrlDialog({ open, onOpenChange, onImported }: RecipeImportUrlDialogProps) {
  const { t } = useTranslation()

  return (
    <UrlPromptDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('importRecipe.title')}
      description={t('importRecipe.subtitle')}
      urlFieldLabel={t('importRecipe.urlLabel')}
      urlPlaceholder={t('importRecipe.urlPlaceholder')}
      cancelLabel={t('common.cancel')}
      submitLabel={t('importRecipe.importCta')}
      submittingLabel={t('importRecipe.importing')}
      dialogContentClassName="sm:max-w-md"
      onSubmitUrl={async (url) => {
        const res = await api.recipes.importFromUrl(url)
        onImported({ doc: res.doc, warnings: res.warnings ?? [] })
      }}
    />
  )
}
