import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { parseKroner } from '@/lib/kroner'

type CompleteTripDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** How many items are about to move into the trip. */
  itemCount: number
  /** Finish the trip; `totalCost` is the kroner paid, or undefined when skipped. */
  onComplete: (totalCost?: number) => void
}

/**
 * The one question asked on "Shopping done": what did it come to? The receipt
 * is in hand at that moment and nowhere else, so it is asked here — but never
 * demanded. Skipping still completes the trip, and the amount can be added
 * later from the week's history.
 */
export function CompleteTripDialog({
  open,
  onOpenChange,
  itemCount,
  onComplete,
}: CompleteTripDialogProps) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState('')
  const [invalid, setInvalid] = useState(false)
  const fieldId = useId()

  const close = () => {
    setAmount('')
    setInvalid(false)
    onOpenChange(false)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const parsed = parseKroner(amount)
    if (parsed === null) {
      setInvalid(true)
      return
    }
    onComplete(parsed)
    close()
  }

  const skip = () => {
    onComplete()
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>{t('shoppingList.completeDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('shoppingList.completeDialog.description', { count: itemCount })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium">
              {t('shoppingList.completeDialog.amountLabel')}
            </label>
            <div className="relative">
              <Input
                id={fieldId}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setInvalid(false)
                }}
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="0"
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? `${fieldId}-error` : undefined}
                className="h-12 rounded-xl pr-12 text-lg tabular-nums"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted-foreground"
              >
                kr
              </span>
            </div>
            {invalid && (
              <p id={`${fieldId}-error`} role="alert" className="mt-1.5 text-sm text-destructive">
                {t('shoppingList.completeDialog.amountInvalid')}
              </p>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={skip} className="h-11 rounded-full px-5">
              {t('shoppingList.completeDialog.skip')}
            </Button>
            <Button type="submit" disabled={!amount.trim()} className="h-11 rounded-full px-6">
              {t('shoppingList.completeDialog.confirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
