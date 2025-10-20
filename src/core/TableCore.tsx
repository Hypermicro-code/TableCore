import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ColumnDef, RowData, Selection, TableCoreProps, CellValue } from './TableTypes'
import { parseClipboard, toTSV } from './utils/clipboard'
import '../styles/tablecore.css'

function clamp(n:number, a:number, b:number){ return Math.max(a, Math.min(b, n)) }
function isNumericColumn(col: ColumnDef){ return col.type === 'number' }
function rowHasContent(row: RowData, columns: ColumnDef[]): boolean {
  return columns.some(c => {
    if (c.key === '#') return false
    const v = row.cells[c.key]
    return v !== '' && v !== undefined && v !== null
  })
}
function makeGridTemplate(columns: ColumnDef[]): string {
  const idx = '48px'
  const cols = columns.map(c => (c.width ? `${c.width}px` : 'minmax(120px, 1fr)'))
  return [idx, ...cols].join(' ')
}

const DRAG_THRESHOLD_PX = 4

type EditMode =
  | { kind:'selectAll' }   // dblklikk: marker alt
  | { kind:'caretEnd' }    // enkeltklikk: skriv videre på slutten
  | { kind:'default' }

export default function TableCore({
  columns,
  rows,
  onChange,
  showSummary = false,
  summaryValues,
  summaryTitle = 'Sammendrag',
}: TableCoreProps){
  const [data, setData] = useState<RowData[]>(rows)
  useEffect(()=>{ setData(rows) }, [rows])

  const titleColIndex = useMemo(()=> Math.max(0, columns.findIndex(c=>c.isTitle)), [columns])

  const [sel, setSel] = useState<Selection>({r1:0,c1:0,r2:0,c2:0})
  const [editing, setEditing] = useState<{r:number, c:number, mode:EditMode} | null>(null)

  // refs for global key handler
  const selRef = useRef(sel); useEffect(()=>{ selRef.current = sel }, [sel])
  const editingRef = useRef(editing); useEffect(()=>{ editingRef.current = editing }, [editing])
  const dataRef = useRef(data); useEffect(()=>{ dataRef.current = data }, [data])

  const rootRef = useRef<HTMLDivElement | null>(null)
  const dragState = useRef<{ active:boolean; dragging:boolean; r0:number; c0:number; x0:number; y0:number } | null>(null)
  const suppressClickToEditOnce = useRef(false)

  const setAndPropagate = useCallback((next: RowData[])=>{ setData(next); onChange(next) },[onChange])

  const indentRow = useCallback((rowIdx:number, delta:number)=>{
    setAndPropagate(dataRef.current.map((r,i)=> i===rowIdx ? { ...r, indent: Math.max(0, r.indent + delta) } : r))
  },[setAndPropagate])

  const moveRow = useCallback((rowIdx:number, dir:-1|1)=>{
    const arr = dataRef.current
    const target = rowIdx + dir
    if (target < 0 || target >= arr.length) return
    const next = arr.slice()
    const [spliced] = next.splice(rowIdx,1)
    next.splice(target,0,spliced)
    setAndPropagate(next)
    setSel(s=>({ ...s, r1:target, r2:target }))
  },[setAndPropagate])

  // ===== Global tastaturhåndtering (fungerer også når input/textarea har fokus) =====
  useEffect(()=>{
    const onKey = (e: KeyboardEvent) => {
      const editingNow = editingRef.current
      const selNow = selRef.current
      const rowsNow = dataRef.current
      const colMax = columns.length - 1
      const rowMax = rowsNow.length - 1

      // Inn/utrykk: Alt+←/→ (blokker også browser back/forward)
      if (e.altKey && !e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')){
        e.preventDefault()
        const rowIdx = editingNow ? editingNow.r : selNow.r1
        indentRow(rowIdx, e.key === 'ArrowRight' ? +1 : -1)
        return
      }

      // Flytt rad: Alt+Shift+↑/↓
      if (e.altKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')){
        e.preventDefault()
        moveRow(selNow.r1, e.key === 'ArrowUp' ? -1 : +1)
        return
      }

      // Navigasjon kun når vi ikke redigerer
      if (!editingNow){
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab' || e.key === 'Enter'){
          e.preventDefault()
          let r = selNow.r1, c = selNow.c1
          if (e.key === 'ArrowUp') r = clamp(r-1, 0, rowMax)
          if (e.key === 'ArrowDown') r = clamp(r+1, 0, rowMax)
          if (e.key === 'ArrowLeft') c = clamp(c-1, 0, colMax)
          if (e.key === 'ArrowRight') c = clamp(c+1, 0, colMax)
          if (e.key === 'Tab') c = (c+1) > colMax ? 0 : c+1
          if (e.key === 'Enter') r = (r+1) > rowMax ? rowMax : r+1
          setSel({r1:r,c1:c,r2:r,c2:c})
        }
        // Start redigering direkte ved tegn
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey){
          setEditing({ r: selNow.r1, c: selNow.c1, mode:{kind:'default'} })
        }
      }
    }
    document.addEventListener('keydown', onKey, true) // capture
    return ()=> document.removeEventListener('keydown', onKey, true)
  }, [columns.length, indentRow, moveRow])

  // ===== Mouse handling =====
  const setGlobalNoSelect = (on:boolean)=>{
    const el = rootRef.current
    if (!el) return
    if (on) el.classList.add('tc-noselect')
    else el.classList.remove('tc-noselect')
  }

  const onCellMouseDown = (r:number, c:number) => (ev: React.MouseEvent) => {
    setSel({ r1:r, c1:c, r2:r, c2:c })
    dragState.current = { active:true, dragging:false, r0:r, c0:c, x0:ev.clientX, y0:ev.clientY }
  }

  const onMouseMove = (ev: React.MouseEvent) => {
    if (!dragState.current || !dragState.current.active) return
    const dx = ev.clientX - dragState.current.x0
    const dy = ev.clientY - dragState.current.y0
    if (!dragState.current.dragging && (dx*dx + dy*dy) > DRAG_THRESHOLD_PX*DRAG_THRESHOLD_PX){
      dragState.current.dragging = true
      setGlobalNoSelect(true)
    }
    if (!dragState.current.dragging) return
    const target = (ev.target as HTMLElement).closest('[data-cell]') as HTMLElement | null
    if (!target) return
    const r = Number(target.getAttribute('data-r'))
    const c = Number(target.getAttribute('data-c'))
    setSel({
      r1: Math.min(dragState.current.r0, r),
      c1: Math.min(dragState.current.c0, c),
      r2: Math.max(dragState.current.r0, r),
      c2: Math.max(dragState.current.c0, c),
    })
  }

  const onMouseUp = () => {
    if (!dragState.current) return
    const wasDragging = dragState.current.dragging
    dragState.current.active = false
    dragState.current.dragging = false
    setGlobalNoSelect(false)

    if (suppressClickToEditOnce.current){
      suppressClickToEditOnce.current = false
      return
    }
    if (!wasDragging){
      const { r0, c0 } = dragState.current
      setEditing({ r: r0, c: c0, mode:{kind:'caretEnd'} })
    }
  }

  const onCellDoubleClick = (r:number, c:number) => (ev: React.MouseEvent) => {
    ev.preventDefault()
    suppressClickToEditOnce.current = true
    setEditing({ r, c, mode:{kind:'selectAll'} })
  }

  // ===== Redigering =====
  const commitEdit = (r:number, c:number, value:string) => {
    const col = columns[c]
    const v: CellValue = (col.type === 'number') ? (value === '' ? '' : Number(value)) : value
    const next = dataRef.current.map((row, i)=> i===r ? { ...row, cells: { ...row.cells, [col.key]: v } } : row)
    setAndPropagate(next)
    setEditing(null)
  }

  // Clipboard
  const onCopy = (e: React.ClipboardEvent) => {
    const { r1,c1,r2,c2 } = selRef.current
    const matrix: (string|number|'')[][] = []
    for (let r=r1; r<=r2; r++){
      const row = dataRef.current[r]
      const line: (string|number|'')[] = []
      for (let c=c1; c<=c2; c++){
        const col = columns[c]
        line.push(row.cells[col.key] ?? '')
      }
      matrix.push(line)
    }
    e.clipboardData.setData('text/plain', toTSV(matrix))
    e.preventDefault()
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    e.preventDefault()
    const matrix = parseClipboard(text)
    const { r1, c1 } = selRef.current
    const next = dataRef.current.map(r=>({...r, cells: {...r.cells}}))
    for (let i=0; i<matrix.length; i++){
      const rr = r1 + i
      if (rr >= next.length) break
      for (let j=0; j<matrix[i].length; j++){
        const cc = c1 + j
        if (cc >= columns.length) break
        const col = columns[cc]
        const raw = matrix[i][j]
        const v: CellValue = (col.type === 'number') ? (raw === '' ? '' : Number(raw.replace(/\s/g,''))) : raw
        next[rr].cells[col.key] = v
      }
    }
    setAndPropagate(next)
  }

  // Sammendragslinje
  const computedFallback = useMemo(()=>{
    if (!showSummary || summaryValues) return null
    const sums: Record<string, CellValue> = {}
    for (const col of columns){
      if (isNumericColumn(col) && col.summarizable){ sums[col.key] = 0 }
    }
    for (const r of dataRef.current){
      for (const col of columns){
        if (isNumericColumn(col) && col.summarizable){
          const v = r.cells[col.key]
          if (typeof v === 'number' && !Number.isNaN(v)){
            sums[col.key] = (typeof sums[col.key] === 'number' ? (sums[col.key] as number) : 0) + v
          }
        }
      }
    }
    const tCol = columns[titleColIndex]
    if (tCol){ sums[tCol.key] = (sums[tCol.key] ?? '') || summaryTitle }
    return sums
  }, [showSummary, summaryValues, columns, titleColIndex, summaryTitle])

  const summaryCells = summaryValues ?? computedFallback
  const gridCols = useMemo(()=> makeGridTemplate(columns), [columns])

  return (
    <div ref={rootRef} className="tc-root" onCopy={onCopy} onPaste={onPaste} tabIndex={0}>
      <div className="tc-wrap" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
        {/* Header */}
        <div className="tc-header" style={{ gridTemplateColumns: gridCols }}>
          <div className="tc-cell tc-idx">#</div>
          {columns.map((col)=> (
            <div key={col.key} className="tc-cell" title={col.title}>{col.title}</div>
          ))}
        </div>

        {/* Sammendrag */}
        {showSummary && summaryCells && (
          <div className="tc-row tc-summary" style={{ gridTemplateColumns: gridCols }}>
            <div className="tc-cell tc-idx"></div>
            {columns.map((col)=>{
              const v = summaryCells[col.key]
              return (
                <div key={col.key} className="tc-cell" title={typeof v === 'number' ? String(v) : (v as string)}>
                  {col.isTitle ? (
                    <span className="tc-title">
                      <span className="tc-indent" style={{ ['--lvl' as any]: 0 }} />
                      <span>{(v ?? summaryTitle) as any}</span>
                    </span>
                  ) : (
                    <span>{v as any}</span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Rader */}
        {data.map((row, rIdx)=>{
          const showIndex = rowHasContent(row, columns)
          return (
            <div key={row.id} className="tc-row" style={{ gridTemplateColumns: gridCols }}>
              <div className="tc-cell tc-idx">{showIndex ? (rIdx+1) : ''}</div>
              {columns.map((col, cIdx)=>{
                const inSel = rIdx>=sel.r1 && rIdx<=sel.r2 && cIdx>=sel.c1 && cIdx<=sel.c2
                const top    = inSel && rIdx === sel.r1
                const bottom = inSel && rIdx === sel.r2
                const left   = inSel && cIdx === sel.c1
                const right  = inSel && cIdx === sel.c2

                const editingHere = !!editing && editing.r===rIdx && editing.c===cIdx
                const val = row.cells[col.key] ?? ''

                const classes = ['tc-cell']
                if (inSel) classes.push('sel')
                if (top) classes.push('sel-top')
                if (bottom) classes.push('sel-bottom')
                if (left) classes.push('sel-left')
                if (right) classes.push('sel-right')

                if (editingHere){
                  // number: input, text: textarea (støtter linjeskift)
                  if (col.type === 'number'){
                    return (
                      <div key={col.key} className={classes.join(' ')} data-cell data-r={rIdx} data-c={cIdx}>
                        <input
                          autoFocus
                          defaultValue={val as any}
                          ref={(el)=>{
                            if (!el) return
                            requestAnimationFrame(()=>{
                              if (editing!.mode.kind === 'selectAll'){ el.select() }
                              else if (editing!.mode.kind === 'caretEnd'){
                                const end = el.value.length; el.setSelectionRange(end, end)
                              }
                            })
                          }}
                          onBlur={(e)=> commitEdit(rIdx, cIdx, e.currentTarget.value)}
                          onKeyDown={(e)=>{
                            if (e.key === 'Enter'){ e.preventDefault(); (e.target as HTMLInputElement).blur() }
                            if (e.key === 'Escape'){ e.preventDefault(); setEditing(null) }
                          }}
                          style={{ width:'100%', border:'none', outline:'none', background:'transparent' }}
                          type="number"
                        />
                      </div>
                    )
                  }
                  // tekstkolonner
                  return (
                    <div key={col.key} className={classes.join(' ')} data-cell data-r={rIdx} data-c={cIdx}>
                      <textarea
                        autoFocus
                        defaultValue={String(val)}
                        ref={(el)=>{
                          if (!el) return
                          requestAnimationFrame(()=>{
                            if (editing!.mode.kind === 'selectAll'){ el.select() }
                            else if (editing!.mode.kind === 'caretEnd'){
                              const end = el.value.length; el.setSelectionRange(end, end)
                            }
                          })
                        }}
                        onBlur={(e)=> commitEdit(rIdx, cIdx, e.currentTarget.value)}
                        onKeyDown={(e)=>{
                          // Linjeskift i celle
                          if (e.key === 'Enter' && (e.shiftKey || e.altKey)){
                            e.preventDefault()
                            const ta = e.currentTarget
                            const start = ta.selectionStart ?? ta.value.length
                            const end = ta.selectionEnd ?? ta.value.length
                            const next = ta.value.slice(0, start) + '\n' + ta.value.slice(end)
                            ta.value = next
                            const pos = start + 1
                            requestAnimationFrame(()=> ta.setSelectionRange(pos, pos))
                            return
                          }
                          // Vanlig Enter = commit
                          if (e.key === 'Enter'){
                            e.preventDefault()
                            e.currentTarget.blur()
                            return
                          }
                          if (e.key === 'Escape'){ e.preventDefault(); setEditing(null) }
                        }}
                        style={{ width:'100%', border:'none', outline:'none', background:'transparent', resize:'vertical', minHeight:'24px' }}
                      />
                    </div>
                  )
                }

                return (
                  <div
                    key={col.key}
                    className={classes.join(' ')}
                    data-cell data-r={rIdx} data-c={cIdx}
                    onMouseDown={onCellMouseDown(rIdx,cIdx)}
                    onDoubleClick={onCellDoubleClick(rIdx,cIdx)}
                    title={typeof val === 'number' ? String(val) : (val as string)}
                  >
                    {col.isTitle ? (
                      <span className="tc-title">
                        <span className="tc-indent" style={{ ['--lvl' as any]: row.indent }} />
                        <span>{String(val)}</span>
                      </span>
                    ) : (
                      <span>{typeof val === 'number' ? String(val) : String(val)}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
