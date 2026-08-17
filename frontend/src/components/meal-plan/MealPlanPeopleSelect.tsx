import { useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { PEOPLE_OPTIONS } from './constants'

/**
 * Head-count picker: the fixed {@link PEOPLE_OPTIONS} range plus an entry that
 * clears the value. A stored count outside the range (an older plan, a family
 * default set elsewhere) is offered as an extra option so opening the dropdown
 * can never silently drop it.
 */
export function MealPlanPeopleSelect({
  id,
  value,
  onValueChange,
  ariaLabel,
  emptyLabel,
  disabled,
  className,
  icon,
}: {
  id?: string
  value: number | null
  onValueChange: (persons: number | null) => void
  ariaLabel: string
  /** Label of the entry that leaves the count unset. */
  emptyLabel: string
  disabled?: boolean
  className?: string
  icon?: ReactNode
}) {
  const counts = useMemo(() => {
    const all: number[] = [...PEOPLE_OPTIONS]
    if (value != null && !all.includes(value)) all.push(value)
    return all.sort((a, b) => a - b)
  }, [value])

  // `items` lets the trigger render a selected value's label without the popup
  // being mounted (see MealPlanRecipeSelect).
  const items = useMemo(
    () => [
      { value: '', label: emptyLabel },
      ...counts.map((n) => ({ value: String(n), label: String(n) })),
    ],
    [counts, emptyLabel],
  )

  return (
    <Select
      items={items}
      value={value == null ? '' : String(value)}
      disabled={disabled}
      onValueChange={(next: string | null) =>
        onValueChange(next ? Number(next) : null)
      }
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn('w-full', className)}
      >
        {icon}
        <SelectValue placeholder={emptyLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="">{emptyLabel}</SelectItem>
          {counts.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
