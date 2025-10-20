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

// ===== ROLLUPS (parent-aggregat) =====
type Rollups = Map<number, Record<string, CellValue>>
type HasChildren = Set<number>

function computeRollups(rows: RowData[], columns: ColumnDef[]): { rollups: Rollups, hasChildren: HasChildren } {
  const rollups: Rollups = new Map()
  const hasChildren: HasChildren = new Set()
  const stack: Array<{ idx:number, indent:number }> = []
  const ensureRec = (idx:number) => { if (!rollups.has(idx)) rollups.set(idx, {}); return rollups.get(idx)! }

  for (let i=0;i<rows.length;i++){
    const curIndent = rows[i].indent
    while (stack.length && stack[stack.length-1].indent >= curIndent) stack.pop()

    for (const parent of stack){
      hasChildren.add(parent.idx)
      const rec = ensureRec(parent.idx)
      for (const col of columns){
        if (col.isTitle) continue
        const v = rows[i].cells[col.key]
        if (isNumericColumn(col)){
          const cur = (typeof rec[col.key] === 'number') ? (rec[col.key] as number) : 0
          rec[col.key] = cur + (typeof v === 'number' ? v : 0)
        } else if (isDateColumn(col)){
          const ms = toDateMs(v); if (ms == null) continue
          const keyMin = `${col.key}__min_ms`, keyMax = `${col.key}__max_ms`
          const curMin = typeof rec[keyMin] === 'number' ? (rec[keyMin] as number) : undefined
          const curMax = typeof rec[keyMax] === 'number' ? (rec[keyMax] as number) : undefined
          const newMin = curMin === undefined ? ms : Math.min(curMin, ms)
          const newMax = curMax === undefined ? ms : Math.max(curMax, ms)
          rec[keyMin] = newMin
          rec[keyMax] = newMax
          if (!col.dateRole){
            rec[col.key] = col.type==='date'
              ? (newMin===newMax ? fmtDate(newMin) : `${fmtDate(newMin)} → ${fmtDate(newMax)}`)
              : (newMin===newMax ? fmtDatetime(newMin) : `${fmtDatetime(newMin)} → ${fmtDatetime(newMax)}`)
          }
        }
      }
    }
    stack.push({ idx:i, indent:curIndent })
  }

  return { rollups, hasChildren }
}

export default function TableCore({columns,rows,onChange,showSummary=false,summaryValues,summaryTitle='Sammendrag'}:TableCoreProps){
  const [data,setData]=useState<RowData[]>(rows)
  useEffect(()=>setData(rows),[rows])
  const setAndPropagate=useCallback((next:RowData[])=>{setData(next);onChange(next)},[onChange])

  const [sel,setSel]=useState<Selection>(NOSEL)
  const [editing,setEditing]=useState<EditingState>(null)

  // NEW: kollaps-tilstand (lagres på rad-id)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const rootRef=useRef<HTMLDivElement|null>(null)
  const dragState=useRef<{active:boolean,dragging:boolean,r0:number,c0:number,x0:number,y0:number}|null>(null)
  const suppressClickToEditOnce=useRef(false)
  const skipBlurCommit=useRef(false)
  const dataRef=useRef(data);useEffect(()=>{dataRef.current=data},[data])

  // ==== (låst) commit + navi etter commit ====
  const commitEdit=(r:number,c:number,val:string)=>{
    const col=columns[c]
    const parsed:CellValue=isNumericColumn(col)?(val===''?'':Number(val)):val
    const next=dataRef.current.map((row,i)=>i===r?{...row,cells:{...row.cells,[col.key]:parsed}}:row)
    setAndPropagate(next); setEditing(null)
  }
  const nextPosAfter = (r:number,c:number,dir:'down'|'up'|'right'|'left')=>{
    const visible = visibleRowIndices
    const idxInVisible = visible.indexOf(r)
    const colMax=columns.length-1
    if (idxInVisible === -1){
      // fall-back: finn nærmeste synlige etter r
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

  // ==== Inn/utrykk (begrenset) + flytt rad (låst) ====
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
  const moveRow=(rowIdx:number,dir:-1|1)=>{
    const arr=dataRef.current.slice(), tgt=rowIdx+dir
    if(tgt<0||tgt>=arr.length)return
    const [it]=arr.splice(rowIdx,1); arr.splice(tgt,0,it)
    setAndPropagate(arr)
    setSel(s=>hasSel(s)?{r1:tgt,r2:tgt,c1:s.c1,c2:s.c1}:{r1:tgt,r2:tgt,c1:0,c2:0})
  }

  // ==== Global key handler (låst) ====
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const rowMax=dataRef.current.length-1, colMax=columns.length-1
      if(e.altKey&&!e.shiftKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
        if(!hasSel(sel)) return; e.preventDefault(); indentRow(sel.r1,e.key==='ArrowRight'?1:-1); return
      }
      if(e.altKey&&e.shiftKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')){
        if(!hasSel(sel)) return; e.preventDefault(); moveRow(sel.r1,e.key==='ArrowUp'?-1:1); return
      }
      if(!editing){
        if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','Enter'].includes(e.key)){
          if(!hasSel(sel)) return
          e.preventDefault()
          let r=sel.r1,c=sel.c1
          // bruk synlige rader
          if(e.key==='ArrowUp')  r = nextPosAfter(r,c,'up').r
          if(e.key==='ArrowDown')r = nextPosAfter(r,c,'down').r
          if(e.key==='Left' || e.key==='ArrowLeft') c = clamp(c-1,0,colMax)
          if(e.key==='Right'|| e.key==='ArrowRight')c = clamp(c+1,0,colMax)
          if(e.key==='Tab'){
            const n = nextPosAfter(r,c, e.shiftKey ? 'left':'right')
            r = n.r; c = n.c
          }
          if(e.key==='Enter'){
            const n = nextPosAfter(r,c, e.shiftKey ? 'up':'down')
            r = n.r; c = n.c
          }
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
  },[columns.length, editing, sel])

  // ==== Mouse selection (låst) ====
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
  const { rollups, hasChildren } = useMemo(()=> computeRollups(data, columns), [data, columns])

  // ==== Synlige rader (skjul alle descendants av kollapsede foreldre) ====
  const visibleRowIndices = useMemo(()=>{
    const result:number[] = []
    const stack: Array<{ id:string, indent:number, collapsed:boolean }> = []
    for (let i=0;i<data.length;i++){
      const row = data[i]
      while (stack.length && stack[stack.length-1].indent >= row.indent) stack.pop()
      const hiddenByAncestor = stack.some(a=>a.collapsed)
      if (!hiddenByAncestor) result.push(i)
      const isParent = hasChildren.has(i)
      stack.push({ id: row.id, indent: row.indent, collapsed: isParent ? collapsed.has(row.id) : false })
    }
    return result
  }, [data, hasChildren, collapsed])

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
        const col=columns[c]; const stored = row.cells[col.key] ?? ''
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
    // finn alle synlige rader fra start
    const startIdxInVisible = visibleRowIndices.indexOf(sel.r1)
    if (startIdxInVisible === -1) return
    for(let i=0;i<m.length;i++){
      const visRow = visibleRowIndices[startIdxInVisible + i]
      if (visRow === undefined) break
      for(let j=0;j<m[i].length;j++){
        const cc=sel.c1+j; if(cc>=columns.length)break
        const col=columns[cc]
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
    columns.forEach(c=>{if(isNumericColumn(c)&&c.summarizable)s[c.key]=0})
    data.forEach(r=>columns.forEach(c=>{
      if(isNumericColumn(c)&&c.summarizable){
        const v=r.cells[c.key]; if(typeof v==='number') s[c.key]=(s[c.key] as number)+v
      }}))
    const t=columns.findIndex(c=>c.isTitle); if(t>=0) s[columns[t].key]=summaryTitle
    return s
  },[showSummary,summaryValues,columns,data,summaryTitle])

  const gridCols=useMemo(()=>makeGridTemplate(columns),[columns])

  // === Toggle knapp
  const toggleCollapse = (rowId:string) => {
    setCollapsed(prev=>{
      const n = new Set(prev)
      if (n.has(rowId)) n.delete(rowId); else n.add(rowId)
      return n
    })
  }

  return (
  <div ref={rootRef} className="tc-root" onCopy={onCopy} onPaste={onPaste}>
    <div className="tc-wrap" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      {/* header (låst) */}
      <div className="tc-header" style={{gridTemplateColumns:gridCols}}>
        <div className="tc-cell tc-idx">#</div>
        {columns.map(col=><div key={col.key} className="tc-cell">{col.title}</div>)}
      </div>

      {/* summary (låst) */}
      {showSummary&&sums&&(
        <div className="tc-row tc-summary" style={{gridTemplateColumns:gridCols}}>
          <div className="tc-cell tc-idx"></div>
          {columns.map(col=><div key={col.key} className="tc-cell">{String(sums[col.key]??'')}</div>)}
        </div>
      )}

      {/* rows – kun synlige */}
      {visibleRowIndices.map((rVisibleIdx, visiblePos)=>{
        const row = data[rVisibleIdx]
        const showIndex=rowHasContent(row,columns)
        const isParent = hasChildren.has(rVisibleIdx)
        const isCollapsed = isParent && collapsed.has(row.id)

        const rowClasses = ['tc-row']
        if (isParent) rowClasses.push('tc-parent')
        if (row.indent>0) rowClasses.push('tc-child')

        return(
        <div key={row.id} className={rowClasses.join(' ')} style={{gridTemplateColumns:gridCols}}>
          <div className="tc-cell tc-idx">{showIndex ? (visiblePos+1) : ''}</div>
          {columns.map((col,cIdx)=>{
            const inSel = hasSel(sel) && rVisibleIdx>=sel.r1&&rVisibleIdx<=sel.r2&&cIdx>=sel.c1&&cIdx<=sel.c2
            const top=inSel&&rVisibleIdx===sel.r1,bottom=inSel&&rVisibleIdx===sel.r2,left=inSel&&cIdx===sel.c1,right=inSel&&cIdx===sel.c2
            const classes=['tc-cell']; if(inSel)classes.push('sel'); if(top)classes.push('sel-top'); if(bottom)classes.push('sel-bottom'); if(left)classes.push('sel-left'); if(right)classes.push('sel-right')

            const storedVal = row.cells[col.key] ?? ''
            const shownVal = displayValue(rVisibleIdx, col, storedVal)
            const canEditThisCell = !(isAggregatedCell(rVisibleIdx, col)) // parent-aggregat = lesevisning (tittel kan editeres)
            const editingHere = !!editing && editing.r===rVisibleIdx && editing.c===cIdx && canEditThisCell
            const titleAttr = String(shownVal)

            // Disclosure i tittelkolonnen
            const maybeDisclosure = (col.isTitle && isParent) ? (
              <button
                className="tc-disc"
                aria-label={isCollapsed ? 'Utvid' : 'Skjul'}
                onMouseDown={(e)=>{e.stopPropagation()}}
                onClick={(e)=>{ e.stopPropagation(); e.preventDefault(); toggleCollapse(row.id) }}
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
      })}
    </div>
  </div>)
}
