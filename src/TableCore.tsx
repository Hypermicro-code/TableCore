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
}

export function TableCore({ columns, rows, onRowsChange, showSummaryRow }: TableCoreProps) {
  // Kolonnemal (drag + bredde)
  const [cols, setCols] = useState(columns)
  useEffect(() => setCols(columns), [columns])

  // Markering
  const [sel, setSel] = useState<Selection>({ start: null, end: null })

  // Clipboard hook MÅ kalles på toppnivå
  const { onCopy, onPaste } = useClipboard(cols, rows, sel, onRowsChange)

  // Globalt copy/paste
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

    // Global Alt+Arrow for innrykk/utrykk når vi står i første data-kolonne (c===0).
  useEffect(() => {
    const handleAltArrows = (e: KeyboardEvent) => {
      if (!sel.start) return;
      // Bare når vi er i første data-kolonne (ikke #)
      if (sel.start.c !== 0) return;

      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const delta = e.key === 'ArrowRight' ? +1 : -1;
        changeLevel(sel.start.r, delta);
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', handleAltArrows, { capture: true });
    return () => document.removeEventListener('keydown', handleAltArrows, { capture: true } as any);
  }, [sel, rows, cols]); // changeLevel/rows brukes; trygg å ha i deps

  // Drag refs
  const dragRow = useRef<number | null>(null)
  const dragCol = useRef<number | null>(null)

  const [editing, setEditing] = useState<{ r: number; c: number } | null>(null)

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

  // Hjelpere
  function rowHasData(r: Row) {
    return Object.values(r.cells).some(v => (v ?? '').toString().trim().length > 0)
  }
  function setCell(r: number, c: number, value: string) {
    onRowsChange(produce(rows, draft => { draft[r].cells[cols[c].id] = value }))
  }

  // Celle-interaksjon
  function onCellPointerDown(e: React.PointerEvent, r: number, c: number) {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    setSel({ start: { r, c }, end: { r, c } })
  }
  function onCellPointerEnter(_e: React.PointerEvent, r: number, c: number) {
    if (sel.start) setSel(s => ({ ...s, end: { r, c } }))
  }
  function onCellDoubleClick(r: number, c: number) {
    setEditing({ r, c })
  }

  // Tastatur
 function onKeyDown(e: React.KeyboardEvent) {
  if (!sel.start) return
  const { r, c } = sel.start

  // Redigering: Enter åpner editor (vi bruker contentEditable, så Enter=commit)
  if (e.key === 'Enter') { setEditing({ r, c }); e.preventDefault() }

  // Navigasjon mellom celler
  if (e.key === 'Tab') {
    setSel({
      start: { r, c: Math.min(c + (e.shiftKey ? -1 : 1), cols.length - 1) },
      end: null
    })
    e.preventDefault()
    return
  }
  if (e.key === 'ArrowDown') { setSel({ start: { r: Math.min(r + 1, rows.length - 1), c }, end: null }); e.preventDefault(); return }
  if (e.key === 'ArrowUp')   { setSel({ start: { r: Math.max(r - 1, 0), c }, end: null }); e.preventDefault(); return }
  if (e.key === 'ArrowRight'){ setSel({ start: { r, c: Math.min(c + 1, cols.length - 1) }, end: null }); e.preventDefault(); return }
  if (e.key === 'ArrowLeft') { setSel({ start: { r, c: Math.max(c - 1, 0) }, end: null }); e.preventDefault(); return }

  // Innrykk / utrykk – to varianter:
  // a) Ctrl/Cmd + ] / [
  if ((e.ctrlKey || e.metaKey) && e.key === ']') { changeLevel(r, +1); e.preventDefault(); return }
  if ((e.ctrlKey || e.metaKey) && e.key === '[') { changeLevel(r, -1); e.preventDefault(); return }

  // b) Alt + Pil høyre/venstre (din ønskede snarvei)
  if (e.altKey && e.key === 'ArrowRight') { changeLevel(r, +1); e.preventDefault(); return }
  if (e.altKey && e.key === 'ArrowLeft')  { changeLevel(r, -1); e.preventDefault(); return }
}
  function changeLevel(r: number, delta: number) {
    onRowsChange(produce(rows, draft => {
      draft[r].level = Math.max(0, draft[r].level + delta)
    }))
  }

  // Drag & drop – rader
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

  // Drag & drop – kolonner
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

  // Felles kolonnemal (index + alle kolonner)
  const gridTemplate = useMemo(() =>
    ['52px', ...cols.map(c => (c.width ?? 160) + 'px')].join(' '),
  [cols])

  return (
    <div className="tc-wrap" onKeyDown={onKeyDown} tabIndex={0}>
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
            style={{ gridTemplateColumns: gridTemplate }}  // ← viktig
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
              return (
                <div
                  key={c.id}
                  className={clsx('tc-cell', numeric && 'numeric')}
                  onPointerDown={(e) => onCellPointerDown(e, r, colIdx)}
                  onPointerEnter={(e) => onCellPointerEnter(e, r, colIdx)}
                  onDoubleClick={() => onCellDoubleClick(r, colIdx)}
                >
                  {colIdx === 0 && (
                    <>
                      {Array.from({ length: row.level }).map((_, i) => <span key={i} className="tc-indent" />)}
                      {row.level > 0 && <span className="tc-level-bullet" />}
                    </>
                  )}

                  {c.type === 'color' ? (
                    <input type="color" value={val || '#9ca3af'} onChange={e => setCell(r, colIdx, e.target.value)} />
                  ) : c.type === 'date' ? (
                    <input type="date" value={val} onChange={e => setCell(r, colIdx, e.target.value)} />
                  ) : (
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      spellCheck={false}
                      onBlur={(e) => setCell(r, colIdx, (e.target as HTMLElement).innerText)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { (e.target as HTMLElement).blur(); e.preventDefault() }
                      }}
                    >{val}</div>
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
