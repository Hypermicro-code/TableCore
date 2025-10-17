import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Column, Row, Selection, Patch } from "./types"
import { useUndo } from "./useUndo"

/* ==== Props-kontrakt (v1) ==== */
export type TableCoreProps = {
  columns: Column[]
  rows: Row[]
  onRowsChange: (rows: Row[]) => void

  /** Hendelser (delmengde i v1) */
  onPatch?: (patch: Patch) => void
  onCommit?: (rows: Row[]) => void
  onSelectionChange?: (sel: Selection) => void

  /** Presentasjon */
  rowHeight?: number
  headerHeight?: number
}

/* ==== Hjelpere ==== */
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
function normSel(a: Selection): Selection {
  const r1 = Math.min(a.r1, a.r2), r2 = Math.max(a.r1, a.r2)
  const c1 = Math.min(a.c1, a.c2), c2 = Math.max(a.c1, a.c2)
  return { r1, c1, r2, c2 }
}

/* ==== TableCore (Etappe 1) ==== */
export default function TableCore(props: TableCoreProps) {
  const {
    columns, rows, onRowsChange,
    onPatch, onCommit, onSelectionChange,
    rowHeight = 28,
    headerHeight = 30,
  } = props

  const rootRef = useRef<HTMLDivElement>(null)
  const vpRef = useRef<HTMLDivElement>(null)

  // Utvalg/markering
  const [sel, setSel] = useState<Selection>({ r1: 0, c1: 0, r2: 0, c2: 0 })
  const [dragging, setDragging] = useState(false)
  const anchorRef = useRef<{r:number,c:number} | null>(null)

  // Redigering
  const [edit, setEdit] = useState<{r:number,c:number,value:string} | null>(null)
  const editorRef = useRef<HTMLInputElement>(null)

  // Undo/Redo
  const { push, undo, redo } = useUndo()

  // Virtuell rulling
  const totalHeight = rows.length * rowHeight
  const [scrollTop, setScrollTop] = useState(0)
  const vpH = vpRef.current?.clientHeight ?? 0
  const visibleCount = Math.ceil(vpH / rowHeight) + 6
  const startIndex = clamp(Math.floor(scrollTop / rowHeight) - 3, 0, Math.max(0, rows.length - 1))
  const endIndex = clamp(startIndex + visibleCount, 0, rows.length)
  const topPad = startIndex * rowHeight
  const bottomPad = Math.max(0, totalHeight - topPad - (endIndex - startIndex) * rowHeight)

  /* ===== Effekt: fokus ved redigering ===== */
  useEffect(() => {
    if (edit && editorRef.current) {
      editorRef.current.focus()
    }
  }, [edit])

  /* ===== Utvalg endret callback ===== */
  useEffect(() => {
    onSelectionChange?.(normSel(sel))
  }, [sel, onSelectionChange])

  /* ===== Taster på rot ===== */
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const maxR = rows.length - 1
    const maxC = columns.length - 1
    const s = normSel(sel)

    // Undo/Redo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault()
      undo(applyPatch)
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault()
      redo(applyPatch)
      return
    }

    // Navigasjon – basert på fokuscelle (s.r2/c2)
    let { r2, c2 } = s
    const move = (dr: number, dc: number) => {
      const nr = clamp(r2 + dr, 0, maxR)
      const nc = clamp(c2 + dc, 0, maxC)
      setSel({ r1: nr, c1: nc, r2: nr, c2: nc })
      ensureVisible(nr)
    }

    if (e.key === "ArrowLeft") { e.preventDefault(); move(0, -1); return }
    if (e.key === "ArrowRight") { e.preventDefault(); move(0, +1); return }
    if (e.key === "ArrowUp") { e.preventDefault(); move(-1, 0); return }
    if (e.key === "ArrowDown") { e.preventDefault(); move(+1, 0); return }
    if (e.key === "Tab") { e.preventDefault(); move(0, e.shiftKey ? -1 : +1); return }
    if (e.key === "Enter") {
      e.preventDefault()
      // Enter starter redigering på fokus
      startEdit(s.r2, s.c2, true)
      return
    }
    if (e.key === "Delete") {
      e.preventDefault()
      clearSelection()
      return
    }
    // Alfanumerisk – start redigering direkte
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      startEdit(s.r2, s.c2, false, e.key)
    }
  }, [rows.length, columns.length, sel, undo, redo])

  const ensureVisible = (rowIndex: number) => {
    const vp = vpRef.current
    if (!vp) return
    const y = rowIndex * rowHeight
    if (y < scrollTop) vp.scrollTop = y
    else if (y + rowHeight > scrollTop + vp.clientHeight) vp.scrollTop = y - vp.clientHeight + rowHeight
  }

  /* ===== Mus: klikk, dra for rektangel ===== */
  const cellMouseDown = (r: number, c: number, e: React.MouseEvent) => {
    // Shift = rektangel fra eksisterende anker
    if (e.shiftKey) {
      const a = anchorRef.current ?? { r: sel.r1, c: sel.c1 }
      setSel({ r1: a.r, c1: a.c, r2: r, c2: c })
      setDragging(true)
      return
    }
    // Annet: sett anker og enkeltutvalg
    anchorRef.current = { r, c }
    setSel({ r1: r, c1: c, r2: r, c2: c })
    setDragging(true)
  }

  const cellMouseEnter = (r: number, c: number) => {
    if (!dragging) return
    const a = anchorRef.current ?? { r, c }
    setSel({ r1: a.r, c1: a.c, r2: r, c2: c })
  }

  const onMouseUp = () => setDragging(false)

  /* ===== Redigering ===== */
  const startEdit = (r: number, c: number, selectAll: boolean, seed?: string) => {
    const key = columns[c].key
    const raw = rows[r]?.[key] ?? ""
    const value = seed !== undefined ? seed : String(raw ?? "")
    setEdit({ r, c, value })
    // selectAll håndteres i useEffect + dblclick
    setTimeout(() => {
      if (editorRef.current) {
        if (selectAll) editorRef.current.select()
        else if (seed !== undefined) editorRef.current.setSelectionRange(1, 1)
      }
    })
  }

  const commitEdit = () => {
    if (!edit) return
    const { r, c, value } = edit
    const key = columns[c].key
    const prev = rows[r]?.[key]
    if (prev === value) { setEdit(null); return }
    const nextRows = rows.slice()
    nextRows[r] = { ...nextRows[r], [key]: value }
    onRowsChange(nextRows)
    const patch: Patch = { rowIndex: r, key, prev, next: value }
    push(patch)
    onPatch?.(patch)
    onCommit?.(nextRows)
    setEdit(null)
  }

  const cancelEdit = () => setEdit(null)

  const applyPatch = (p: Patch) => {
    const nextRows = rows.slice()
    nextRows[p.rowIndex] = { ...nextRows[p.rowIndex], [p.key]: p.next }
    onRowsChange(nextRows)
    onPatch?.(p)
    onCommit?.(nextRows)
  }

  /* ===== Delete for hele utvalget ===== */
  const clearSelection = () => {
    const s = normSel(sel)
    const next = rows.slice()
    const patches: Patch[] = []
    for (let r = s.r1; r <= s.r2; r++) {
      for (let c = s.c1; c <= s.c2; c++) {
        const key = columns[c].key
        const prev = next[r]?.[key]
        if (prev !== "" && prev !== undefined) {
          next[r] = { ...next[r], [key]: "" }
          patches.push({ rowIndex: r, key, prev, next: "" })
        }
      }
    }
    if (patches.length) {
      onRowsChange(next)
      patches.forEach(push)
      onPatch?.(patches[patches.length - 1])
      onCommit?.(next)
    }
  }

  /* ===== Editor posisjon/bredde/høyde ===== */
  const editorRect = useMemo(() => {
    if (!edit) return null
    const { r, c } = edit
    const y = r * rowHeight + headerHeight - scrollTop
    let x = 0
    for (let i = 0; i < c; i++) x += (columns[i].width ?? 140)
    const w = (columns[c].width ?? 140)
    return { top: y, left: x, width: w, height: rowHeight }
  }, [edit, columns, rowHeight, headerHeight, scrollTop])

  /* ===== Header grid-template-columns ===== */
  const gridCols = useMemo(() => columns.map(c => (c.width ?? 140) + "px").join(" "), [columns])

  return (
    <div
      className="tc-root"
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseUp={onMouseUp}
      aria-label="TableCore grid"
      role="grid"
    >
      {/* Header */}
      <div className="tc-header" style={{ gridTemplateColumns: gridCols, height: headerHeight }}>
        {columns.map((c, i) => (
          <div key={c.key} className="tc-hcell" role="columnheader" aria-colindex={i+1}>
            {c.name}
          </div>
        ))}
      </div>

      {/* Viewport med virtuell rulling */}
      <div
        className="tc-viewport"
        ref={vpRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        <div className="tc-canvas" style={{ height: totalHeight }}>
          <div style={{ height: topPad }} />
          {rows.slice(startIndex, endIndex).map((row, iLocal) => {
            const r = startIndex + iLocal
            const rowSel = normSel(sel)
            return (
              <div
                key={r}
                className="tc-row"
                role="row"
                aria-rowindex={r+1}
                style={{ gridTemplateColumns: gridCols, height: rowHeight }}
              >
                {columns.map((col, c) => {
                  const v = row[col.key] ?? ""
                  const focused = r === rowSel.r2 && c === rowSel.c2
                  const inSel = r >= rowSel.r1 && r <= rowSel.r2 && c >= rowSel.c1 && c <= rowSel.c2
                  return (
                    <div
                      key={col.key}
                      className={"tc-cell" + (focused ? " tc-focus" : "")}
                      role="gridcell"
                      aria-colindex={c+1}
                      onMouseDown={(e) => cellMouseDown(r, c, e)}
                      onMouseEnter={() => cellMouseEnter(r, c)}
                      onDoubleClick={() => startEdit(r, c, true)}
                      onClick={() => {
                        // Krav: klikk = start redigering
                        startEdit(r, c, false)
                      }}
                      style={{
                        background: inSel ? "var(--sel)" : undefined
                      }}
                      title={String(v)}
                    >
                      {String(v)}
                    </div>
                  )
                })}
              </div>
            )
          })}
          <div style={{ height: bottomPad }} />

          {/* Rektangel-ramme for utvalg */}
          {(() => {
            const s = normSel(sel)
            // Beregn posisjon relativt til viewport-scroll
            const top = s.r1 * rowHeight + headerHeight - scrollTop
            let left = 0
            for (let i = 0; i < s.c1; i++) left += (columns[i].width ?? 140)
            const width = Array.from({length: (s.c2 - s.c1 + 1)})
              .reduce((acc, _, idx) => acc + (columns[s.c1 + idx].width ?? 140), 0)
            const height = (s.r2 - s.r1 + 1) * rowHeight
            return (
              <div
                className="tc-sel-rect"
                style={{ top, left, width, height }}
              />
            )
          })()}

          {/* Editor */}
          {edit && editorRect && (
            <input
              ref={editorRef}
              className="tc-editor"
              style={editorRect}
              value={edit.value}
              onChange={(e) => setEdit(v => v ? ({ ...v, value: e.target.value }) : v)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
