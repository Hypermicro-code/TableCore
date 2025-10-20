import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ColumnDef, RowData, Selection, TableCoreProps, CellValue } from './TableTypes'
import { parseClipboard, toTSV } from './utils/clipboard'
import '../styles/tablecore.css'

function clamp(n:number,a:number,b:number){return Math.max(a,Math.min(b,n))}
function isNumericColumn(col: ColumnDef){return col.type==='number'}
function isDateColumn(col: ColumnDef){return col.type==='date'||col.type==='datetime'}
function rowHasContent(row:RowData,cols:ColumnDef[]){return cols.some(c=>c.key!=='#' && row.cells[c.key])}
function makeGridTemplate(cols:ColumnDef[]){return ['48px',...cols.map(c=>c.width?`${c.width}px`:'minmax(120px,1fr)')].join(' ')}

const DRAG_THRESHOLD_PX = 4
const NOSEL: Selection = { r1:-1, c1:-1, r2:-1, c2:-1 }
const hasSel = (s:Selection)=> s.r1>=0 && s.c1>=0 && s.r2>=0 && s.c2>=0

type EditMode = 'replace'|'caretEnd'|'selectAll'
type EditingState = { r:number, c:number, mode:EditMode, seed?: string } | null

// ===== Dato-hjelpere =====
const toDateMs = (v:CellValue): number | null => {
  if (typeof v === 'number') { const d = new Date(v); return isNaN(+d) ? null : +d }
  if (typeof v === 'string' && v.trim()){ const d = new Date(v); return isNaN(+d) ? null : +d }
  return null
}
const fmtDate = (ms:number) => {
  const d = new Date(ms)
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}
const fmtDatetime = (ms:number) => {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2,'0'), mm = String(d.getMinutes()).padStart(2,'0')
  return `${fmtDate(ms)} ${hh}:${mm}`
}

// ===== ROLLUPS (bottom-up) =====
type Rollups = Map<number, Record<string, CellValue>>
type HasChildren = Set<number>

function computeRollups(rows: RowData[], columns: ColumnDef[]): { rollups: Rollups, hasChildren: HasChildren } {
  const childrenMap: Map<number, number[]> = new Map()
  const stack: Array<{ idx:number, indent:number }> = []
  for (let i=0;i<rows.length;i++){
    const indent = rows[i].indent
    while (stack.length && stack[stack.length-1].indent >= indent) stack.pop()
    const parentIdx = stack.length ? stack[stack.length-1].idx : -1
    if (parentIdx >= 0){
      if (!childrenMap.has(parentIdx)) childrenMap.set(parentIdx, [])
      childrenMap.get(parentIdx)!.push(i)
    }
    stack.push({ idx:i, indent })
  }
  const hasChildren: HasChildren = new Set(Array.from(childrenMap.keys()))
  const rollups: Rollups = new Map()
  for (let i=rows.length-1; i>=0; i--){
    const kids = childrenMap.get(i)
    if (!kids || kids.length===0) continue
    const rec: Record<string, CellValue> = {}
    for (const col of columns){
      if (col.isTitle) continue
      if (isNumericColumn(col)){
        let sum = 0
        for (const k of kids){
          const childAgg = rollups.get(k)
          if (childAgg && typeof childAgg[col.key] === 'number') sum += childAgg[col.key] as number
          else { const v = rows[k].cells[col.key]; if (typeof v==='number') sum += v }
        }
        rec[col.key] = sum
      } else if (isDateColumn(col)){
        let minMs: number | undefined, maxMs: number | undefined
        for (const k of kids){
          const childAgg = rollups.get(k)
          let childMin: number | null = null, childMax: number | null = null
          if (childAgg){
            const cMin = childAgg[`${col.key}__min_ms`], cMax = childAgg[`${col.key}__max_ms`]
            if (typeof cMin==='number') childMin=cMin
            if (typeof cMax==='number') childMax=cMax
          } else {
            const ms = toDateMs(rows[k].cells[col.key]); if (ms!=null){ childMin=ms; childMax=ms }
          }
          if (childMin!=null) minMs = (minMs===undefined)?childMin:Math.min(minMs,childMin)
          if (childMax!=null) maxMs = (maxMs===undefined)?childMax:Math.max(maxMs,childMax)
        }
        if (minMs!==undefined) rec[`${col.key}__min_ms`] = minMs
        if (maxMs!==undefined) rec[`${col.key}__max_ms`] = maxMs
        if (!col.dateRole){
          if (minMs!==undefined && maxMs!==undefined){
            rec[col.key] = col.type==='date'
              ? (minMs===maxMs ? fmtDate(minMs) : `${fmtDate(minMs)} → ${fmtDate(maxMs)}`)
              : (minMs===maxMs ? fmtDatetime(minMs) : `${fmtDatetime(maxMs)}`)
          } else rec[col.key] = ''
        }
      }
    }
    rollups.set(i, rec)
  }
  return { rollups, hasChildren }
}

export default function TableCore(props:TableCoreProps){
  const { columns, rows, onChange, showSummary=false, summaryValues, summaryTitle='Sammendrag', ui } = props

  // kolonner og data i lokal state
  const [cols, setCols] = useState<ColumnDef[]>(columns)
  useEffect(()=>setCols(columns),[columns])

  const [data,setData]=useState<RowData[]>(rows)
  useEffect(()=>setData(rows),[rows])
  const setAndPropagate=useCallback((next:RowData[])=>{setData(next);onChange(next)},[onChange])

  // selection / editing
  const [sel,setSel]=useState<Selection>(NOSEL)
  const [editing,setEditing]=useState<EditingState>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [rowDropHint, setRowDropHint] = useState<{ idx:number, after:boolean } | null>(null)

  const rootRef=useRef<HTMLDivElement|null>(null)
  const dragState=useRef<{active:boolean,dragging:boolean,r0:number,c0:number,x0:number,y0:number}|null>(null)
  const suppressClickToEditOnce=useRef(false)
  const skipBlurCommit=useRef(false)
  const dataRef=useRef(data);useEffect(()=>{dataRef.current=data},[data])
  const colsRef=useRef(cols);useEffect(()=>{colsRef.current=cols},[cols])

  // ====== UI-variabler fra app (valgfritt)
  const rootStyleVars = useMemo(()=>({
    ...(ui?.fontSizePx ? {'--tc-font-size': `${ui.fontSizePx}px`} : {}),
    ...(ui?.rowHeightPx ? {'--tc-row-h': `${ui.rowHeightPx}px`} : {}),
    ...(ui?.colors?.bg       ? {'--tc-bg': ui.colors.bg} : {}),
    ...(ui?.colors?.fg       ? {'--tc-fg': ui.colors.fg} : {}),
    ...(ui?.colors?.grid     ? {'--tc-grid': ui.colors.grid} : {}),
    ...(ui?.colors?.accent   ? {'--tc-accent': ui.colors.accent} : {}),
    ...(ui?.colors?.sel      ? {'--tc-sel': ui.colors.sel} : {}),
    ...(ui?.colors?.selBorder? {'--tc-sel-border': ui.colors.selBorder} : {}),
    ...(ui?.colors?.editBg   ? {'--tc-edit-bg': ui.colors.editBg} : {}),
  }) as React.CSSProperties,[ui])

  const commitEdit=(r:number,c:number,val:string)=>{
    const col=colsRef.current[c]
    const parsed:CellValue=isNumericColumn(col)?(val===''?'':Number(val)):val
    const next=dataRef.current.map((row,i)=>i===r?{...row,cells:{...row.cells,[col.key]:parsed}}:row)
    setAndPropagate(next); setEditing(null)
  }

  // ===== Hjelpere for hierarki-blokk
  const blockOf = (idx:number) => {
    const arr = dataRef.current
    const baseIndent = arr[idx]?.indent ?? 0
    let end = idx
    for (let i=idx+1;i<arr.length;i++){
      if (arr[i].indent<=baseIndent) break
      end = i
    }
    return { start: idx, end, baseIndent }
  }
  const isInsideBlock = (idx:number, s:number, e:number) => idx>=s && idx<=e

  // Søsken-område
  const siblingRange = (idx:number) => {
    const arr = dataRef.current
    const L = arr[idx]?.indent ?? 0
    let start = idx
    for (let i=idx-1;i>=0;i--){
      if (arr[i].indent < L){ start = i+1; break }
      if (i===0) start = 0
    }
    let end = idx
    for (let i=idx+1;i<arr.length;i++){
      if (arr[i].indent < L){ end = i-1; break }
      if (i===arr.length-1) end = i
    }
    return { start, end, level: L }
  }

  // ==== ROLLUPS + synlighet
  const { rollups, hasChildren } = useMemo(()=> computeRollups(data, cols), [data, cols])

  const visibleRowIndices = useMemo(()=>{
    const result:number[] = []
    const st: Array<{ id:string, indent:number, collapsed:boolean }> = []
    for (let i=0;i<data.length;i++){
      const row = data[i]
      while (st.length && st[st.length-1].indent >= row.indent) st.pop()
      const hidden = st.some(a=>a.collapsed)
      if (!hidden) result.push(i)
      const isParent = hasChildren.has(i)
      st.push({ id: row.id, indent: row.indent, collapsed: isParent ? collapsed.has(row.id) : false })
    }
    return result
  }, [data, hasChildren, collapsed])

  const nextPosAfter = (r:number,c:number,dir:'down'|'up'|'right'|'left')=>{
    const visible = visibleRowIndices
    const idxInVisible = visible.indexOf(r)
    const colMax=colsRef.current.length-1
    if (idxInVisible === -1){
      const nearest = visible.find(v=>v>=r) ?? visible[visible.length-1]
      return { r: nearest ?? r, c }
    }
    let vi = idxInVisible
    if(dir==='down') vi = Math.min(visible.length-1, vi+1)
    if(dir==='up')   vi = Math.max(0, vi-1)
    if(dir==='right'){
      let cc = c+1, rr = r
      if (cc>colMax){ cc=0; vi = Math.min(visible.length-1, vi+1); rr = visible[vi] }
      return { r: rr, c: cc }
    }
    if(dir==='left'){
      let cc = c-1, rr = r
      if (cc<0){ cc=colMax; vi = Math.max(0, vi-1); rr = visible[vi] }
      return { r: rr, c: cc }
    }
    return { r: visible[vi], c }
  }

  // ==== Inn/utrykk (låst begrensning) ====
  const indentRow=(rowIdx:number,delta:number)=>{
    const arr = dataRef.current
    const cur = arr[rowIdx]; if(!cur) return
    const prevIndent = rowIdx>0 ? arr[rowIdx-1].indent : 0
    const maxIndent = prevIndent + 1
    const desired = cur.indent + delta
    const nextIndent = clamp(desired, 0, maxIndent)
    if (nextIndent === cur.indent) return
    setAndPropagate(arr.map((r,i)=> i===rowIdx ? { ...r, indent: nextIndent } : r))
  }

  // ==== Tastnavigasjon (låst) ====
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const colMax=colsRef.current.length-1
      if(e.altKey&&!e.shiftKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
        if(!hasSel(sel)) return; e.preventDefault(); indentRow(sel.r1,e.key==='ArrowRight'?1:-1); return
      }
      if(!editing){
        if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','Enter'].includes(e.key)){
          if(!hasSel(sel)) return
          e.preventDefault()
          let r=sel.r1,c=sel.c1
          if(e.key==='ArrowUp')  r = nextPosAfter(r,c,'up').r
          if(e.key==='ArrowDown')r = nextPosAfter(r,c,'down').r
          if(e.key==='ArrowLeft')c = clamp(c-1,0,colMax)
          if(e.key==='ArrowRight')c = clamp(c+1,0,colMax)
          if(e.key==='Tab'){ const n = nextPosAfter(r,c, e.shiftKey ? 'left':'right'); r=n.r; c=n.c }
          if(e.key==='Enter'){ const n = nextPosAfter(r,c, e.shiftKey ? 'up':'down'); r=n.r; c=n.c }
          setSel({r1:r,r2:r,c1:c,c2:c}); return
        }
        if(e.key.length===1 && !e.ctrlKey && !e.metaKey){
          if(!hasSel(sel)) return; e.preventDefault()
          setEditing({ r: sel.r1, c: sel.c1, mode:'replace', seed:e.key }); return
        }
        if(e.key==='F2'){
          if(!hasSel(sel)) return; e.preventDefault()
          setEditing({ r: sel.r1, c: sel.c1, mode:'caretEnd' }); return
        }
      }
    }
    document.addEventListener('keydown',onKey,true)
    return()=>document.removeEventListener('keydown',onKey,true)
  },[editing, sel])

  // ==== Mus-seleksjon (låst) ====
  const setGlobalNoSelect=(on:boolean)=>{ const el=rootRef.current; if(!el)return; el.classList.toggle('tc-noselect',on) }
  const onCellMouseDown=(r:number,c:number)=>(ev:React.MouseEvent)=>{ setSel({r1:r,r2:r,c1:c,c2:c}); dragState.current={active:true,dragging:false,r0:r,c0:c,x0:ev.clientX,y0:ev.clientY} }
  const onMouseMove=(ev:React.MouseEvent)=>{
    if(!dragState.current||!dragState.current.active)return
    const dx=ev.clientX-dragState.current.x0,dy=ev.clientY-dragState.current.y0
    if(!dragState.current.dragging&&(dx*dx+dy*dy)>DRAG_THRESHOLD_PX*DRAG_THRESHOLD_PX){ dragState.current.dragging=true; setGlobalNoSelect(true) }
    if(!dragState.current.dragging)return
    const tgt=(ev.target as HTMLElement).closest('[data-cell]') as HTMLElement|null; if(!tgt)return
    const r=Number(tgt.getAttribute('data-r')),c=Number(tgt.getAttribute('data-c'))
    setSel({r1:Math.min(r,dragState.current.r0),r2:Math.max(r,dragState.current.r0),c1:Math.min(c,dragState.current.c0),c2:Math.max(c,dragState.current.c0)})
  }
  const onMouseUp=()=>{ if(!dragState.current)return; const wasDragging=dragState.current.dragging; dragState.current.active=false; dragState.current.dragging=false; setGlobalNoSelect(false); if(suppressClickToEditOnce.current){suppressClickToEditOnce.current=false;return} if(!wasDragging){} }
  const onCellDoubleClick=(r:number,c:number)=>(ev:React.MouseEvent)=>{ ev.preventDefault(); suppressClickToEditOnce.current=true; setEditing({ r, c, mode:'selectAll' }) }

  // ==== Aggregat-visning ====
  const isAggregatedCell = (rowIndex:number, col: ColumnDef) => {
    if (!hasChildren.has(rowIndex)) return false
    if (col.isTitle) return false
    return isNumericColumn(col) || isDateColumn(col)
  }
  const displayValue = (rowIndex:number, col: ColumnDef, stored: CellValue): CellValue => {
    if (!isAggregatedCell(rowIndex, col)) return stored
    const rec = rollups.get(rowIndex); if (!rec) return stored
    if (isDateColumn(col)){
      const keyMin = `${col.key}__min_ms`, keyMax = `${col.key}__max_ms`
      const minMs = typeof rec[keyMin] === 'number' ? (rec[keyMin] as number) : undefined
      const maxMs = typeof rec[keyMax] === 'number' ? (rec[keyMax] as number) : undefined
      if (col.dateRole === 'start' && minMs !== undefined) return col.type==='date' ? fmtDate(minMs) : fmtDatetime(minMs)
      if (col.dateRole === 'end' && maxMs !== undefined)   return col.type==='date' ? fmtDate(maxMs) : fmtDatetime(maxMs)
      const auto = rec[col.key]; return auto !== undefined ? auto : stored
    }
    return rec[col.key] !== undefined ? rec[col.key]! : stored
  }

  // ==== Clipboard (låst) ====
  const onCopy=(e:React.ClipboardEvent)=>{
    if(!hasSel(sel)) return
    const {c1,c2}=sel
    const m:(string|number|'')[][]=[]
    for (const r of visibleRowIndices){
      if (r<sel.r1 || r>sel.r2) continue
      const row=data[r]; const line:(string|number|'')[]=[]
      for(let c=c1;c<=c2;c++){
        const col=cols[c]; const stored = row.cells[col.key] ?? ''
        line.push(displayValue(r,col,stored) as any)
      }
      m.push(line)
    }
    if (m.length){ e.clipboardData.setData('text/plain',toTSV(m)); e.preventDefault() }
  }
  const onPaste=(e:React.ClipboardEvent)=>{
    if(!hasSel(sel)) return
    const txt=e.clipboardData.getData('text/plain'); if(!txt) return
    e.preventDefault()
    const m=parseClipboard(txt); const next=data.slice()
    const startIdxInVisible = visibleRowIndices.indexOf(sel.r1)
    if (startIdxInVisible === -1) return
    for(let i=0;i<m.length;i++){
      const visRow = visibleRowIndices[startIdxInVisible + i]
      if (visRow === undefined) break
      for(let j=0;j<m[i].length;j++){
        const cc=sel.c1+j; if(cc>=cols.length)break
        const col=cols[cc]
        if (isAggregatedCell(visRow, col)) continue
        const raw=m[i][j]
        next[visRow].cells[col.key] = isNumericColumn(col) ? (raw===''?'':Number(raw)) : raw
      }
    }
    setAndPropagate(next)
  }

  // ==== Sammendrag (låst) ====
  const sums=useMemo(()=>{
    if(!showSummary||summaryValues)return null
    const s:Record<string,CellValue>={}
    cols.forEach(c=>{if(isNumericColumn(c)&&c.summarizable)s[c.key]=0})
    data.forEach(r=>cols.forEach(c=>{
      if(isNumericColumn(c)&&c.summarizable){
        const v=r.cells[c.key]; if(typeof v==='number') s[c.key]=(s[c.key] as number)+v
      }}))
    const t=cols.findIndex(c=>c.isTitle); if(t>=0) s[cols[t].key]=summaryTitle
    return s
  },[showSummary,summaryValues,cols,data,summaryTitle])

  // ==== Collapse (låst inkl. Alt-kaskade) ====
  const toggleCollapse = (rowId:string, cascadeIds: string[] = []) => {
    setCollapsed(prev=>{
      const n = new Set(prev)
      const willCollapse = !n.has(rowId)
      if (willCollapse) n.add(rowId); else n.delete(rowId)
      if (cascadeIds.length){ for (const cid of cascadeIds){ if (willCollapse) n.add(cid); else n.delete(cid) } }
      return n
    })
  }

  // ======== KOLONNE-DRAG (uendret) ========
  const onHeaderDragStart = (idx:number)=>(e:React.DragEvent)=>{ e.dataTransfer.setData('text/x-col-index', String(idx)); e.dataTransfer.effectAllowed = 'move' }
  const onHeaderDragOver = (idx:number)=>(e:React.DragEvent)=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  const onHeaderDrop = (idx:number)=>(e:React.DragEvent)=>{
    e.preventDefault()
    const fromStr = e.dataTransfer.getData('text/x-col-index'); if (fromStr==='') return
    const from = Number(fromStr); if (Number.isNaN(from) || from===idx) return
    const next = colsRef.current.slice(); const [moved] = next.splice(from,1); next.splice(idx,0,moved); setCols(next)
    setSel(s=>{
      if(!hasSel(s)) return s
      const mapIndex = (old:number)=>{
        let arr = colsRef.current.slice(); const [mv] = arr.splice(from,1); arr.splice(idx,0,mv)
        return arr.findIndex(c=>c.key===colsRef.current[old].key)
      }
      return { r1:s.r1,r2:s.r2,c1:mapIndex(s.c1),c2:mapIndex(s.c2) }
    })
  }

  // ======== KOLONNE-RESIZE (innebygd) ========
  const resizeRef = useRef<{ idx:number, startX:number, startW:number }|null>(null)
  const onColResizeDown = (idx:number)=>(e:React.MouseEvent)=>{
    const hdrCells = rootRef.current?.querySelectorAll('.tc-header .tc-cell') as NodeListOf<HTMLElement> | null
    const guess = hdrCells ? hdrCells[idx+1]?.getBoundingClientRect().width : undefined
    const col = colsRef.current[idx]; const startW = col.width ?? guess ?? 120
    resizeRef.current = { idx, startX: e.clientX, startW }
    document.addEventListener('mousemove', onColResizeMove)
    document.addEventListener('mouseup', onColResizeUp, { once: true })
    e.preventDefault(); e.stopPropagation()
  }
  const onColResizeMove = (e:MouseEvent)=>{
    if(!resizeRef.current) return
    const { idx, startX, startW } = resizeRef.current
    const dx = e.clientX - startX
    const newW = clamp(Math.round(startW + dx), 60, 1000)
    const next = colsRef.current.slice()
    next[idx] = { ...next[idx], width: newW }
    setCols(next)
  }
  const onColResizeUp = ()=>{
    document.removeEventListener('mousemove', onColResizeMove)
    resizeRef.current = null
  }

  // ======== RAD-DRAG (blokk, samme nivå, over/under) ========
  const onRowDragStart = (rowIdx:number)=>(e:React.DragEvent)=>{ e.dataTransfer.setData('text/x-row-index', String(rowIdx)); e.dataTransfer.effectAllowed = 'move'; setRowDropHint(null) }
  const onRowDragEnd = () => { setRowDropHint(null) }
  const onRowDragOver = (rowIdx:number)=>(e:React.DragEvent)=>{
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const fromStr = e.dataTransfer.getData('text/x-row-index')
    if (!fromStr) { setRowDropHint(null); return }
    const from = Number(fromStr)
    if (Number.isNaN(from)) { setRowDropHint(null); return }
    const arr = dataRef.current
    const { start: sA, end: eA, baseIndent: L } = blockOf(from)
    if (!arr[rowIdx] || arr[rowIdx].indent !== L || (rowIdx>=sA && rowIdx<=eA)) { setRowDropHint(null); return }
    const rowEl = (rootRef.current)?.querySelector(`.tc-row[data-r="${rowIdx}"]`) as HTMLElement | null
    if (!rowEl) { setRowDropHint(null); return }
    const rect = rowEl.getBoundingClientRect()
    const after = (e.clientY > rect.top + rect.height/2)
    setRowDropHint({ idx: rowIdx, after })
  }
  const onRowDrop = (rowIdx:number)=>(e:React.DragEvent)=>{
    e.preventDefault()
    const fromStr = e.dataTransfer.getData('text/x-row-index'); if (fromStr==='') { setRowDropHint(null); return }
    const from = Number(fromStr); if (Number.isNaN(from) || from===rowIdx) { setRowDropHint(null); return }
    const arr = dataRef.current.slice()
    const { start: sA, end: eA, baseIndent: L } = blockOf(from)
    if (rowIdx>=sA && rowIdx<=eA) { setRowDropHint(null); return }
    if (arr[rowIdx]?.indent !== L) { setRowDropHint(null); return }
    let placeAfterTargetBlock = false
    const rowEl = (rootRef.current)?.querySelector(`.tc-row[data-r="${rowIdx}"]`) as HTMLElement | null
    if (rowEl){
      const rect = rowEl.getBoundingClientRect()
      placeAfterTargetBlock = (e.clientY > rect.top + rect.height/2)
    } else if (rowDropHint && rowDropHint.idx===rowIdx){
      placeAfterTargetBlock = rowDropHint.after
    }
    const blockOfLocal = (idx:number) => {
      const baseIndent = arr[idx]?.indent ?? 0
      let end = idx
      for (let i=idx+1;i<arr.length;i++){
        if (arr[i].indent<=baseIndent) break
        end = i
      }
      return { start: idx, end, baseIndent }
    }
    const { start: sB, end: eB } = blockOfLocal(rowIdx)
    let insertAt = placeAfterTargetBlock ? eB + 1 : sB
    const blockA = arr.slice(sA, eA+1)
    arr.splice(sA, blockA.length)
    if (insertAt > sA) insertAt -= blockA.length
    arr.splice(insertAt, 0, ...blockA)
    setAndPropagate(arr)
    setSel({ r1: insertAt, r2: insertAt, c1: sel.c1, c2: sel.c1 })
    setRowDropHint(null)
  }

  const gridCols = useMemo(()=>makeGridTemplate(cols),[cols])

  return (
  <div ref={rootRef} className="tc-root" style={rootStyleVars} onCopy={onCopy} onPaste={onPaste}>
    <div className="tc-wrap" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      {/* header */}
      <div className="tc-header" style={{gridTemplateColumns:gridCols}}>
        <div className="tc-cell tc-idx">#</div>
        {cols.map((col, idx)=>
          <div
            key={col.key}
            className="tc-cell tc-header-cell"
            draggable
            onDragStart={(e)=>{ onHeaderDragStart(idx)(e) }}
            onDragOver={(e)=>{ onHeaderDragOver(idx)(e) }}
            onDrop={(e)=>{ onHeaderDrop(idx)(e) }}
            title="Dra for å flytte kolonne"
          >
            <span className="tc-header-label">{col.title}</span>
            <span
              className="tc-col-resizer"
              onMouseDown={onColResizeDown(idx)}
              title="Dra for å endre bredde"
            />
          </div>
        )}
      </div>

      {/* summary */}
      {showSummary&&(()=>{
        if(summaryValues){
          return (
            <div className="tc-row tc-summary" style={{gridTemplateColumns:gridCols}}>
              <div className="tc-cell tc-idx"></div>
              {cols.map(col=><div key={col.key} className="tc-cell">{String(summaryValues[col.key]??'')}</div>)}
            </div>
          )
        }
        const s:Record<string,CellValue>={}
        cols.forEach(c=>{if(isNumericColumn(c)&&c.summarizable)s[c.key]=0})
        data.forEach(r=>cols.forEach(c=>{
          if(isNumericColumn(c)&&c.summarizable){ const v=r.cells[c.key]; if(typeof v==='number')s[c.key]=(s[c.key] as number)+v }
        }))
        const t=cols.findIndex(c=>c.isTitle);if(t>=0)s[cols[t].key]=summaryTitle
        return (
          <div className="tc-row tc-summary" style={{gridTemplateColumns:gridCols}}>
            <div className="tc-cell tc-idx"></div>
            {cols.map(col=><div key={col.key} className="tc-cell">{String(s[col.key]??'')}</div>)}
          </div>
        )
      })()}

      {/* rows – kun synlige */}
      {visibleRowIndices.map((rVisibleIdx, visiblePos)=>{
        const row = data[rVisibleIdx]
        const showIndex=rowHasContent(row,cols)
        const isParent = computeRollups(data, cols).hasChildren.has(rVisibleIdx)
        const isCollapsed = isParent && collapsed.has(row.id)

        const rowClasses = ['tc-row']
        if (isParent) rowClasses.push('tc-parent')
        if (row.indent>0) rowClasses.push('tc-child')
        if (rowDropHint && rowDropHint.idx===rVisibleIdx){
          rowClasses.push(rowDropHint.after ? 'tc-drop-after' : 'tc-drop-before')
        }

        return(
        <div key={row.id} className={rowClasses.join(' ')} style={{gridTemplateColumns:gridCols}} data-r={rVisibleIdx}
             onDragOver={onRowDragOver(rVisibleIdx)} onDrop={onRowDrop(rVisibleIdx)}>
          {/* # kolonne = drag handle for blokk */}
          <div
            className="tc-cell tc-idx tc-row-handle"
            draggable
            onDragStart={onRowDragStart(rVisibleIdx)}
            onDragEnd={()=>setRowDropHint(null)}
            title="Dra for å flytte rad (innen samme innrykk)"
          >
            {showIndex? visiblePos+1 : ''}
          </div>

          {cols.map((col,cIdx)=>{
            const inSel = hasSel(sel) && rVisibleIdx>=sel.r1&&rVisibleIdx<=sel.r2&&cIdx>=sel.c1&&cIdx<=sel.c2
            const top=inSel&&rVisibleIdx===sel.r1,bottom=inSel&&rVisibleIdx===sel.r2,left=inSel&&cIdx===sel.c1,right=inSel&&cIdx===sel.c2
            const classes=['tc-cell']; if(inSel)classes.push('sel'); if(top)classes.push('sel-top'); if(bottom)classes.push('sel-bottom'); if(left)classes.push('sel-left'); if(right)classes.push('sel-right')

            const storedVal = row.cells[col.key] ?? ''
            const shownVal = displayValue(rVisibleIdx, col, storedVal)
            const canEditThisCell = !(isAggregatedCell(rVisibleIdx, col))
            const editingHere = !!editing && editing.r===rVisibleIdx && editing.c===cIdx && canEditThisCell
            const titleAttr = String(shownVal)

            const maybeDisclosure = (col.isTitle && isParent) ? (
              <button
                className="tc-disc"
                aria-label={isCollapsed ? 'Utvid' : 'Skjul'}
                onMouseDown={(e)=>{e.stopPropagation()}}
                onClick={(e)=>{
                  e.stopPropagation(); e.preventDefault()
                  const isAlt = (e as React.MouseEvent).altKey
                  if (isAlt){
                    const ids:string[] = []
                    const startIndent = row.indent
                    for (let i=rVisibleIdx+1;i<data.length;i++){
                      const rr = data[i]
                      if (rr.indent <= startIndent) break
                      if (computeRollups(data, cols).hasChildren.has(i)) ids.push(rr.id)
                    }
                    const willCollapse = !collapsed.has(row.id)
                    setCollapsed(prev=>{
                      const n = new Set(prev)
                      if (willCollapse){ n.add(row.id); ids.forEach(id=>n.add(id)) }
                      else { n.delete(row.id); ids.forEach(id=>n.delete(id)) }
                      return n
                    })
                  } else {
                    toggleCollapse(row.id)
                  }
                }}
              >
                {isCollapsed ? '▶' : '▼'}
              </button>
            ) : null

            if(editingHere){
              classes.push('editing')
              const handleCommitMove = (value:string, key:string, _isTextarea:boolean, e:React.KeyboardEvent)=>{
                const dir = key==='Enter' ? (e.shiftKey ? 'up' : 'down') : key==='Tab' ? (e.shiftKey ? 'left' : 'right') : null
                if(!dir) return
                e.preventDefault(); skipBlurCommit.current = true
                commitEdit(rVisibleIdx,cIdx,value)
                const next = nextPosAfter(rVisibleIdx,cIdx,dir); setSel({r1:next.r,r2:next.r,c1:next.c,c2:next.c})
              }
              if(isNumericColumn(col)){
                const seed = editing!.seed && /[0-9\-\.,]/.test(editing!.seed) ? editing!.seed : ''
                const def = editing!.mode==='replace' ? seed : String(storedVal)
                return(
                  <div key={col.key} className={classes.join(' ')} data-cell data-r={rVisibleIdx} data-c={cIdx}>
                    <input
                      autoFocus defaultValue={def}
                      ref={el=>{ if(!el)return; requestAnimationFrame(()=>{ if(editing!.mode==='selectAll')el.select(); else { const e=el.value.length; el.setSelectionRange(e,e) } }) }}
                      onBlur={e=>{ if(skipBlurCommit.current){ skipBlurCommit.current=false; return } commitEdit(rVisibleIdx,cIdx,e.currentTarget.value) }}
                      onKeyDown={e=>{ if(e.key==='Enter'||e.key==='Tab'){ handleCommitMove((e.target as HTMLInputElement).value,e.key,false,e); return } if(e.key==='Escape'){ e.preventDefault(); setEditing(null) } }}
                      type="number"
                    />
                  </div>
                )
              } else {
                const def = editing!.mode==='replace' ? (editing!.seed ?? '') : String(storedVal)
                return(
                  <div key={col.key} className={classes.join(' ')} data-cell data-r={rVisibleIdx} data-c={cIdx}>
                    <textarea
                      autoFocus defaultValue={def}
                      ref={el=>{ if(!el)return; requestAnimationFrame(()=>{ if(editing!.mode==='selectAll')el.select(); else { const e=el.value.length; el.setSelectionRange(e,e) } }) }}
                      onBlur={e=>{ if(skipBlurCommit.current){ skipBlurCommit.current=false; return } commitEdit(rVisibleIdx,cIdx,e.currentTarget.value) }}
                      onKeyDown={e=>{
                        if(e.key==='Enter' && e.altKey){
                          e.preventDefault()
                          const ta=e.currentTarget; const pos=ta.selectionStart??ta.value.length
                          ta.value=ta.value.slice(0,pos)+'\n'+ta.value.slice(pos); ta.setSelectionRange(pos+1,pos+1); return
                        }
                        if(e.key==='Enter'||e.key==='Tab'){ handleCommitMove((e.target as HTMLTextAreaElement).value,e.key,true,e); return }
                        if(e.key==='Escape'){ e.preventDefault(); setEditing(null) }
                      }}
                    />
                  </div>
                )
              }
            }

            return(
            <div key={col.key}
              className={classes.join(' ')}
              data-cell data-r={rVisibleIdx} data-c={cIdx}
              onMouseDown={onCellMouseDown(rVisibleIdx,cIdx)}
              onDoubleClick={onCellDoubleClick(rVisibleIdx,cIdx)}
              title={titleAttr}>
              {col.isTitle?
                <span className="tc-title">
                  <span className="tc-indent" style={{['--lvl' as any]:row.indent}}/>
                  {maybeDisclosure}
                  <span>{String(shownVal)}</span>
                </span>
              : <span>{String(shownVal)}</span>}
            </div>)
          })}
        </div>)
      })}
    </div>
  </div>)
}
