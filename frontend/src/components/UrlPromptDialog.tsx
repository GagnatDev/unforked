import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type UrlPromptDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  urlFieldLabel: ReactNode
  urlPlaceholder?: string
  cancelLabel: string
  submitLabel: string
  submittingLabel: string
  /** Trimmed URL. Resolve to close and reset; reject to show `message` in the dialog. */
  onSubmitUrl: (url: string) => Promise<void>
  dialogContentClassName?: string
}

/**
 * Controlled dialog that collects a URL, runs an async action, and shows errors inline.
 * Reusable for import flows, “open external link” confirmations with URL entry, etc.
 */
export function UrlPromptDialog({
  open,
  onOpenChange,
  title,
  description,
  urlFieldLabel,
  urlPlaceholder,
  cancelLabel,
  submitLabel,
  submittingLabel,
  onSubmitUrl,
  dialogContentClassName,
}: UrlPromptDialogProps) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setUrl('')
    setError(null)
    setLoading(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const submit = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      await onSubmitUrl(trimmed)
      reset()
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn('sm:max-w-sm', dialogContentClassName)} showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description != null && description !== '' && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {error && <p className="text-sm text-destructive">{error}</p>}
          <label className="block text-sm font-medium">
            {urlFieldLabel}
            <Input
              type="url"
              placeholder={urlPlaceholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1"
              autoFocus
              disabled={loading}
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button type="submit" disabled={loading || !url.trim()}>
              {loading ? submittingLabel : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
