import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  Column, Row, Selection, Patch,
  ReorderColumnsArgs, ReorderRowsArgs
} from "./types"
import { useUndo } from "./useUndo"

export type TableCoreProps = {
  columns: Column[]
  rows: Row[]
  onRowsChange: (rows: Row[]) => void
  onPatch?: (patch: Patch) => void
  onCommit?: (rows: Row[]) => void
  onSelectionChange?: (sel: Selection) => void
  onReorderRows?: (args: ReorderRowsArgs) => void
  onReorderColumns?: (args: ReorderColumnsArgs) => void
  rowHeight?: number
  headerHeight?: number
  viewportHeight?: number
  treeMode?: boolean
  expandAllByDefault?: boolean
}

/* ===== Hjelpere ===== */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const normSel = (a: Selection): Selection => {
  const r1 = Math.min(a.r1, a.r2), r2 = Math.max(a.r1, a.r2)
  const c1 = Math.min(a.c1, a.c2), c2 = Math.max(a.c1, a.c2)
  return { r1, c1, r2, c2 }
}
const colWidth = (cols: Column[], i: number) => (cols[i]?.width ?? 140)
const idOf = (r: Row, idx: number) => (r.id ?? idx)
const pidOf = (r: Row) => (r.parentId ?? null)

/** Synlig liste – 100% null-sikker under strict + noUncheckedIndexedAccess */
function buildVisible(rows: Row[], expanded: Record<string | number, boolean>) {
  const out: { row: Row; level: number }[] = []

  // id → index (sikker)
  const indexById = new Map<string | number, number>()
  for (let i = 0; i < rows.length; i++) {
    const rr = rows[i]
    if (!rr) continue
    indexById.set(idOf(rr, i), i)
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue

    let level = 0
    let visible = true

    let currentPid = pidOf(r)
    const guard = new Set<string | number>()

    while (currentPid != null) {
      if (guard.has(currentPid)) { visible = false; break } // verne mot syklus
      guard.add(currentPid)

      if (!expanded[currentPid]) { visible = false; break }
      const pIndex = indexById.get(currentPid)
      if (pIndex == null) break // forelder mangler → tillat synlig
      const parentRow = rows[pIndex]
      if (!parentRow) break
      level++
      currentPid = pidOf(parentRow)
    }

    if (visible) out.push({ row: r, level })
  }
  return out
}

function allEmpty(row: Row, columns: Column[]) {
  return columns.every(c => c.key === "#" || row[c.key] === "" || row[c.key] == null)
}

/* ===== TableCore ===== */
export default function TableCore(props: TableCoreProps) {
  const {
    columns: columnsProp,
    rows: rowsProp,
    onRowsChange,
    onPatch, onCommit, onSelectionChange,
    onReorderRows, onReorderColumns,
    rowHeight = 28,
    headerHeight = 30,
    viewportHeight = 520,
    treeMode = true,
    expandAllByDefault = true,
  } = props

  const rootRef = useRef<HTMLDivElement>(null)
  const vpRef = useRef<HTMLDivElement>(null)

  // Kolonner inkl. #
  const [columns, setColumns] = useState<Column[]>(() => [{ key: "#", name: "#", width: 80, editable: false }, ...columnsProp])
  useEffect(() => { setColumns([{ key: "#", name: "#", width: 80, editable: false }, ...columnsProp]) }, [columnsProp])

  // Expand-state
  const [expanded, setExpanded] = useState<Record<string | number, boolean>>({})
  useEffect(() => {
    if (!treeMode || !expandAllByDefault) return
    const withChild = new Set<string | number>()
    rowsProp.forEach(r => { if (r.parentId != null) withChild.add(r.parentId) })
    const next: Record<string | number, boolean> = {}
    withChild.forEach(id => { next[id] = true })
    setExpanded(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsProp, treeMode, expandAllByDefault])

  // Synlige rader
  const visible = useMemo(
    () => (treeMode ? buildVisible(rowsProp, expanded) : rowsProp.map(r => ({ row: r, level: 0 }))),
    [rowsProp, expanded, treeMode]
  )

  // Markering/redigering
  const [sel, setSel] = useState<Selection>({ r1: 0, c1: 1, r2: 0, c2: 1 })
  const [dragging, setDragging] = useState(false)
  const anchorRef = useRef<{ r: number; c: number } | null>(null)
  const [edit, setEdit] = useState<{ r: number; c: number; value: string } | null>(null)
  const editorRef = useRef<HTMLInputElement>(null)

  // Undo/Redo + feil
  const { push, undo, redo } = useUndo()
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Virtuell rulling
  const totalHeight = visible.length * rowHeight
  const [scrollTop, setScrollTop] = useState(0)
  const vpH = viewportHeight
  const visibleCount = Math.ceil(vpH / rowHeight) + 6
  const startIndex = clamp(Math.floor(scrollTop / rowHeight) - 3, 0, Math.max(0, visible.length - 1))
  const endIndex = clamp(startIndex + visibleCount, 0, visible.length)
  const topPad = startIndex * rowHeight
  const bottomPad = Math.max(0, totalHeight - topPad - (endIndex - startIndex) * rowHeight)

  useEffect(() => { if (edit && editorRef.current) editorRef.current.focus() }, [edit])
  useEffect(() => { onSelectionChange?.(normSel(sel)) }, [sel, onSelectionChange])

  const dataIndexAtVisible = (vr: number) => {
    const item = visible[vr]
    if (!item) return -1
    const idx = rowsProp.indexOf(item.row)
    return idx >= 0 ? idx : -1
  }

  /* ===== Navigasjon/Hotkeys ===== */
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const maxR = visible.length - 1
    const maxC = columns.length - 1
    const s = normSel(sel)

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(applyPatch); return }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(applyPatch); return }

    if (e.key === "ArrowLeft" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); toggleExpandAt(s.r2, false); return }
    if (e.key === "ArrowRight" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); toggleExpandAt(s.r2, true); return }

    if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); indentSelectionTwoStep(s); return }
    if (e.altKey && e.key === "ArrowLeft")  { e.preventDefault(); outdentSelection(s); return }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); moveSelectionWithinParent(s, e.key === "ArrowDown" ? +1 : -1); return }

    let { r2, c2 } = s
    const move = (dr: number, dc: number) => {
      const nr = clamp(r2 + dr, 0, maxR)
      const nc = clamp(c2 + dc, 0, maxC)
      setSel({ r1: nr, c1: nc, r2: nr, c2: nc })
      ensureVisible(nr)
    }

    if (e.key === "ArrowLeft")  { e.preventDefault(); move(0, -1); return }
    if (e.key === "ArrowRight") { e.preventDefault(); move(0, +1); return }
    if (e.key === "ArrowUp")    { e.preventDefault(); move(-1, 0); return }
    if (e.key === "ArrowDown")  { e.preventDefault(); move(+1, 0); return }
    if (e.key === "Tab")        { e.preventDefault(); move(0, e.shiftKey ? -1 : +1); return }
    if (e.key === "Home")       { e.preventDefault(); setSel({ r1: r2, c1: 1, r2, c2: 1 }); return }
    if (e.key === "End")        { e.preventDefault(); setSel({ r1: r2, c1: maxC, r2, c2: maxC }); return }
    if (e.key === "PageUp")     { e.preventDefault(); move(-Math.max(1, Math.floor(vpH/rowHeight)-1), 0); return }
    if (e.key === "PageDown")   { e.preventDefault(); move(+Math.max(1, Math.floor(vpH/rowHeight)-1), 0); return }

    if (e.key === "Enter")  { e.preventDefault(); startEdit(s.r2, s.c2, true); return }
    if (e.key === "Delete") { e.preventDefault(); clearSelection(); return }

    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      startEdit(s.r2, s.c2, false, e.key)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length, columns.length, sel, undo, redo, rowsProp, expanded, vpH, rowHeight])

  const ensureVisible = (rowIndex: number) => {
    const vp = vpRef.current; if (!vp) return
    const y = rowIndex * rowHeight
    if (y < scrollTop) vp.scrollTop = y
    else if (y + rowHeight > scrollTop + vp.clientHeight) vp.scrollTop = y - vp.clientHeight + rowHeight
  }

  const toggleExpandAt = (vr: number, force?: boolean) => {
    if (!treeMode) return
    const di = dataIndexAtVisible(vr)
    if (di < 0) return
    const row = rowsProp[di]
    if (!row) return
    const id = idOf(row, di)
    const hasChild = rowsProp.some(r => (r.parentId ?? null) === id)
    if (!hasChild) return
    setExpanded(prev => {
      const cur = !!prev[id]
      const nextVal = force === undefined ? !cur : force
      return { ...prev, [id]: nextVal }
    })
  }

  /* ===== Mus: markering ===== */
  const cellMouseDown = (r: number, c: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      const a = anchorRef.current ?? { r: sel.r1, c: sel.c1 }
      setSel({ r1: a.r, c1: a.c, r2: r, c2: c }); setDragging(true); return
    }
    anchorRef.current = { r, c }
    setSel({ r1: r, c1: c, r2: r, c2: c }); setDragging(true)
  }
  const cellMouseEnter = (r: number, c: number) => {
    if (!dragging) return
    const a = anchorRef.current ?? { r, c }
    setSel({ r1: a.r, c1: a.c, r2: r, c2: c })
  }
  const onMouseUp = () => setDragging(false)

  /* ===== Redigering + validering ===== */
  const [editingCell, setEditingCell] = useState<{ r: number; c: number } | null>(null)

  const startEdit = (vr: number, c: number, selectAll: boolean, seed?: string) => {
    if (c === 0) return
    const col = columns[c]
    if (!col?.editable) return
    const di = dataIndexAtVisible(vr)
    if (di < 0) return
    if (edit && edit.r === vr && edit.c === c) return

    const raw = rowsProp[di]?.[col.key] ?? ""
    const value = seed !== undefined ? seed : String(raw ?? "")
    setEdit({ r: vr, c, value })
    setEditingCell({ r: vr, c })
    setTimeout(() => {
      if (editorRef.current) {
        if (selectAll) editorRef.current.select()
        else if (seed !== undefined) editorRef.current.setSelectionRange(1, 1)
      }
    })
  }

  const commitEdit = () => {
    if (!edit) return
    const { r: vr, c, value } = edit
    const di = dataIndexAtVisible(vr)
    if (di < 0) { setEdit(null); setEditingCell(null); return }
    const col = columns[c]
    if (!col) { setEdit(null); setEditingCell(null); return }
    const key = col.key
    const prev = rowsProp[di]?.[key]

    if (col.validate) {
      const res = col.validate(value, rowsProp[di] as Row)
      if (res === false || (typeof res === "string" && res.length > 0)) {
        const msg = res === false ? "Ugyldig verdi" : res
        setErrors(e => ({ ...e, [di + "::" + key]: msg }))
        return
      } else {
        setErrors(e => { const copy = { ...e }; delete copy[di + "::" + key]; return copy })
      }
    }

    if (prev === value) { setEdit(null); setEditingCell(null); return }
    const nextRows = rowsProp.slice()
    nextRows[di] = { ...(nextRows[di] as Row), [key]: value }
    onRowsChange(nextRows)
    const patch: Patch = { rowIndex: di, key, prev, next: value }
    push(patch)
    onPatch?.(patch)
    onCommit?.(nextRows)
    setEdit(null)
    setEditingCell(null)
  }

  const cancelEdit = () => { setEdit(null); setEditingCell(null) }

  const applyPatch = (p: Patch) => {
    const nextRows = rowsProp.slice()
    nextRows[p.rowIndex] = { ...(nextRows[p.rowIndex] as Row), [p.key]: p.next }
    onRowsChange(nextRows)
    onPatch?.(p)
    onCommit?.(nextRows)
  }

  const clearSelection = () => {
    const s = normSel(sel)
    const next = rowsProp.slice()
    const patches: Patch[] = []
    for (let vr = s.r1; vr <= s.r2; vr++) {
      const di = dataIndexAtVisible(vr)
      if (di < 0) continue
      for (let c = Math.max(1, s.c1); c <= s.c2; c++) {
        const col = columns[c]
        if (!col?.editable) continue
        const key = col.key
        const prev = (next[di] as Row | undefined)?.[key]
        if (prev !== "" && prev !== undefined) {
          next[di] = { ...(next[di] as Row), [key]: "" }
          patches.push({ rowIndex: di, key, prev, next: "" })
        }
      }
    }
    if (patches.length) {
      onRowsChange(next)
      patches.forEach(p => push(p))
      onPatch?.(patches[patches.length - 1]!)
      onCommit?.(next)
    }
  }

  // Editor posisjon
  const editorRect = useMemo(() => {
    if (!edit) return null
    const { r: vr, c } = edit
    const y = vr * rowHeight + headerHeight - scrollTop
    let x = 0
    for (let i = 0; i < c; i++) x += colWidth(columns, i)
    const w = colWidth(columns, c)
    return { top: y, left: x, width: w, height: rowHeight }
  }, [edit, columns, rowHeight, headerHeight, scrollTop])

  /* ===== Kolonne-drag ===== */
  const onHeaderDragStart = (colIndex: number, e: React.DragEvent) => {
    e.dataTransfer.setData("text/x-col", String(colIndex))
    e.dataTransfer.effectAllowed = "move"
  }
  const onHeaderDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }
  const onHeaderDrop = (toIndex: number, e: React.DragEvent) => {
    const data = e.dataTransfer.getData("text/x-col")
    if (!data) return
    const fromIndex = Number(data)
    if (Number.isNaN(fromIndex) || fromIndex === toIndex) return
    if (fromIndex === 0 || toIndex === 0) return
    const next = columns.slice()
    const [moved] = next.splice(fromIndex, 1)
    if (!moved) return
    next.splice(toIndex, 0, moved)
    setColumns(next)
    onReorderColumns?.({ fromIndex, toIndex })
  }

  /* ===== Rad-drag (inkl. blokk) ===== */
  const dragBlockRef = useRef<{ from: number; count: number } | null>(null)
  const onRowDragStart = (vr: number, e: React.DragEvent) => {
    const s = normSel(sel)
    const inBlock = vr >= s.r1 && vr <= s.r2
    const from = inBlock ? s.r1 : vr
    const count = inBlock ? (s.r2 - s.r1 + 1) : 1
    dragBlockRef.current = { from, count }
    e.dataTransfer.setData("text/x-row", String(from))
    e.dataTransfer.effectAllowed = "move"
  }
  const onRowDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }
  const onRowDrop = (toVR: number, e: React.DragEvent) => {
    e.preventDefault()
    const info = dragBlockRef.current
    if (!info) return
    const { from, count } = info
    if (from === toVR) return

    const srcDataIdx = dataIndexAtVisible(from)
    const dstDataIdx = dataIndexAtVisible(toVR)
    if (srcDataIdx < 0 || dstDataIdx < 0) return

    const parentId = rowsProp[srcDataIdx]?.parentId ?? null
    const sameParent = (rowsProp[dstDataIdx]?.parentId ?? null) === parentId
    if (treeMode && !sameParent) return

    const next = rowsProp.slice()
    const block: Row[] = []
    const dataIdxs: number[] = []
    for (let i = 0; i < count; i++) {
      const di = dataIndexAtVisible(from + i)
      if (di >= 0 && next[di]) { block.push(next[di] as Row); dataIdxs.push(di) }
    }
    dataIdxs.sort((a, b) => b - a).forEach(di => next.splice(di, 1))
    const afterRemoveVisible = buildVisible(next, expanded)
    const toDataIdxAfter = (() => {
      const target = clamp(toVR, 0, afterRemoveVisible.length)
      if (target >= afterRemoveVisible.length) return next.length
      const row = afterRemoveVisible[target]?.row
      return row ? next.indexOf(row) : next.length
    })()
    next.splice(toDataIdxAfter, 0, ...block)
    onRowsChange(next)
    onReorderRows?.({ fromIndex: srcDataIdx, toIndex: toDataIdxAfter, count, parentId })
  }

  /* ===== Indent/Outdent/Move i tre ===== */
  const indentSelectionTwoStep = (s: Selection) => {
    if (!treeMode) return
    const anchor = s.r2
    const prevVR = anchor - 1
    if (prevVR < 0) return
    const anchorDI = dataIndexAtVisible(anchor)
    const prevDI = dataIndexAtVisible(prevVR)
    if (anchorDI < 0 || prevDI < 0) return
    const cur = rowsProp.slice()
    const me = cur[anchorDI]; const prev = cur[prevDI]
    if (!me || !prev) return
    const sameLevel = (me.parentId ?? null) === (prev.parentId ?? null)
    me.parentId = sameLevel ? (prev.id ?? prevDI) : (prev.parentId ?? null)
    onRowsChange(cur)
  }

  const outdentSelection = (s: Selection) => {
    if (!treeMode) return
    const di = dataIndexAtVisible(s.r2)
    if (di < 0) return
    const cur = rowsProp.slice()
    const me = cur[di]
    if (!me || me.parentId == null) return
    const parentIdx = cur.findIndex(r => (r.id ?? -1) === me.parentId)
    const parent = parentIdx >= 0 ? cur[parentIdx] : undefined
    me.parentId = parent ? (parent.parentId ?? null) : null
    onRowsChange(cur)
  }

  const moveSelectionWithinParent = (s: Selection, dir: 1 | -1) => {
    const from = s.r1
    const count = s.r2 - s.r1 + 1
    const startDI = dataIndexAtVisible(from)
    if (startDI < 0) return
    const parentId = rowsProp[startDI]?.parentId ?? null
    let target = dir > 0 ? s.r2 + 1 : s.r1 - 1
    while (target >= 0 && target < visible.length) {
      const tDI = dataIndexAtVisible(target)
      if (tDI >= 0 && (rowsProp[tDI]?.parentId ?? null) === parentId) break
      target += dir
    }
    if (target < 0 || target >= visible.length) return
    const e = new DataTransfer()
    dragBlockRef.current = { from, count }
    onRowDrop(target, { preventDefault(){}, dataTransfer: e } as any as React.DragEvent)
    const shift = dir > 0 ? +1 : -1
    setSel({ r1: from + shift, c1: s.c1, r2: s.r2 + shift, c2: s.c2 })
  }

  /* ===== Clipboard ===== */
  const onCopy = (e: React.ClipboardEvent) => {
    const s = normSel(sel)
    const lines: string[] = []
    for (let vr = s.r1; vr <= s.r2; vr++) {
      const di = dataIndexAtVisible(vr)
      if (di < 0) continue
      const parts: string[] = []
      for (let c = Math.max(1, s.c1); c <= s.c2; c++) {
        const col = columns[c]
        parts.push(String((rowsProp[di] as Row | undefined)?.[col?.key ?? ""] ?? ""))
      }
      lines.push(parts.join("\t"))
    }
    e.clipboardData.setData("text/plain", lines.join("\n"))
    e.preventDefault()
  }

  function parseClipboard(e: React.ClipboardEvent): string[][] | null {
    const html = e.clipboardData.getData("text/html")
    if (html && html.includes("<table")) {
      try {
        const doc = new DOMParser().parseFromString(html, "text/html")
        const table = doc.querySelector("table")
        if (table) {
          const rows: string[][] = []
          table.querySelectorAll("tr").forEach(tr => {
            const cells = Array.from(tr.querySelectorAll("td,th")).map(td => td.textContent ?? "")
            rows.push(cells)
          })
          return rows
        }
      } catch {}
    }
    const txt = e.clipboardData.getData("text/plain")
    if (!txt) return null
    return txt.split(/\r?\n/).map(line => line.split("\t"))
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const grid = parseClipboard(e)
    if (!grid || grid.length === 0) return
    e.preventDefault()
    const s = normSel(sel)
    const next = rowsProp.slice()
    for (let i = 0; i < grid.length; i++) {
      const vr = s.r1 + i
      if (vr >= visible.length) break
      const di = dataIndexAtVisible(vr)
      if (di < 0) continue
      const row = { ...(next[di] as Row) }
      for (let j = 0; j < grid[i].length; j++) {
        const c = s.c1 + j
        if (c <= 0 || c >= columns.length) break
        const col = columns[c]
        if (!col?.editable) continue
        const val = grid[i][j]
        if (col.validate) {
          const res = col.validate(val, row)
          if (res === false || (typeof res === "string" && res.length > 0)) {
            setErrors(e => ({ ...e, [di + "::" + col.key]: (res === false ? "Ugyldig verdi" : String(res)) }))
            continue
          } else {
            setErrors(e => { const copy = { ...e }; delete copy[di + "::" + col.key]; return copy })
          }
        }
        row[col.key] = val
      }
      next[di] = row
    }
    onRowsChange(next)
    onCommit?.(next)
  }

  const gridCols = useMemo(
    () => columns.map((_, i) => `${colWidth(columns, i)}px`).join(" "),
    [columns]
  )

  return (
    <div
      className="tc-root"
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseUp={onMouseUp}
      onCopy={onCopy}
      onPaste={onPaste}
      aria-label="TableCore grid"
      role="grid"
    >
      {/* Header */}
      <div className="tc-header" style={{ gridTemplateColumns: gridCols, height: headerHeight }}>
        {columns.map((c, i) => (
          <div
            key={c.key}
            className={"tc-hcell" + (i === 0 ? " tc-hcell-hash" : "")}
            role="columnheader"
            aria-colindex={i + 1}
            draggable={i !== 0}
            onDragStart={(e) => i !== 0 && onHeaderDragStart(i, e)}
            onDragOver={(e) => i !== 0 && onHeaderDragOver(e)}
            onDrop={(e) => i !== 0 && onHeaderDrop(i, e)}
          >
            {c.name}
          </div>
        ))}
      </div>

      {/* Viewport */}
      <div
        className="tc-viewport"
        ref={vpRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        style={{ height: viewportHeight }}
      >
        <div className="tc-canvas" style={{ height: totalHeight }}>
          <div style={{ height: topPad }} />

          {visible.slice(startIndex, endIndex).map((vrow, iLocal) => {
            const vr = startIndex + iLocal
            const di = dataIndexAtVisible(vr)
            if (di < 0) return null
            const dataRow = rowsProp[di]
            if (!dataRow) return null

            const isEmpty = allEmpty(dataRow, columns)
            const level = vrow.level
            const clsLevel = "tc-level-" + String(Math.min(level, 4))
            const rowSel = normSel(sel)
            const hasChildren = rowsProp.some(r => (r.parentId ?? null) === idOf(dataRow, di))
            const isExpanded = !!expanded[idOf(dataRow, di)]

            return (
              <div
                key={di + "-" + vr}
                className={`tc-row ${clsLevel}`}
                role="row"
                aria-rowindex={vr + 1}
                style={{ gridTemplateColumns: gridCols, height: rowHeight }}
                onDragOver={onRowDragOver}
                onDrop={(e) => onRowDrop(vr, e)}
              >
                {/* #-kolonnen */}
                <div className="tc-cell-hash" style={{ paddingLeft: 6 + level * 14 }}>
                  <span
                    className="tc-caret"
                    onClick={() => toggleExpandAt(vr)}
                    title={hasChildren ? (isExpanded ? "Skjul barn" : "Vis barn") : ""}
                  >
                    {hasChildren ? (isExpanded ? "▾" : "▸") : "·"}
                  </span>
                  <span
                    className="tc-drag"
                    draggable
                    onDragStart={(e) => onRowDragStart(vr, e)}
                    title="Dra for å flytte rad/blokk"
                  >
                    ☰
                  </span>
                  <span style={{ opacity: isEmpty ? 0 : 0.9 }}>
                    {isEmpty ? "" : (di + 1)}
                  </span>
                </div>

                {/* data-celler */}
                {Array.from({ length: Math.max(0, columns.length - 1) }).map((_, idx) => {
                  const c = 1 + idx
                  const colMaybe = columns[c]
                  if (!colMaybe) {
                    return (
                      <div
                        key={`empty-col-${idx}`}
                        className="tc-cell"
                        role="gridcell"
                        aria-colindex={c + 1}
                        onMouseDown={(e) => cellMouseDown(vr, c, e)}
                        onMouseEnter={() => cellMouseEnter(vr, c)}
                      />
                    )
                  }
                  const col = colMaybe as Column
                  const key = col.key
                  const raw = (dataRow as Row)[key]
                  const v = String(raw ?? "")
                  const focused = vr === rowSel.r2 && c === rowSel.c2
                  const inSel = vr >= rowSel.r1 && vr <= rowSel.r2 && c >= rowSel.c1 && c <= rowSel.c2
                  const errKey = `${di}::${key}`
                  const hasErr = !!errors[errKey]
                  const isEditing = !!editingCell && editingCell.r === vr && editingCell.c === c

                  return (
                    <div
                      key={key}
                      className={"tc-cell" + (focused ? " tc-focus" : "") + (hasErr ? " tc-cell-error" : "")}
                      role="gridcell"
                      aria-colindex={c + 1}
                      onMouseDown={(e) => cellMouseDown(vr, c, e)}
                      onMouseEnter={() => cellMouseEnter(vr, c)}
                      onDoubleClick={() => startEdit(vr, c, true)}
                      onClick={() => startEdit(vr, c, false)}
                      style={{ background: inSel ? "var(--sel)" : undefined }}
                      title={isEditing ? "" : (hasErr ? errors[errKey] : v)}
                    >
                      <span style={{ visibility: isEditing ? "hidden" : "visible" }}>
                        {v}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}

          <div style={{ height: bottomPad }} />

          {/* Rektangel for utvalg */}
          {(() => {
            const s = normSel(sel)
            const top = s.r1 * rowHeight + headerHeight - scrollTop
            let left = 0
            for (let i = 0; i < s.c1; i++) left += colWidth(columns, i)
            const width = Array.from({ length: (s.c2 - s.c1 + 1) })
              .reduce<number>((acc, _v, idx) => acc + colWidth(columns, s.c1 + idx), 0)
            const height = (s.r2 - s.r1 + 1) * rowHeight
            return <div className="tc-sel-rect" style={{ top, left, width, height }} />
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
                if (e.key === "Enter") { e.preventDefault(); commitEdit() }
                else if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
