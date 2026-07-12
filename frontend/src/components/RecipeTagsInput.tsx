import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTagSuggestions } from '@/hooks/useTagSuggestions'
import { cn } from '@/lib/utils'

export type RecipeTagsInputHandle = {
  /** Returns tags including any non-empty draft committed as a single tag. */
  commitPending: () => string[]
}

export type RecipeTagsInputProps = {
  id: string
  tags: string[]
  onChange: (tags: string[]) => void
  excludeRecipeId?: string
}

export const RecipeTagsInput = forwardRef<RecipeTagsInputHandle, RecipeTagsInputProps>(
  function RecipeTagsInput({ id, tags, onChange, excludeRecipeId }, ref) {
    const { t } = useTranslation()
    const listboxId = useId()
    const [draft, setDraft] = useState('')
    const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)
    const [inputFocused, setInputFocused] = useState(false)
    const [highlightIndex, setHighlightIndex] = useState(-1)
    const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const { suggestions: apiSuggestions } = useTagSuggestions(draft, { excludeRecipeId })

    useEffect(() => {
      setSuggestionsDismissed(false)
    }, [draft])

    const suggestions = suggestionsDismissed ? [] : apiSuggestions

    const filtered = useMemo(
      () => suggestions.filter((s) => !tags.includes(s)),
      [suggestions, tags]
    )

    useEffect(() => {
      const len = filtered.length
      setHighlightIndex((prev) => {
        if (len === 0) return -1
        if (prev < 0) return 0
        if (prev >= len) return len - 1
        return prev
      })
    }, [filtered])

    const commitTag = useCallback(
      (raw: string) => {
        const next = raw.trim()
        if (!next || tags.includes(next)) return
        onChange([...tags, next])
        setDraft('')
        setHighlightIndex(-1)
      },
      [onChange, tags]
    )

    useImperativeHandle(ref, () => ({
      commitPending() {
        const next = draft.trim()
        if (!next) {
          setHighlightIndex(-1)
          return tags
        }
        if (tags.includes(next)) {
          setDraft('')
          setHighlightIndex(-1)
          return tags
        }
        const merged = [...tags, next]
        onChange(merged)
        setDraft('')
        setHighlightIndex(-1)
        return merged
      },
    }))

    const clearBlurTimeout = () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
        blurTimeoutRef.current = null
      }
    }

    const showPopover =
      inputFocused && draft.trim().length > 0 && filtered.length > 0

    const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightIndex >= 0 && filtered[highlightIndex]) {
          commitTag(filtered[highlightIndex])
        } else {
          commitTag(draft)
        }
        return
      }
      if (e.key === ',' && draft.trim()) {
        e.preventDefault()
        commitTag(draft)
        return
      }
      if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
        e.preventDefault()
        onChange(tags.slice(0, -1))
        return
      }
      if (e.key === 'ArrowDown' && filtered.length > 0) {
        e.preventDefault()
        setHighlightIndex((i) => {
          const next = i < 0 ? 0 : (i + 1) % filtered.length
          return next
        })
        return
      }
      if (e.key === 'ArrowUp' && filtered.length > 0) {
        e.preventDefault()
        setHighlightIndex((i) => {
          if (i < 0) return filtered.length - 1
          return (i - 1 + filtered.length) % filtered.length
        })
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSuggestionsDismissed(true)
        setHighlightIndex(-1)
      }
    }

    return (
      <Popover
        open={showPopover}
        onOpenChange={(next) => {
          if (!next) {
            clearBlurTimeout()
            setInputFocused(false)
          }
        }}
      >
        <PopoverTrigger
          nativeButton={false}
          render={
            <div
              className={cn(
                'mt-1 flex min-h-9 w-full flex-wrap items-center gap-2 rounded-md border-2 border-input bg-background px-2 py-1.5',
                'has-[:focus-visible]:border-ring has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/30 has-[:focus-visible]:ring-offset-2'
              )}
            >
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="flex max-w-full items-center gap-1 py-0 pr-0.5"
                >
                  <span className="truncate">{tag}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0"
                    aria-label={t('recipeForm.removeTagAria', { tag })}
                    onClick={() => onChange(tags.filter((x) => x !== tag))}
                  >
                    <XIcon />
                  </Button>
                </Badge>
              ))}
              <Input
                id={id}
                type="text"
                autoCapitalize="none"
                role="combobox"
                aria-expanded={showPopover}
                aria-haspopup="listbox"
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={
                  showPopover && highlightIndex >= 0
                    ? `${listboxId}-opt-${highlightIndex}`
                    : undefined
                }
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onInputKeyDown}
                onFocus={() => {
                  clearBlurTimeout()
                  setInputFocused(true)
                }}
                onBlur={() => {
                  clearBlurTimeout()
                  blurTimeoutRef.current = setTimeout(() => setInputFocused(false), 150)
                }}
                placeholder={t('recipeForm.tagsPlaceholder')}
                className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
              />
            </div>
          }
        />
        <PopoverContent
          className="min-w-[12rem] p-0"
          align="start"
          sideOffset={4}
          initialFocus={false}
        >
          <div
            id={listboxId}
            role="listbox"
            aria-label={t('recipeForm.tagSuggestionsAria')}
            className="no-scrollbar max-h-72 overflow-y-auto overflow-x-hidden rounded-lg p-1 outline-none"
          >
            {filtered.map((s, i) => (
              <button
                key={s}
                type="button"
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === highlightIndex}
                className={cn(
                  'relative flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none select-none',
                  i === highlightIndex ? 'bg-muted text-foreground' : 'text-foreground'
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitTag(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    )
  }
)

RecipeTagsInput.displayName = 'RecipeTagsInput'
