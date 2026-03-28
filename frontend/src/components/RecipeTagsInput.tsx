import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { XIcon } from 'lucide-react'

import { api } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
    const [draft, setDraft] = useState('')
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [inputFocused, setInputFocused] = useState(false)
    const [highlightIndex, setHighlightIndex] = useState(-1)
    const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const abortRef = useRef<AbortController | null>(null)

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
        setSuggestions([])
        setHighlightIndex(-1)
      },
      [onChange, tags]
    )

    useImperativeHandle(ref, () => ({
      commitPending() {
        const next = draft.trim()
        if (!next) {
          setSuggestions([])
          setHighlightIndex(-1)
          return tags
        }
        if (tags.includes(next)) {
          setDraft('')
          setSuggestions([])
          setHighlightIndex(-1)
          return tags
        }
        const merged = [...tags, next]
        onChange(merged)
        setDraft('')
        setSuggestions([])
        setHighlightIndex(-1)
        return merged
      },
    }))

    useEffect(() => {
      const q = draft.trim()
      if (!q) {
        setSuggestions([])
        setHighlightIndex(-1)
        return
      }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        abortRef.current?.abort()
        const ac = new AbortController()
        abortRef.current = ac
        api.recipes
          .tagSuggestions(q, { excludeRecipeId, signal: ac.signal })
          .then((list) => {
            setSuggestions(list)
            setHighlightIndex(list.length > 0 ? 0 : -1)
          })
          .catch((e) => {
            if ((e as Error).name === 'AbortError') return
            setSuggestions([])
            setHighlightIndex(-1)
          })
      }, 250)
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
      }
    }, [draft, excludeRecipeId])

    useEffect(
      () => () => {
        abortRef.current?.abort()
      },
      []
    )

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
        setSuggestions([])
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
          <Command shouldFilter={false} className="rounded-lg">
            <CommandList>
              <CommandGroup>
                {filtered.map((s, i) => (
                  <CommandItem
                    key={s}
                    value={s}
                    className={cn(i === highlightIndex && 'bg-muted')}
                    onMouseDown={(e) => e.preventDefault()}
                    onSelect={() => commitTag(s)}
                  >
                    {s}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )
  }
)

RecipeTagsInput.displayName = 'RecipeTagsInput'
