import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ColumnDef, RowData, Selection, TableCoreProps, CellValue } from './TableTypes'
import { parseClipboard, toTSV } from './utils/clipboard'
import '../styles/tablecore.css'

function clamp(n:number,a:number,b:number){return Math.max(a,Math.min(b,n))}
function isNumericColumn(col: ColumnDef){return col.type==='number'}
function isDateColumn(col: ColumnDef){return col.type==='date'||col.type==='datetime'}
function rowHasContent(row:RowData,cols:ColumnDef[]){return cols.some(c=>c.key!=='#' && row.cells[c.key])}

// === Grid template fra kolonner
function makeGridTemplate(cols:ColumnDef[]){return ['48px',...cols.map(c=>c.width?`${c.width}px`:'minmax(120px,1fr)')].join(' ')}

// === Selection utilities
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

// ===== ROLLUPS (bottom-up: parent = aggregat av UMIDDELBARE children) =====
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
          if (childAgg && typeof childAgg[col.key] === 'number'){
            sum += childAgg[col.key] as number
          } else {
            const v = rows[k].cells[col.key]
            if (typeof v === 'number') sum += v
          }
        }
        rec[col.key] = sum
      }
      else if (isDateColumn(col)){
        let minMs: number | undefined = undefined
        let maxMs: number | undefined = undefined

        for (const k of kids){
          const childAgg = rollups.get(k)
          let childMin: number | null = null
          let childMax: number | null = null

          if (childAgg){
            const cMin = childAgg[`${col.key}__min_ms`]
            const cMax = childAgg[`${col.key}__max_ms`]
            if (typeof cMin === 'number') childMin = cMin
            if (typeof cMax === 'number') childMax = cMax
          } else {
            const v = rows[k].cells[col.key]
            const ms = toDateMs(v)
            if (ms!=null){ childMin = ms; childMax = ms }
          }

          if (childMin!=null) minMs = (minMs===undefined) ? childMin : Math.min(minMs, childMin)
          if (childMax!=null) maxMs = (maxMs===undefined) ? childMax : Math.max(maxMs, childMax)
        }

        if (minMs!==undefined) rec[`${col.key}__min_ms`] = minMs
        if (maxMs!==undefined) rec[`${col.key}__max_ms`] = maxMs

        if (!col.dateRole){
          if (minMs!==undefined && maxMs!==undefined){
            rec[col.key] = col.type==='date'
              ? (minMs===maxMs ? fmtDate(minMs) : `${fmtDate(minMs)} → ${fmtDate(maxMs)}`)
              : (minMs===maxMs ? fmtDatetime(minMs) : `${fmtDatetime(minMs)} → ${fmtDatetime(maxMs)}`)
          } else {
            rec[col.key] = ''
          }
        }
      }
    }
    rollups.set(i, rec)
  }

  return { rollups, hasChildren }
}

export default function TableCore({columns,rows,onChange,showSummary=false,summaryValues,summaryTitle='Sammendrag'}:TableCoreProps){
  // === LOKAL kolonnerekkefølge (drag-n-drop) ===
  const [cols, setCols] = useState<ColumnDef[]>(columns)
  useEffect(()=>setCols(columns),[columns]) // hvis appen sender nye kolonner

  // === Data
  const [data,setData]=useState<RowData[]>(rows)
  useEffect(()=>setData(rows),[rows])
  const setAndPropagate=useCallback((next:RowData[])=>{setData(next);onChange(next)},[onChange])

  // === UI state
  const [sel,setSel]=useState<Selection>(NOSEL)
  const [editing,setEditing]=useState<EditingState>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // === Refs
  const rootRef=useRef<HTMLDivElement|null>(null)
  const dragState=useRef<{active:boolean,dragging:boolean,r0:number,c0:number,x0:number,y0:number}|null>(null)
  const suppressClickToEditOnce=useRef(false)
  const skipBlurCommit=useRef(false)
  const dataRef=useRef(data);useEffect(()=>{dataRef.current=data},[data])
  const colsRef=useRef(cols);useEffect(()=>{colsRef.current=cols},[cols])

  // ==== Commit + navi etter commit (låst) ====
  const commitEdit=(r:number,c:number,val:string)=>{
    const col=colsRef.current[c]
    const parsed:CellValue=isNumericColumn(col)?(val===''?'':Number(val)):val
    const next=dataRef.current.map((row,i)=>i===r?{...row,cells:{...row.cells,[col.key]:parsed}}:row)
    setAndPropagate(next); setEditing(null)
  }

  // ==== Hierarki: blokk-hjelpere (for rad-flytting innen nivå) ====
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

  const prevSiblingStart = (idx:number) => {
    const arr=dataRef.current
    const { baseIndent } = blockOf(idx)
    // finn starten på forrige blokk på samme indent og samme parentområde (ikke kryss oppover)
    for (let i=idx-1;i>=0;i--){
      if (arr[i].indent<baseIndent) return -1 // nådde parent – stopp
      if (arr[i].indent===baseIndent){
        // hopp til starten av denne blokka
        let s=i
        while (s-1>=0 && arr[s-1].indent>baseIndent) s--
        return s
      }
    }
    return -1
  }

  const nextSiblingStart = (idx:number) => {
    const arr=dataRef.current
    const { baseIndent, end } = blockOf(idx)
    // se fra første etter egen blokk
    for (let i=end+1;i<arr.length;i++){
      if (arr[i].indent<baseIndent) return -1 // nådde parent – stopp
      if (arr[i].indent===baseIndent) return i
    }
    return -1
  }

  // flytt en hel blokk opp/ned innen samme nivå
  const moveBlock = (idx:number, dir:-1|1) => {
    const arr = dataRef.current.slice()
    const { start, end, baseIndent } = blockOf(idx)
    const block = arr.slice(start, end+1)
    const targetStart = dir===-1 ? prevSiblingStart(start) : nextSiblingStart(start)
    if (targetStart<0) return

    // hvis vi skal ned: fjerne blokka først, så finne ny targetStart etter fjerning
    arr.splice(start, block.length)
    if (dir===1){
      // etter fjerning har indekser endret seg – finn ny posisjon å sette inn:
      // targetStart var i original; når vi fjernet [start..end], hvis start<targetStart
      // så flyttes targetStart opp med block.length
      const adjust = (start < targetStart) ? block.length : 0
      const insertAt = targetStart - adjust
      arr.splice(insertAt, 0, ...block)
      setAndPropagate(arr)
      setSel({ r1: insertAt, r2: insertAt, c1: sel.c1, c2: sel.c1 })
      return
    } else {
      // opp: targetStart er før, fjerning etterpå påvirker ikke posisjonen
      arr.splice(targetStart, 0, ...block)
      setAndPropagate(arr)
      setSel({ r1: targetStart, r2: targetStart, c1: sel.c1, c2: sel.c1 })
      return
    }
  }

  // ==== Neste pos etter commit, basert på synlige rader (låst + utvidet) ====
  // (vi gjenbruker synlighetslisten lenger nede)
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
      let cc = c+1
      let rr = r
      if (cc>colMax){ cc=0; vi = Math.min(visible.length-1, vi+1); rr = visible[vi] }
      return { r: rr, c: cc }
    }
    if(dir==='left'){
      let cc = c-1
      let rr = r
      if (cc<0){ cc=colMax; vi = Math.max(0, vi-1); rr = visible[vi] }
      return { r: rr, c: cc }
    }
    return { r: visible[vi], c }
  }

  // ==== Inn/utrykk (begrenset) ====
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

  // ==== Global key handler (låst + blokkflytt) ====
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const colMax=colsRef.current.length-1
      if(e.altKey&&e.shiftKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')){
        if(!hasSel(sel)) return
        e.preventDefault()
        moveBlock(sel.r1, e.key==='ArrowUp' ? -1 : 1)
        return
      }
      if(e.altKey&&!e.shiftKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
        if(!hasSel(sel)) return
        e.preventDefault()
        indentRow(sel.r1,e.key==='ArrowRight'?1:-1)
        return
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

  // ==== Mouse cell selection (låst) ====
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

  // ==== ROLLUPS + hvilke rader har barn ====
  const { rollups, hasChildren } = useMemo(()=> computeRollups(data, cols), [data, cols])

  // ==== Synlige rader (skjul descendants av kollapsede foreldre) ====
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

  // ==== Aggregert celle-sjekk + visningsverdi ====
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
      if (col.dateRole === 'start' && minMs !== undefined){
        return col.type==='date' ? fmtDate(minMs) : fmtDatetime(minMs)
      }
      if (col.dateRole === 'end' && maxMs !== undefined){
        return col.type==='date' ? fmtDate(maxMs) : fmtDatetime(maxMs)
      }
      const auto = rec[col.key]; return auto !== undefined ? auto : stored
    }
    return rec[col.key] !== undefined ? rec[col.key]! : stored
  }

  // ==== Clipboard: bruk synlige rader ====
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

  // ==== Sammendrag øverst (uendret) ====
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

  // === GRID COLUMNS (bruk lokal kolonnerekkefølge)
  const gridCols=useMemo(()=>makeGridTemplate(cols),[cols])

  // === Collapse toggle (inkl. Alt-kaskade som før)
  const getDescendantParentIds = useCallback((startIdx:number): string[]=>{
    const ids:string[] = []
    const startIndent = data[startIdx]?.indent ?? 0
    for (let i=startIdx+1;i<data.length;i++){
      const r = data[i]
      if (r.indent <= startIndent) break
      if (hasChildren.has(i)) ids.push(r.id)
    }
    return ids
  },[data, hasChildren])

  const toggleCollapse = (rowId:string, cascadeIds: string[] = []) => {
    setCollapsed(prev=>{
      const n = new Set(prev)
      const willCollapse = !n.has(rowId)
      if (willCollapse) n.add(rowId); else n.delete(rowId)
      if (cascadeIds.length){
        for (const cid of cascadeIds){
          if (willCollapse) n.add(cid); else n.delete(cid)
        }
      }
      return n
    })
  }

  // ======== KOLONNE-DRAG (header) ========
  const onHeaderDragStart = (idx:number)=>(e:React.DragEvent)=>{
    e.dataTransfer.setData('text/x-col-index', String(idx))
    e.dataTransfer.effectAllowed = 'move'
  }
  const onHeaderDragOver = (idx:number)=>(e:React.DragEvent)=>{
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const onHeaderDrop = (idx:number)=>(e:React.DragEvent)=>{
    e.preventDefault()
    const fromStr = e.dataTransfer.getData('text/x-col-index')
    if (fromStr==='') return
    const from = Number(fromStr)
    if (Number.isNaN(from) || from===idx) return
    const next = colsRef.current.slice()
    const [moved] = next.splice(from,1)
    next.splice(idx,0,moved)
    setCols(next)
    // juster selection kolonne hvis nødvendig
    setSel(s=>{
      if(!hasSel(s)) return s
      const mapIndex = (old:number)=>{
        // beregn ny posisjon til en kolonne etter flytting
        let arr = colsRef.current.slice()
        const [mv] = arr.splice(from,1)
        arr.splice(idx,0,mv)
        return arr.findIndex(c=>c.key===colsRef.current[old].key)
      }
      return { r1:s.r1,r2:s.r2,c1:mapIndex(s.c1),c2:mapIndex(s.c2) }
    })
  }

  // ======== RAD-DRAG (i #-kolonnen, blokkvis og nivåbegrenset) ========
  const onRowDragStart = (rowIdx:number)=>(e:React.DragEvent)=>{
    e.dataTransfer.setData('text/x-row-index', String(rowIdx))
    e.dataTransfer.effectAllowed = 'move'
  }
  const onRowDragOver = (rowIdx:number)=>(e:React.DragEvent)=>{
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const onRowDrop = (rowIdx:number)=>(e:React.DragEvent)=>{
    e.preventDefault()
    const fromStr = e.dataTransfer.getData('text/x-row-index')
    if (fromStr==='') return
    const from = Number(fromStr)
    if (Number.isNaN(from) || from===rowIdx) return

    // flytt blokk fra "from" til foran blokken som starter ved "rowIdx"
    const arr = dataRef.current.slice()
    const { start: sA, end: eA, baseIndent } = blockOf(from)

    // Mottaker må være i samme nivå og innen samme parentområde
    // Finn starten på mottakerblokka
    const { start: sB } = blockOf(rowIdx)

    // Sjekk at rowIdx ligger i samme parentområde og indent
    const sameLevel = (arr[sB]?.indent === baseIndent)
    if (!sameLevel){
      // ugyldig mål – ignorer
      return
    }
    // sjekk at sB ikke krysser ut av parent (dvs. mellom sA-sin parentgrense)
    // Dette er ivaretatt ved at vi tillater flytting bare innen samme indent og lar naturlige grenser stoppe.

    const blockA = arr.slice(sA, eA+1)
    // fjern A
    arr.splice(sA, blockA.length)
    // beregn ny sB etter fjerning:
    const insertAt = sB > sA ? sB - blockA.length : sB
    arr.splice(insertAt, 0, ...blockA)
    setAndPropagate(arr)
    setSel({ r1: insertAt, r2: insertAt, c1: sel.c1, c2: sel.c1 })
  }

  return (
  <div ref={rootRef} className="tc-root" onCopy={onCopy} onPaste={onPaste}>
    <div className="tc-wrap" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      {/* header */}
      <div className="tc-header" style={{gridTemplateColumns:gridCols}}>
        <div className="tc-cell tc-idx">#</div>
        {cols.map((col, idx)=>
          <div
            key={col.key}
            className="tc-cell tc-header-cell"
            draggable
            onDragStart={onHeaderDragStart(idx)}
            onDragOver={onHeaderDragOver(idx)}
            onDrop={onHeaderDrop(idx)}
            title="Dra for å flytte kolonne"
          >
            {col.title}
          </div>
        )}
      </div>

      {/* summary (uendret) */}
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
          if(isNumericColumn(c)&&c.summarizable){
            const v=r.cells[c.key]; if(typeof v==='number')s[c.key]=(s[c.key] as number)+v
          }}))
        const t=cols.findIndex(c=>c.isTitle);if(t>=0)s[cols[t].key]=summaryTitle
        return (
          <div className="tc-row tc-summary" style={{gridTemplateColumns:gridCols}}>
            <div className="tc-cell tc-idx"></div>
            {cols.map(col=><div key={col.key} className="tc-cell">{String(s[col.key]??'')}</div>)}
          </div>
        )
      })()}

      {/* rows – vis kun synlige */}
      {(()=> {
        // beregn synlige rader igjen (lokal scope)
        const visibleRowIndices = (() => {
          const result:number[] = []
          const st: Array<{ id:string, indent:number, collapsed:boolean }> = []
          for (let i=0;i<data.length;i++){
            const row = data[i]
            while (st.length && st[st.length-1].indent >= row.indent) st.pop()
            const hidden = st.some(a=>a.collapsed)
            if (!hidden) result.push(i)
            const isParent = (()=>{ // hasChildren for aktuell i:
              // rask test: finnes noen etterfølgende rad med indent > row.indent før indent <= row.indent?
              // men vi har allerede computeRollups -> hasChildren:
              return computeRollups(data, cols).hasChildren.has(i)
            })()
            st.push({ id: row.id, indent: row.indent, collapsed: isParent ? collapsed.has(row.id) : false })
          }
          return result
        })()

        return visibleRowIndices.map((rVisibleIdx, visiblePos)=>{
          const row = data[rVisibleIdx]
          const showIndex=rowHasContent(row,cols)
          const isParent = computeRollups(data, cols).hasChildren.has(rVisibleIdx)
          const isCollapsed = isParent && collapsed.has(row.id)

          const rowClasses = ['tc-row']
          if (isParent) rowClasses.push('tc-parent')
          if (row.indent>0) rowClasses.push('tc-child')

          return(
          <div key={row.id} className={rowClasses.join(' ')} style={{gridTemplateColumns:gridCols}}>
            {/* # kolonne: drag-handle for rad-blokk */}
            <div
              className="tc-cell tc-idx tc-row-handle"
              draggable
              onDragStart={onRowDragStart(rVisibleIdx)}
              onDragOver={onRowDragOver(rVisibleIdx)}
              onDrop={onRowDrop(rVisibleIdx)}
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
                      // kaskader samme state nedover
                      const ids:string[] = []
                      const startIndent = row.indent
                      for (let i=rVisibleIdx+1;i<data.length;i++){
                        const rr = data[i]
                        if (rr.indent <= startIndent) break
                        // parent her?
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
                        type="number" style={{width:'100%',border:'none',outline:'none',background:'transparent'}}
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
                        style={{width:'100%',border:'none',outline:'none',background:'transparent',resize:'vertical',minHeight:'22px'}}
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
        })
      })()}
    </div>
  </div>)
}
