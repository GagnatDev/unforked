import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type CheckboxFieldProps = {
  /** Rendered next to the box and used as the checkbox's accessible name. */
  label: ReactNode
  checked: boolean
  onCheckedChange: (next: boolean) => void
  disabled?: boolean
  className?: string
}

/**
 * An inline checkbox with its label — the shape used for one-off toggles
 * ("hide checked items", "keep screen awake", …). The label wraps the input so
 * the whole row is a hit target and `getByLabel(text)` finds the box.
 */
export function CheckboxField({
  label,
  checked,
  onCheckedChange,
  disabled,
  className,
}: CheckboxFieldProps) {
  return (
    <label className={cn('flex items-center gap-2 text-sm', className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      {label}
    </label>
  )
}
