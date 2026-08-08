import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Trash2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Width of the revealed delete panel, in px — a comfortable thumb target. */
const ACTION_WIDTH = 80
/** Pointer travel before a drag counts as a swipe rather than a scroll. */
const AXIS_LOCK_PX = 8
/** How much of the panel must be revealed for the row to stay open on release. */
const SNAP_OPEN_RATIO = 0.4

/**
 * Only one row may sit open at a time: opening a row closes whichever was open
 * before, so a stray red panel never lingers further up the list.
 */
let closeOpenRow: (() => void) | null = null

function claimOpenRow(close: () => void) {
  if (closeOpenRow && closeOpenRow !== close) closeOpenRow()
  closeOpenRow = close
}

function releaseOpenRow(close: () => void) {
  if (closeOpenRow === close) closeOpenRow = null
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

type SwipeToDeleteProps = {
  /** Runs when the revealed trash button is pressed — this *is* the confirmation. */
  onDelete: () => void
  /** Accessible name for the trash button, e.g. "Delete Lasagne". */
  deleteLabel: string
  /** Render the row without the gesture (nothing to delete here). */
  disabled?: boolean
  /** Classes for the clipping wrapper; the row's own styling belongs on `children`. */
  className?: string
  children: ReactNode
}

/**
 * Wraps a list row in the swipe-to-delete gesture: drag the row to the left and
 * a red trash panel is revealed underneath, which must then be pressed to
 * actually delete. Two deliberate actions replace the old confirm dialog, and
 * nothing destructive is ever one stray tap away.
 *
 * The gesture is touch-first but not touch-only — the trash button stays in the
 * DOM and opens the row when it takes keyboard focus, so tabbing to it works
 * the same as swiping. Vertical drags are left to the browser (`touch-action:
 * pan-y` plus an axis lock) so scrolling a long list never peels rows open.
 */
export function SwipeToDelete({
  onDelete,
  deleteLabel,
  disabled = false,
  className,
  children,
}: SwipeToDeleteProps) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; offset: number } | null>(null)
  const axis = useRef<'undecided' | 'horizontal'>('undecided')
  // A swipe ends with a click on the row; that click must not also activate it.
  const swallowClick = useRef(false)

  const close = useCallback(() => setOffset(0), [])
  const open = useCallback(() => setOffset(ACTION_WIDTH), [])

  const isOpen = offset > 0
  useEffect(() => {
    if (!isOpen) return
    claimOpenRow(close)
    return () => releaseOpenRow(close)
  }, [isOpen, close])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      swallowClick.current = false
      if (disabled) return
      // Ignore right/middle clicks and any secondary pointer mid-gesture.
      if (event.button != null && event.button !== 0) return
      drag.current = { x: event.clientX, y: event.clientY, offset }
      axis.current = 'undecided'
    },
    [disabled, offset],
  )

  const onPointerMove = useCallback((event: ReactPointerEvent) => {
    const start = drag.current
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y

    if (axis.current === 'undecided') {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      // A mostly-vertical drag is the browser's to scroll with; let it go.
      if (Math.abs(dy) >= Math.abs(dx)) {
        drag.current = null
        return
      }
      axis.current = 'horizontal'
      setDragging(true)
      const target = event.currentTarget as HTMLElement
      try {
        target.setPointerCapture?.(event.pointerId)
      } catch {
        // Pointer capture is a nicety; the gesture works without it.
      }
    }

    setOffset(clamp(start.offset - dx, 0, ACTION_WIDTH))
  }, [])

  const endDrag = useCallback((event: ReactPointerEvent) => {
    const wasHorizontal = axis.current === 'horizontal'
    drag.current = null
    axis.current = 'undecided'
    if (!wasHorizontal) return

    const target = event.currentTarget as HTMLElement
    try {
      target.releasePointerCapture?.(event.pointerId)
    } catch {
      // Already released (or never captured) — nothing to undo.
    }
    setDragging(false)
    setOffset((current) => (current >= ACTION_WIDTH * SNAP_OPEN_RATIO ? ACTION_WIDTH : 0))
    swallowClick.current = true
  }, [])

  const onClickCapture = useCallback(
    (event: ReactMouseEvent) => {
      if (swallowClick.current) {
        swallowClick.current = false
        event.preventDefault()
        event.stopPropagation()
        return
      }
      // While the panel is showing, a tap on the row puts it away again rather
      // than opening the recipe / ticking the item off.
      if (isOpen) {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
    },
    [isOpen, close],
  )

  if (disabled) {
    return <div className={className}>{children}</div>
  }

  return (
    <div
      className={cn('relative overflow-hidden rounded-lg', className)}
      data-swipe-state={isOpen ? 'open' : 'closed'}
    >
      <button
        type="button"
        aria-label={deleteLabel}
        onClick={onDelete}
        onFocus={open}
        onBlur={close}
        style={{ width: ACTION_WIDTH }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-destructive text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Trash2Icon className="size-5" aria-hidden="true" />
      </button>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        style={{ transform: `translate3d(${-offset}px, 0, 0)` }}
        className={cn(
          'relative touch-pan-y',
          !dragging && 'transition-transform duration-200',
          // Square off the edge that meets the red panel, so the row reads as
          // sliding over it rather than floating on top of it.
          isOpen && '[&>*]:rounded-r-none',
        )}
      >
        {children}
      </div>
    </div>
  )
}
