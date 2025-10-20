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

// ===== HJELPERE for dato / format =====
const toDateMs = (v:CellValue): number | null => {
  if (typeof v === 'number') {
    // tolker som ms siden epoch hvis det virker fornuftig
    // (vi validerer ved å lage en Date, uten å kaste)
    const d = new Date(v)
    return isNaN(+d) ? null : +d
  }
  if (typeof v === 'string' && v.trim()){
    const d = new Date(v)
    return isNaN(+d) ? null : +d
  }
  return null
}
const fmtDate = (ms:number) => {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  const day = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}
const fmtDatetime = (ms:number) => {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2,'0')
  const mm = String(d.getMinutes()).padStart(2,'0')
  return `${fmtDate(ms)} ${hh}:${mm}`
}

// ===== ROLLUPS (parent-aggregat) =====
// number → sum, date/datetime → min→max (lagres som number (ms) på hjelpe-nøkler)
type Rollups = Map<number, Record<string, CellValue>>
type HasChildren = Set<number>

function computeRollups(rows: RowData[], columns: ColumnDef[]): { rollups: Rollups, hasChildren: HasChildren } {
  const rollups: Rollups = new Map()
  const hasChildren: HasChildren = new Set()

  const stack: Array<{ idx:number, indent:number }> = []
  const ensureRec = (idx:number) => {
    if (!rollups.has(idx)) rollups.set(idx, {})
    return rollups.get(idx)!
  }

  for (let i=0;i<rows.length;i++){
    const curIndent = rows[i].indent
    while (stack.length && stack[stack.length-1].indent >= curIndent){
      stack.pop()
    }

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
          const ms = toDateMs(v)
          if (ms == null) continue
          const keyMin = `${col.key}__min_ms`
          const keyMax = `${col.key}__max_ms`
          const curMin = typeof rec[keyMin] === 'number' ? (rec[keyMin] as number) : undefined
          const curMax = typeof rec[keyMax] === 'number' ? (rec[keyMax] as number) : undefined
          const newMin = curMin === undefined ? ms : Math.min(curMin, ms)
          const newMax = curMax === undefined ? ms : Math.max(curMax, ms)
          // hjelpefelt (tall): ok iht CellValue (=number)
          rec[keyMin] = newMin
          rec[keyMax] = newMax
          // Synlig verdi i col.key (string)
          if (col.type==='date'){
            rec[col.key] = newMin===newMax ? fmtDate(newMin) : `${fmtDate(newMin)} → ${fmtDate(newMax)}`
          } else {
            rec[col.key] = newMin===newMax ? fmtDatetime(newMin) : `${fmtDatetime(newMin)} → ${fmtDatetime(newMax)}`
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

  const rootRef=useRef<HTMLDivElement|null>(null)
  const dragState=useRef<{active:boolean,dragging:boolean,r0:number,c0:number,x0:number,y0:number}|null>(null)
  const suppressClickToEditOnce=useRef(false)
  const skipBlurCommit=useRef(false)

  const dataRef=useRef(data);useEffect(()=>{dataRef.current=data},[data])

  // === Redigering / commit (låst logikk) ===
  const commitEdit=(r:number,c:number,val:string)=>{
    const col=columns[c]
    const parsed:CellValue=isNumericColumn(col)?(val===''?'':Number(val)):val
    const next=dataRef.current.map((row,i)=>i===r?{...row,cells:{...row.cells,[col.key]:parsed}}:row)
    setAndPropagate(next)
    setEditing(null)
  }

  const nextPosAfter = (r:number,c:number,dir:'down'|'up'|'right'|'left')=>{
    const rowMax=dataRef.current.length-1
    const colMax=columns.length-1
    let rr=r, cc=c
    if(dir==='down'){ rr=clamp(r+1,0,rowMax) }
    if(dir==='up'){ rr=clamp(r-1,0,rowMax) }
    if(dir==='right'){
      cc=c+1
      if(cc>colMax){ cc=0; rr=clamp(r+1,0,rowMax) }
    }
    if(dir==='left'){
      cc=c-1
      if(cc<0){ cc=colMax; rr=clamp(r-1,0,rowMax) }
    }
    return {r:rr,c:cc}
  }

  // === Inn/utrykk + flytt rad (med begrensning) ===
  const indentRow=(rowIdx:number,delta:number)=>{
    const arr = dataRef.current
    const cur = arr[rowIdx]
    if(!cur) return
    const prevIndent = rowIdx>0 ? arr[rowIdx-1].indent : 0
    const maxIndent = prevIndent + 1
    const desired = cur.indent + delta
    const nextIndent = clamp(desired, 0, maxIndent)
    if (nextIndent === cur.indent) return
    setAndPropagate(arr.map((r,i)=> i===rowIdx ? { ...r, indent: nextIndent } : r))
  }

  const moveRow=(rowIdx:number,dir:-1|1)=>{
    const arr=dataRef.current.slice()
    const tgt=rowIdx+dir
    if(tgt<0||tgt>=arr.length)return
    const [it]=arr.splice(rowIdx,1)
    arr.splice(tgt,0,it)
    setAndPropagate(arr)
    setSel(s=>hasSel(s)?{r1:tgt,r2:tgt,c1:s.c1,c2:s.c1}:{r1:tgt,r2:tgt,c1:0,c2:0})
  }

  // === Global key handler (låst) ===
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const rowMax=dataRef.current.length-1
      const colMax=columns.length-1

      if(e.altKey&&!e.shiftKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
        if(!hasSel(sel)) return
        e.preventDefault()
        indentRow(sel.r1,e.key==='ArrowRight'?1:-1);return
      }
      if(e.altKey&&e.shiftKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')){
        if(!hasSel(sel)) return
        e.preventDefault()
        moveRow(sel.r1,e.key==='ArrowUp'?-1:1);return
      }

      if(!editing){
        if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','Enter'].includes(e.key)){
          if(!hasSel(sel)) return
          e.preventDefault()
          let r=sel.r1,c=sel.c1
          if(e.key==='ArrowUp')r=clamp(r-1,0,rowMax)
          if(e.key==='ArrowDown')r=clamp(r+1,0,rowMax)
          if(e.key==='ArrowLeft')c=clamp(c-1,0,colMax)
          if(e.key==='ArrowRight')c=clamp(c+1,0,colMax)
          if(e.key==='Tab'){
            if(e.shiftKey){ c--; if(c<0){ c=colMax; r=clamp(r-1,0,rowMax) } }
            else { c++; if(c>colMax){ c=0; r=clamp(r+1,0,rowMax) } }
          }
          if(e.key==='Enter'){ r = e.shiftKey?clamp(r-1,0,rowMax):clamp(r+1,0,rowMax) }
          setSel({r1:r,r2:r,c1:c,c2:c})
          return
        }
        if(e.key.length===1 && !e.ctrlKey && !e.metaKey){
          if(!hasSel(sel)) return
          e.preventDefault()
          setEditing({ r: sel.r1, c: sel.c1, mode:'replace', seed:e.key })
          return
        }
        if(e.key==='F2'){
          if(!hasSel(sel)) return
          e.preventDefault()
          setEditing({ r: sel.r1, c: sel.c1, mode:'caretEnd' })
          return
        }
      }
    }
    document.addEventListener('keydown',onKey,true)
    return()=>document.removeEventListener('keydown',onKey,true)
  },[columns.length, editing, sel])

  // === Mouse selection (låst) ===
  const setGlobalNoSelect=(on:boolean)=>{
    const el=rootRef.current
    if(!el)return
    el.classList.toggle('tc-noselect',on)
  }

  const onCellMouseDown=(r:number,c:number)=>(ev:React.MouseEvent)=>{
    setSel({r1:r,r2:r,c1:c,c2:c})
    dragState.current={active:true,dragging:false,r0:r,c0:c,x0:ev.clientX,y0:ev.clientY}
  }

  const onMouseMove=(ev:React.MouseEvent)=>{
    if(!dragState.current||!dragState.current.active)return
    const dx=ev.clientX-dragState.current.x0,dy=ev.clientY-dragState.current.y0
    if(!dragState.current.dragging&&(dx*dx+dy*dy)>DRAG_THRESHOLD_PX*DRAG_THRESHOLD_PX){
      dragState.current.dragging=true;setGlobalNoSelect(true)
    }
    if(!dragState.current.dragging)return
    const tgt=(ev.target as HTMLElement).closest('[data-cell]') as HTMLElement|null
    if(!tgt)return
    const r=Number(tgt.getAttribute('data-r')),c=Number(tgt.getAttribute('data-c'))
    setSel({r1:Math.min(r,dragState.current.r0),r2:Math.max(r,dragState.current.r0),c1:Math.min(c,dragState.current.c0),c2:Math.max(c,dragState.current.c0)})
  }

  const onMouseUp=()=>{
    if(!dragState.current)return
    const wasDragging=dragState.current.dragging
    dragState.current.active=false;dragState.current.dragging=false;setGlobalNoSelect(false)
    if(suppressClickToEditOnce.current){suppressClickToEditOnce.current=false;return}
    if(!wasDragging){/* bare velg – ingen auto-edit på click */}
  }

  const onCellDoubleClick=(r:number,c:number)=>(ev:React.MouseEvent)=>{
    ev.preventDefault()
    suppressClickToEditOnce.current=true
    setEditing({ r, c, mode:'selectAll' })
  }

  // === ROLLUPS: beregn for nåværende data/kolonner ===
  const { rollups, hasChildren } = useMemo(()=> computeRollups(data, columns), [data, columns])

  const isAggregatedCell = (rowIndex:number, col: ColumnDef) => {
    if (!hasChildren.has(rowIndex)) return false
    if (col.isTitle) return false
    return isNumericColumn(col) || isDateColumn(col)
  }

  const displayValue = (rowIndex:number, col: ColumnDef, stored: CellValue): CellValue => {
    if (isAggregatedCell(rowIndex, col)){
      const rec = rollups.get(rowIndex)
      if (rec && rec[col.key] !== undefined) return rec[col.key]!
    }
    return stored
  }

  // === Clipboard ===
  const onCopy=(e:React.ClipboardEvent)=>{
    if(!hasSel(sel)) return
    const {r1,r2,c1,c2}=sel
    const m:(string|number|'')[][]=[]
    for(let r=r1;r<=r2;r++){
      const row=data[r]
      const line:(string|number|'')[]=[]
      for(let c=c1;c<=c2;c++){
        const col=columns[c]
        const stored = row.cells[col.key] ?? ''
        line.push(displayValue(r,col,stored) as any)
      }
      m.push(line)
    }
    e.clipboardData.setData('text/plain',toTSV(m));e.preventDefault()
  }

  const onPaste=(e:React.ClipboardEvent)=>{
    if(!hasSel(sel)) return
    const txt=e.clipboardData.getData('text/plain');if(!txt)return
    e.preventDefault()
    const m=parseClipboard(txt)
    const next=data.slice();const {r1,c1}=sel
    for(let i=0;i<m.length;i++){
      const rr=r1+i;if(rr>=next.length)break
      for(let j=0;j<m[i].length;j++){
        const cc=c1+j;if(cc>=columns.length)break
        const col=columns[cc]
        // Ikke skriv inn i aggregert parent-celle
        if (isAggregatedCell(rr, col)) continue
        const raw=m[i][j]
        if(isNumericColumn(col)) next[rr].cells[col.key]=(raw===''?'':Number(raw))
        else next[rr].cells[col.key]=raw
      }
    }
    setAndPropagate(next)
  }

  // === Sammendrag (øverst) – uendret) ===
  const sums=useMemo(()=>{
    if(!showSummary||summaryValues)return null
    const s:Record<string,CellValue>={}
    columns.forEach(c=>{if(isNumericColumn(c)&&c.summarizable)s[c.key]=0})
    data.forEach(r=>columns.forEach(c=>{
      if(isNumericColumn(c)&&c.summarizable){
        const v=r.cells[c.key];if(typeof v==='number')s[c.key]=(s[c.key] as number)+v
      }}))
    const t=columns.findIndex(c=>c.isTitle);if(t>=0)s[columns[t].key]=summaryTitle
    return s
  },[showSummary,summaryValues,columns,data,summaryTitle])

  const gridCols=useMemo(()=>makeGridTemplate(columns),[columns])

  return (
  <div ref={rootRef} className="tc-root" onCopy={onCopy} onPaste={onPaste}>
    <div className="tc-wrap" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      {/* header (uendret) */}
      <div className="tc-header" style={{gridTemplateColumns:gridCols}}>
        <div className="tc-cell tc-idx">#</div>
        {columns.map(col=><div key={col.key} className="tc-cell">{col.title}</div>)}
      </div>

      {/* summary (uendret) */}
      {showSummary&&sums&&(
        <div className="tc-row tc-summary" style={{gridTemplateColumns:gridCols}}>
          <div className="tc-cell tc-idx"></div>
          {columns.map(col=><div key={col.key} className="tc-cell">{String(sums[col.key]??'')}</div>)}
        </div>
      )}

      {/* rows (utseende uendret; parent-celler viser aggregat) */}
      {data.map((row,rIdx)=>{
        const showIndex=rowHasContent(row,columns)
        return(
        <div key={row.id} className="tc-row" style={{gridTemplateColumns:gridCols}}>
          <div className="tc-cell tc-idx">{showIndex?rIdx+1:''}</div>
          {columns.map((col,cIdx)=>{
            const inSel = hasSel(sel) && rIdx>=sel.r1&&rIdx<=sel.r2&&cIdx>=sel.c1&&cIdx<=sel.c2
            const top=inSel&&rIdx===sel.r1,bottom=inSel&&rIdx===sel.r2,left=inSel&&cIdx===sel.c1,right=inSel&&cIdx===sel.c2
            const classes=['tc-cell'];if(inSel)classes.push('sel');if(top)classes.push('sel-top');if(bottom)classes.push('sel-bottom');if(left)classes.push('sel-left');if(right)classes.push('sel-right')

            const storedVal = row.cells[col.key] ?? ''
            const shownVal = displayValue(rIdx, col, storedVal)
            const canEditThisCell = !(isAggregatedCell(rIdx, col)) // parent-aggregat = lesevisning (tittel kan fortsatt editeres)

            const editingHere = !!editing && editing.r===rIdx && editing.c===cIdx && canEditThisCell
            const titleAttr = typeof shownVal === 'number' ? String(shownVal) : String(shownVal)

            if(editingHere){
              const handleCommitMove = (value:string, key:string, isTextarea:boolean, e:React.KeyboardEvent)=>{
                const dir =
                  key==='Enter' ? (e.shiftKey ? 'up' : 'down') :
                  key==='Tab'   ? (e.shiftKey ? 'left' : 'right') : null
                if(!dir) return
                e.preventDefault()
                skipBlurCommit.current = true
                commitEdit(rIdx,cIdx,value)
                const next = nextPosAfter(rIdx,cIdx,dir)
                setSel({r1:next.r,r2:next.r,c1:next.c,c2:next.c})
              }

              if(isNumericColumn(col)){
                const seed = editing!.seed && /[0-9\-\.,]/.test(editing!.seed) ? editing!.seed : ''
                const defaultValue = editing!.mode==='replace' ? seed : String(storedVal)
                return(
                  <div key={col.key} className={classes.join(' ')} data-cell data-r={rIdx} data-c={cIdx}>
                    <input
                      autoFocus
                      defaultValue={defaultValue}
                      ref={el=>{
                        if(!el)return;requestAnimationFrame(()=>{
                          if(editing!.mode==='selectAll')el.select()
                          else { const e=el.value.length; el.setSelectionRange(e,e) }
                        })
                      }}
                      onBlur={e=>{
                        if(skipBlurCommit.current){ skipBlurCommit.current=false; return }
                        commitEdit(rIdx,cIdx,e.currentTarget.value)
                      }}
                      onKeyDown={e=>{
                        if(e.key==='Enter' || e.key==='Tab'){
                          handleCommitMove((e.target as HTMLInputElement).value, e.key, false, e); return
                        }
                        if(e.key==='Escape'){ e.preventDefault(); setEditing(null) }
                      }}
                      type="number" style={{width:'100%',border:'none',outline:'none',background:'transparent'}}
                    />
                  </div>
                )
              } else {
                const defaultValue = editing!.mode==='replace' ? (editing!.seed ?? '') : String(storedVal)
                return(
                  <div key={col.key} className={classes.join(' ')} data-cell data-r={rIdx} data-c={cIdx}>
                    <textarea
                      autoFocus
                      defaultValue={defaultValue}
                      ref={el=>{
                        if(!el)return;requestAnimationFrame(()=>{
                          if(editing!.mode==='selectAll')el.select()
                          else { const e=el.value.length; el.setSelectionRange(e,e) }
                        })
                      }}
                      onBlur={e=>{
                        if(skipBlurCommit.current){ skipBlurCommit.current=false; return }
                        commitEdit(rIdx,cIdx,e.currentTarget.value)
                      }}
                      onKeyDown={e=>{
                        if(e.key==='Enter' && e.altKey){
                          e.preventDefault()
                          const ta=e.currentTarget
                          const pos=ta.selectionStart??ta.value.length
                          ta.value=ta.value.slice(0,pos)+'\n'+ta.value.slice(pos)
                          ta.setSelectionRange(pos+1,pos+1)
                          return
                        }
                        if(e.key==='Enter' || e.key==='Tab'){
                          handleCommitMove((e.target as HTMLTextAreaElement).value, e.key, true, e); return
                        }
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
              data-cell data-r={rIdx} data-c={cIdx}
              onMouseDown={onCellMouseDown(rIdx,cIdx)}
              onDoubleClick={onCellDoubleClick(rIdx,cIdx)}
              title={titleAttr}>
              {col.isTitle?
                <span className="tc-title">
                  <span className="tc-indent" style={{['--lvl' as any]:row.indent}}/>
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
