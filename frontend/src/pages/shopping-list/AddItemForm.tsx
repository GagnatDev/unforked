import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type AddItemFormProps = {
  onAdd: (name: string) => Promise<boolean>
  adding: boolean
}

/** Free-form "add item" input for things no recipe asked for (coffee, soap, …). */
export function AddItemForm({ onAdd, adding }: AddItemFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || adding) return
    if (await onAdd(trimmed)) setName('')
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('shoppingList.addItemPlaceholder')}
        aria-label={t('shoppingList.addItem')}
        className="h-11 flex-1"
      />
      <Button type="submit" size="lg" className="h-11" disabled={adding || !name.trim()}>
        <PlusIcon data-icon="inline-start" />
        {t('shoppingList.addItem')}
      </Button>
    </form>
  )
}
