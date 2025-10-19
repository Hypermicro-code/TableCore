// ==== [BLOCK: Imports] BEGIN ====
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ColumnDef, RowData, Selection, TableCoreProps, CellValue } from './TableTypes'
import { parseClipboard, toTSV } from './utils/clipboard'
import '../styles/tablecore.css'
// ==== [BLOCK: Imports] END ====

// ==== [BLOCK: Helpers] BEGIN ====
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
// ==== [BLOCK: Helpers] END ====

// ==== [BLOCK: Component] BEGIN ====
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

  // Markering / redigering
  const [sel, setSel] = useState<Selection>({r1:0,c1:0,r2:0,c2:0})
  const [editing, setEditing] = useState<{r:number, c:number} | null>(null)
  const dragState = useRef<{active:boolean, r0:number, c0:number} | null>(null)
  const clickTimer = useRef<number | null>(null)

  const setAndPropagate = useCallback((next: RowData[])=>{ setData(next); onChange(next) },[onChange])

  // ==== Inn/ut-rykk (Alt+pil) ====
  const indentRow = useCallback((rowIdx:number, delta:number)=>{
    setAndPropagate(data.map((r,i)=> i===rowIdx ? { ...r, indent: Math.max(0, r.indent + delta) } : r))
  },[data,setAndPropagate])

  // ==== Flytt rad (Alt+Shift+pil opp/ned) ====
  const moveRow = useCallback((rowIdx:number, dir:-1|1)=>{
    const target = rowIdx + dir
    if (target < 0 || target >= data.length) return
    const next = data.slice()
    const [spliced] = next.splice(rowIdx,1)
    next.splice(target,0,spliced)
    setAndPropagate(next)
    setSel(s=>({ ...s, r1:target, r2:target }))
  },[data,setAndPropagate])

  // ==== Tastaturnavigasjon ====
  const onKeyDown = useCallback((e: React.KeyboardEvent)=>{
    if (!document.activeElement) return

    // Alt+pil for inn/ut-rykk
    if (e.altKey && !e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')){
      e.preventDefault()
      const rowIdx = editing ? editing.r : sel.r1
      indentRow(rowIdx, e.key === 'ArrowRight' ? +1 : -1)
      return
    }

    // Alt+Shift+pil opp/ned for flytt rad
    if (e.altKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')){
      e.preventDefault()
      moveRow(sel.r1, e.key === 'ArrowUp' ? -1 : +1)
      return
    }

    // Navigasjon når vi IKKE er i redigering
    if (!editing){
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab' || e.key === 'Enter'){
        e.preventDefault()
        const rowMax = data.length - 1
        const colMax = columns.length - 1
        let r = sel.r1, c = sel.c1
        if (e.key === 'ArrowUp') r = clamp(r-1, 0, rowMax)
        if (e.key === 'ArrowDown') r = clamp(r+1, 0, rowMax)
        if (e.key === 'ArrowLeft') c = clamp(c-1, 0, colMax)
        if (e.key === 'ArrowRight') c = clamp(c+1, 0, colMax)
        if (e.key === 'Tab') c = (c+1) > colMax ? 0 : c+1
        if (e.key === 'Enter') r = (r+1) > rowMax ? rowMax : r+1
        setSel({r1:r,c1:c,r2:r,c2:c})
        return
      }
      // Start redigering direkte ved tegn
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey){
        e.preventDefault()
        setEditing({ r: sel.r1, c: sel.c1 })
      }
    }
  },[editing, sel, data.length, columns.length, indentRow, moveRow])

  // ==== Klikk/hold-dra for markering, klikk for redigering, dblklikk for selectAll ====
  const onCellMouseDown = (r:number, c:number) => (ev: React.MouseEvent) => {
    // Klikk/hold → start drag for multi-markering
    dragState.current = { active:true, r0:r, c0:c }
    setSel({ r1:r, c1:c, r2:r, c2:c })

    // Klikk → redigering (kort forsinkelse for å skille fra hold-dra)
    if (clickTimer.current) window.clearTimeout(clickTimer.current)
    clickTimer.current = window.setTimeout(()=>{
      if (dragState.current && dragState.current.active){
        // fortsatt drag, ikke gå i edit
      } else {
        setEditing({ r, c })
      }
    }, 140) as unknown as number
  }

  const onMouseMove = (ev: React.MouseEvent) => {
    if (!dragState.current || !dragState.current.active) return
    const target = (ev.target as HTMLElement).closest('[data-cell]') as HTMLElement | null
    if (!target) return
    const r = Number(target.getAttribute('data-r'))
    const c = Number(target.getAttribute('data-c'))
    setSel(sel => ({ r1: Math.min(sel.r1, r), c1: Math.min(sel.c1, c), r2: Math.max(sel.r2, r), c2: Math.max(sel.c2, c) }))
  }

  const onMouseUp = () => {
    if (dragState.current){ dragState.current.active = false }
  }

  const onCellDoubleClick = (r:number, c:number) => (ev: React.MouseEvent) => {
    ev.preventDefault()
    setEditing({ r, c })
  }

  // ==== Redigering ====
  const commitEdit = (r:number, c:number, value:string) => {
    const col = columns[c]
    const v: CellValue = (col.type === 'number') ? (value === '' ? '' : Number(value)) : value
    const next = data.map((row, i)=> i===r ? { ...row, cells: { ...row.cells, [col.key]: v } } : row)
    setAndPropagate(next)
    setEditing(null)
  }

  // ==== Clipboard: kopier/lim inn ====
  const onCopy = (e: React.ClipboardEvent) => {
    const { r1,c1,r2,c2 } = sel
    const matrix: (string|number|'')[][] = []
    for (let r=r1; r<=r2; r++){
      const row = data[r]
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
    const { r1, c1 } = sel
    const next = data.map(r=>({...r, cells: {...r.cells}}))
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

  // ==== Sammendragslinje – verdier fra app (summaryValues) eller fallback-sum ====
  const computedFallback = useMemo(()=>{
    if (!showSummary || summaryValues) return null
    const sums: Record<string, CellValue> = {}
    // Init bare numeriske summarizable
    for (const col of columns){
      if (isNumericColumn(col) && col.summarizable){ sums[col.key] = 0 }
    }
    for (const r of data){
      for (const col of columns){
        if (isNumericColumn(col) && col.summarizable){
          const v = r.cells[col.key]
          if (typeof v === 'number' && !Number.isNaN(v)){
            sums[col.key] = (typeof sums[col.key] === 'number' ? (sums[col.key] as number) : 0) + v
          }
        }
      }
    }
    // Sett tittel hvis tittelkolonne finnes
    const tCol = columns[titleColIndex]
    if (tCol){ sums[tCol.key] = (sums[tCol.key] ?? '') || summaryTitle }
    return sums
  }, [showSummary, summaryValues, columns, data, titleColIndex, summaryTitle])

  const summaryCells = summaryValues ?? computedFallback

  // Grid columns style
  const gridCols = useMemo(()=> makeGridTemplate(columns), [columns])

  // Render
  return (
    <div className="tc-root" onKeyDown={onKeyDown} onCopy={onCopy} onPaste={onPaste} tabIndex={0}>
      <div className="tc-wrap" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
        {/* Header */}
        <div className="tc-header" style={{ gridTemplateColumns: gridCols }}>
          <div className="tc-cell tc-idx">#</div>
          {columns.map((col)=> (
            <div key={col.key} className="tc-cell" title={col.title}>{col.title}</div>
          ))}
        </div>

        {/* Sammendragslinje – plassert mellom header og rad 1 */}
        {showSummary && summaryCells && (
          <div className="tc-row tc-summary" style={{ gridTemplateColumns: gridCols }}>
            {/* Indeks-cell: tom for å matche «vanlig rad», men uten nummer */}
            <div className="tc-cell tc-idx"></div>
            {columns.map((col, cIdx)=>{
              const v = summaryCells[col.key]
              const isTitle = !!col.isTitle
              // Ikke-redigerbar, samme visuelle struktur som rad
              return (
                <div key={col.key} className="tc-cell" title={typeof v === 'number' ? String(v) : (v as string)}>
                  {isTitle ? (
                    <span className="tc-title">
                      {/* Sammendrag har ikke hierarki – indent = 0 */}
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
                const isSel = rIdx>=sel.r1 && rIdx<=sel.r2 && cIdx>=sel.c1 && cIdx<=sel.c2
                const isEdge = isSel && (rIdx===sel.r1 || rIdx===sel.r2 || cIdx===sel.c1 || cIdx===sel.c2)
                const editingHere = editing && editing.r===rIdx && editing.c===cIdx
                const val = row.cells[col.key] ?? ''
                if (editingHere){
                  return (
                    <div key={col.key} className="tc-cell editing" data-cell data-r={rIdx} data-c={cIdx}>
                      <input
                        autoFocus
                        defaultValue={val as any}
                        onFocus={(e)=> e.currentTarget.select()}
                        onBlur={(e)=> commitEdit(rIdx, cIdx, e.currentTarget.value)}
                        onKeyDown={(e)=>{
                          if (e.key === 'Enter'){ e.preventDefault(); (e.target as HTMLInputElement).blur() }
                          if (e.key === 'Escape'){ e.preventDefault(); setEditing(null) }
                        }}
                        style={{ width:'100%', border:'none', outline:'none', background:'transparent' }}
                        type={col.type==='number' ? 'number' : 'text'}
                      />
                    </div>
                  )
                }

                // Ikke-redigerende visning
                return (
                  <div
                    key={col.key}
                    className={`tc-cell${isSel?' sel':''}${isEdge?' sel-edge':''}`}
                    data-cell data-r={rIdx} data-c={cIdx}
                    onMouseDown={onCellMouseDown(rIdx,cIdx)}
                    onDoubleClick={onCellDoubleClick(rIdx,cIdx)}
                    title={typeof val === 'number' ? String(val) : (val as string)}
                  >
                    {col.isTitle ? (
                      <span className="tc-title">
                        <span className="tc-indent" style={{ ['--lvl' as any]: row.indent }} />
                        <span>{val as any}</span>
                      </span>
                    ) : (
                      <span>{val as any}</span>
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
// ==== [BLOCK: Component] END ====
