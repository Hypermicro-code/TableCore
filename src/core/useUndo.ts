import { useCallback, useRef, useState } from "react"
import type { Patch } from "./types"

/** Enkel lokal Undo/Redo per grid-instans */
export function useUndo() {
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const undoStack = useRef<Patch[]>([])
  const redoStack = useRef<Patch[]>([])

  const push = useCallback((p: Patch) => {
    undoStack.current.push(p)
    redoStack.current = []
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(false)
  }, [])

  const undo = useCallback((apply: (p: Patch) => void) => {
    const p = undoStack.current.pop()
    if (!p) return
    apply({ ...p, next: p.prev, prev: p.next })
    redoStack.current.push(p)
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }, [])

  const redo = useCallback((apply: (p: Patch) => void) => {
    const p = redoStack.current.pop()
    if (!p) return
    apply(p)
    undoStack.current.push(p)
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }, [])

  return { push, undo, redo, canUndo, canRedo }
}
