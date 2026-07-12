import { useCallback, useLayoutEffect, useRef } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * Textarea that grows with its content, so long text never needs inner
 * scrolling. The base Textarea's `field-sizing-content` class has no effect
 * here (Tailwind v3 doesn't ship that utility, and iOS Safari lacks the CSS
 * property), so the height is synced from scrollHeight instead.
 */
export function AutoGrowTextarea({
  className,
  value,
  ...props
}: React.ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    // +2 compensates for the top/bottom borders excluded from scrollHeight.
    el.style.height = `${el.scrollHeight + 2}px`
  }, [])

  useLayoutEffect(() => {
    resize()
  }, [resize, value])

  useLayoutEffect(() => {
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  return (
    <Textarea
      ref={ref}
      value={value}
      className={cn('resize-none overflow-hidden', className)}
      {...props}
    />
  )
}
