import { useState } from 'react'
import { isSameISOWeek } from 'date-fns'
import { enUS, nb } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { CalendarIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { formatWeekId } from '@/lib/format'
import { getCurrentWeekId } from '@/lib/utils'
import { mondayOfWeekId, weekIdFromDate } from '@/lib/week-id'

function dayPickerLocale(resolved: string) {
  return resolved.startsWith('nb') ? nb : enUS
}

export type WeekPickerProps = {
  value: string
  onChange: (weekId: string) => void
  locale: string
  id?: string
  disabled?: boolean
}

export function WeekPicker({ value, onChange, locale, id, disabled }: WeekPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const dpLocale = dayPickerLocale(locale)

  const monday = mondayOfWeekId(value)
  const displayWeekId = monday ? value : getCurrentWeekId()
  const label = formatWeekId(displayWeekId, locale)
  const selectedMonday = monday ?? mondayOfWeekId(getCurrentWeekId())!

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="min-w-[8rem] justify-start font-normal"
          >
            <CalendarIcon data-icon="inline-start" />
            {label}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <PopoverHeader className="sr-only">
          <PopoverTitle>{t('common.selectWeek')}</PopoverTitle>
        </PopoverHeader>
        <Calendar
          locale={dpLocale}
          mode="single"
          weekStartsOn={1}
          selected={selectedMonday}
          defaultMonth={selectedMonday}
          onSelect={(date) => {
            if (!date) return
            onChange(weekIdFromDate(date))
            setOpen(false)
          }}
          modifiers={{
            inSelectedWeek: (date) => isSameISOWeek(date, selectedMonday),
          }}
          modifiersClassNames={{
            inSelectedWeek: 'bg-muted',
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
