// src/TableCore.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { produce } from 'immer'
import type { Column, Row, Selection } from './types'
import { useClipboard } from './useClipboard'

export type TableCoreProps = {
  columns: Column[]
  rows: Row[]
  onRowsChange: (rows: Row[]) => void
  showSummaryRow?: boolean
  onSelectionChange?: (sel: Selection) => void
}

export function TableCore({
  columns,
  rows,
  onRowsChange,
  showSummaryRow,
  onSelectionChange,
}: TableCoreProps) {
  // Kolonner (drag + bredder)
  const [cols, setCols] = useState(columns)
  useEffect(() => setCols(columns), [columns])

  // Markering
  const [selState, _setSel] = useState<Selection>({ start: null, end: null })
  const setSel = (next: Selection | ((prev: Selection) => Selection)) => {
    if (typeof next === 'function') {
      _setSel(prev => {
        const resolved = (next as (p: Selection) => Selection)(prev)
        onSelectionChange?.(resolved)
        return resolved
      })
    } else {
      _setSel(next)
      onSelectionChange?.(next)
    }
  }
  const sel = selState

  // Clipboard
  const { onCopy, onPaste } = useClipboard(cols, rows, sel, onRowsChange)
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => onCopy(e)
    const handlePaste = (e: ClipboardEvent) => onPaste(e)
    document.addEventListener('copy', handleCopy)
    document.addEventListener('paste', handlePaste)
    return () => {
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('paste', handlePaste)
    }
  }, [onCopy, onPaste])

  // Wrapper for tastatur-fokus
  const wrapRef = useRef<HTMLDivElement>(null)

  // Pekersporing (for å skille klikk vs drag)
  const dragInfo = useRef<{ dragging: boolean; anchorR: number; anchorC: number; startX: number; startY: number } | null>(null)
  useEffect(() => {
    const onUp = () => { if (dragInfo.current) dragInfo.current.dragging = false }
    document.addEventListener('pointerup', onUp, true)
    return () => document.removeEventListener('pointerup', onUp, true)
  }, [])

  // Input-referanser (for fokus/navigasjon)
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const keyOf = (r: number, c: number) => `${r}:${c}`
  function focusCell(r: number, c: number, selectText = false) {
    const el = inputRefs.current.get(keyOf(r, c))
    if (el) {
      el.focus()
      if (selectText) {
        // Velg hele innholdet ved dobbeltklikk / Enter
        el.select?.()
      }
    } else {
      // Fallback – sett wrapper fokus så piltaster virker
      wrapRef.current?.focus()
    }
  }

  // Drag refs for rekkefølge
  const dragRow = useRef<number | null>(null)
  const dragCol = useRef<number | null>(null)

  // Summeringer (number-kolonner)
  const summary = useMemo(() => {
    const sums: Record<string, number> = {}
    for (const col of cols) if (col.type === 'number') sums[col.id] = 0
    for (const r of rows) {
      for (const col of cols) {
        if (col.type === 'number') {
          const v = parseFloat(r.cells[col.id] ?? '')
          if (!isNaN(v)) sums[col.id] += v
        }
      }
    }
    return sums
  }, [rows, cols])

  // ── Hjelpere for nivå ─────────────────────────────────────────────────────
  function rowHasData(r: Row) {
    return Object.values(r.cells).some(v => (v ?? '').toString().trim().length > 0)
  }
  function isRowEmpty(r: Row) {
    return !rowHasData(r)
  }
  function setCell(r: number, c: number, value: string) {
    onRowsChange(produce(rows, draft => { draft[r].cells[cols[c].id] = value }))
  }
  function clampAllowedLevel(index: number, desired: number) {
    if (index === 0) return 0
    const prev = rows[index - 1]
    const maxLevel = (prev?.level ?? 0) + 1
    return Math.max(0, Math.min(desired, maxLevel))
  }
  function ensureDefaultLevel(index: number) {
    if (index <= 0) return
    const current = rows[index]
    if (!current) return
    if (!isRowEmpty(current)) return
    const prevLevel = rows[index - 1]?.level ?? 0
    if (current.level !== prevLevel) {
      onRowsChange(produce(rows, draft => {
        draft[index].level = prevLevel
      }))
    }
  }
  function changeLevel(r: number, delta: number) {
    onRowsChange(produce(rows, draft => {
      const cur = draft[r].level
      const desired = cur + delta
      const clamped = clampAllowedLevel(r, desired)
      draft[r].level = clamped
    }))
  }

  // Global Alt+Pil for innrykk/utrykk (kun i første data-kolonne)
  useEffect(() => {
    const handleAltArrows = (e: KeyboardEvent) => {
      if (!sel.start) return
      if (sel.start.c !== 0) return
      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const delta = e.key === 'ArrowRight' ? +1 : -1
        changeLevel(sel.start.r, delta)
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('keydown', handleAltArrows, true)
    return () => document.removeEventListener('keydown', handleAltArrows, true)
  }, [sel])

  // Markering – er cellen innenfor utvalget?
  function isSelectedCell(r: number, c: number) {
    if (!sel.start || !sel.end) return false
    const r0 = Math.min(sel.start.r, sel.end.r)
    const r1 = Math.max(sel.start.r, sel.end.r)
    const c0 = Math.min(sel.start.c, sel.end.c)
    const c1 = Math.max(sel.start.c, sel.end.c)
    return r >= r0 && r <= r1 && c >= c0 && c <= c1
  }

  // ── Celle-interaksjon (klikk/drag/dblklikk) ──────────────────────────────
  function onCellPointerDown(e: React.PointerEvent, r: number, c: number) {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    wrapRef.current?.focus() // vi vil fange tastene
    ensureDefaultLevel(r)

    dragInfo.current = { dragging: true, anchorR: r, anchorC: c, startX: e.clientX, startY: e.clientY }
    setSel({ start: { r, c }, end: { r, c } })
  }

  function onCellPointerMove(e: React.PointerEvent, r: number, c: number) {
    const di = dragInfo.current
    if (!di || !di.dragging) return
    // Er vi i drag? (threshold 3 px)
    const moved = Math.abs(e.clientX - di.startX) > 3 || Math.abs(e.clientY - di.startY) > 3
    if (!moved) return
    // Oppdater utvalg mens vi drar
    setSel(prev => ({ start: prev.start ?? { r, c }, end: { r, c } }))
  }

  function onCellPointerUp(e: React.PointerEvent, r: number, c: number) {
    const di = dragInfo.current
    const wasDragging = !!di?.dragging
    dragInfo.current = null

    // Hvis vi ikke egentlig dro, regnes dette som et klikk ⇒ fokuser input i cellen
    if (!wasDragging) {
      focusCell(r, c, false)
    }
  }

  function onCellDoubleClick(r: number, c: number) {
    // Dobbeltklikk ⇒ åpne input og marker hele teksten
    focusCell(r, c, true)
  }

  // ── Tastatur-navigasjon (når fokus IKKE er inne i en input) ──────────────
  function onKeyDown(e: React.KeyboardEvent) {
    // Hvis fokus står i en input, la inputen håndtere piltaster/skriving selv
    const ae = document.activeElement as HTMLElement | null
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return

    if (!sel.start) return
    const { r, c } = sel.start

    // Enter = fokuser input i aktiv celle
    if (e.key === 'Enter') { focusCell(r, c, true); e.preventDefault(); return }

    // Tab / Shift+Tab = neste/forrige kolonne + fokuser input
    if (e.key === 'Tab') {
      const nc = Math.min(Math.max(c + (e.shiftKey ? -1 : 1), 0), cols.length - 1)
      setSel({ start: { r, c: nc }, end: null })
      focusCell(r, nc, false)
      e.preventDefault()
      return
    }

    // Piltaster flytter aktiv celle og fokuserer input
    if (e.key === 'ArrowDown') {
      const nr = Math.min(r + 1, rows.length - 1)
      setSel({ start: { r: nr, c }, end: null })
      ensureDefaultLevel(nr)
      focusCell(nr, c)
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowUp') {
      const nr = Math.max(r - 1, 0)
      setSel({ start: { r: nr, c }, end: null })
      ensureDefaultLevel(nr)
      focusCell(nr, c)
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowRight') {
      const nc = Math.min(c + 1, cols.length - 1)
      setSel({ start: { r, c: nc }, end: null })
      focusCell(r, nc)
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowLeft') {
      const nc = Math.max(c - 1, 0)
      setSel({ start: { r, c: nc }, end: null })
      focusCell(r, nc)
      e.preventDefault()
      return
    }

    // Innrykk/utrykk via tast (som før)
    if ((e.ctrlKey || e.metaKey) && e.key === ']') { changeLevel(r, +1); e.preventDefault(); return }
    if ((e.ctrlKey || e.metaKey) && e.key === '[') { changeLevel(r, -1); e.preventDefault(); return }
  }

  // ── Drag & drop – rader ───────────────────────────────────────────────────
  function onRowGripDown(index: number) { dragRow.current = index }
  function onRowOver(e: React.DragEvent<HTMLDivElement>) { e.preventDefault() }
  function onRowDrop(e: React.DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault()
    if (dragRow.current == null) return
    const from = dragRow.current
    const to = index
    if (from === to) return
    onRowsChange(produce(rows, draft => {
      const [m] = draft.splice(from, 1)
      draft.splice(to, 0, m)
    }))
    dragRow.current = null
  }

  // ── Drag & drop – kolonner ────────────────────────────────────────────────
  function onColGripDown(index: number) { dragCol.current = index }
  function onColOver(e: React.DragEvent<HTMLDivElement>) { e.preventDefault() }
  function onColDrop(e: React.DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault()
    if (dragCol.current == null) return
    const from = dragCol.current
    const to = index
    if (from === to) return
    setCols(prev => produce(prev, draft => {
      const [m] = draft.splice(from, 1)
      draft.splice(to, 0, m)
    }))
    dragCol.current = null
  }

  // Kolonnemal
  const gridTemplate = useMemo(() =>
    ['52px', ...cols.map(c => (c.width ?? 160) + 'px')].join(' '),
  [cols])

  return (
    <div className="tc-wrap" ref={wrapRef} onKeyDown={onKeyDown} tabIndex={0}>
      {/* Header */}
      <div className="tc tc-header" style={{ gridTemplateColumns: gridTemplate }}>
        <div className="tc-col-header tc-index">#</div>
        {cols.map((c, i) => (
          <div
            key={c.id}
            className={clsx('tc-col-header')}
            draggable
            onDragOver={onColOver}
            onDrop={(e) => onColDrop(e, i)}
          >
            <span title="Dra for å flytte kolonne" className="tc-col-grip" draggable onDragStart={() => onColGripDown(i)}>⋮⋮</span>
            <span>{c.title}</span>
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="tc">
        {rows.map((row, r) => (
          <div
            key={row.id}
            className={clsx('tc-row')}
            style={{ gridTemplateColumns: gridTemplate }}
            draggable
            onDragOver={onRowOver}
            onDrop={(e) => onRowDrop(e, r)}
          >
            <div className="tc-cell tc-index">
              <span title="Dra for å flytte rad" className="tc-row-grip" draggable onDragStart={() => onRowGripDown(r)}>⋮⋮</span>
              {rowHasData(row) ? r + 1 : ''}
            </div>

            {cols.map((c, colIdx) => {
              const val = row.cells[c.id] ?? ''
              const numeric = c.type === 'number'
              const selected = isSelectedCell(r, colIdx)
              const refKey = keyOf(r, colIdx)

              return (
                <div
                  key={c.id}
                  className={clsx('tc-cell', numeric && 'numeric', selected && 'selected')}
                  onPointerDown={(e) => onCellPointerDown(e, r, colIdx)}
                  onPointerMove={(e) => onCellPointerMove(e, r, colIdx)}
                  onPointerUp={(e) => onCellPointerUp(e, r, colIdx)}
                  onDoubleClick={() => onCellDoubleClick(r, colIdx)}
                >
                  {/* Innrykk indikator i første data-kolonne */}
                  {colIdx === 0 && (
                    <>
                      {Array.from({ length: row.level }).map((_, i) => <span key={i} className="tc-indent" />)}
                      {row.level > 0 && <span className="tc-level-bullet" />}
                    </>
                  )}

                  {/* Editor-input */}
                  {c.type === 'color' ? (
                    <input
                      ref={el => el && inputRefs.current.set(refKey, el)}
                      type="color"
                      value={val || '#9ca3af'}
                      onChange={e => setCell(r, colIdx, e.target.value)}
                    />
                  ) : c.type === 'date' ? (
                    <input
                      ref={el => el && inputRefs.current.set(refKey, el)}
                      type="date"
                      value={val}
                      onChange={e => setCell(r, colIdx, e.target.value)}
                    />
                  ) : c.type === 'number' ? (
                    <input
                      ref={el => el && inputRefs.current.set(refKey, el)}
                      type="text"
                      inputMode="decimal"
                      value={val}
                      onChange={e => setCell(r, colIdx, e.target.value)}
                    />
                  ) : (
                    <input
                      ref={el => el && inputRefs.current.set(refKey, el)}
                      type="text"
                      value={val}
                      onChange={e => setCell(r, colIdx, e.target.value)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {showSummaryRow && (
          <div className={clsx('tc-row tc-summary')} style={{ gridTemplateColumns: gridTemplate }}>
            <div className="tc-cell tc-index">Σ</div>
            {cols.map(c => (
              <div key={c.id} className={clsx('tc-cell', c.type === 'number' && 'numeric')}>
                {c.type === 'number' ? (summary[c.id] ?? 0).toLocaleString() : ''}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
