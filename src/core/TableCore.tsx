import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ColumnDef, RowData, Selection, TableCoreProps, CellValue } from './TableTypes'
import { parseClipboard, toTSV } from './utils/clipboard'
import '../styles/tablecore.css'

function clamp(n:number,a:number,b:number){return Math.max(a,Math.min(b,n))}
function isNumericColumn(col: ColumnDef){return col.type==='number'}
function rowHasContent(row:RowData,cols:ColumnDef[]){return cols.some(c=>c.key!=='#' && row.cells[c.key])}
function makeGridTemplate(cols:ColumnDef[]){return ['48px',...cols.map(c=>c.width?`${c.width}px`:'minmax(120px,1fr)')].join(' ')}

const DRAG_THRESHOLD_PX = 4

type EditMode = 'replace'|'caretEnd'|'selectAll'

export default function TableCore({columns,rows,onChange,showSummary=false,summaryValues,summaryTitle='Sammendrag'}:TableCoreProps){
  const [data,setData]=useState<RowData[]>(rows)
  useEffect(()=>setData(rows),[rows])
  const setAndPropagate=useCallback((next:RowData[])=>{setData(next);onChange(next)},[onChange])

  const [sel,setSel]=useState<Selection>({r1:0,c1:0,r2:0,c2:0})
  const [editing,setEditing]=useState<{r:number,c:number,mode:EditMode}|null>(null)

  const rootRef=useRef<HTMLDivElement|null>(null)
  const dragState=useRef<{active:boolean,dragging:boolean,r0:number,c0:number,x0:number,y0:number}|null>(null)
  const suppressClickToEditOnce=useRef(false)

  const dataRef=useRef(data);useEffect(()=>{dataRef.current=data},[data])

  // === Redigering / commit ===
  const commitEdit=(r:number,c:number,val:string)=>{
    const col=columns[c]
    const parsed:CellValue=isNumericColumn(col)?(val===''?'':Number(val)):val
    const next=dataRef.current.map((row,i)=>i===r?{...row,cells:{...row.cells,[col.key]:parsed}}:row)
    setAndPropagate(next)
    setEditing(null)
  }

  // === Inn/utrykk + flytt rad ===
  const indentRow=(rowIdx:number,delta:number)=>{
    setAndPropagate(dataRef.current.map((r,i)=>i===rowIdx?{...r,indent:Math.max(0,r.indent+delta)}:r))
  }
  const moveRow=(rowIdx:number,dir:-1|1)=>{
    const arr=dataRef.current.slice()
    const tgt=rowIdx+dir
    if(tgt<0||tgt>=arr.length)return
    const [it]=arr.splice(rowIdx,1)
    arr.splice(tgt,0,it)
    setAndPropagate(arr)
    setSel({r1:tgt,r2:tgt,c1:sel.c1,c2:sel.c1})
  }

  // === Global key handler ===
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const editingNow=editing
      const rSel=sel.r1,cSel=sel.c1
      const rowMax=dataRef.current.length-1,colMax=columns.length-1
      // --- Special (ours)
      if(e.altKey&&!e.shiftKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
        e.preventDefault()
        indentRow(rSel,e.key==='ArrowRight'?1:-1);return
      }
      if(e.altKey&&e.shiftKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')){
        e.preventDefault()
        moveRow(rSel,e.key==='ArrowUp'?-1:1);return
      }
      // --- Navigation (only if not editing)
      if(!editingNow){
        if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','Enter'].includes(e.key)){
          e.preventDefault()
          let r=rSel,c=cSel
          if(e.key==='ArrowUp')r=clamp(r-1,0,rowMax)
          if(e.key==='ArrowDown')r=clamp(r+1,0,rowMax)
          if(e.key==='ArrowLeft')c=clamp(c-1,0,colMax)
          if(e.key==='ArrowRight')c=clamp(c+1,0,colMax)
          if(e.key==='Tab')c=(e.shiftKey?c-1:c+1);if(c<0){c=colMax;r=clamp(r-1,0,rowMax)}if(c>colMax){c=0;r=clamp(r+1,0,rowMax)}
          if(e.key==='Enter'){r=e.shiftKey?clamp(r-1,0,rowMax):clamp(r+1,0,rowMax)}
          setSel({r1:r,r2:r,c1:c,c2:c})
          return
        }
        // --- Start typing = replace
        if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){
          e.preventDefault()
          setEditing({r:rSel,c:cSel,mode:'replace'})
          return
        }
        // --- F2 = edit caret end
        if(e.key==='F2'){e.preventDefault();setEditing({r:rSel,c:cSel,mode:'caretEnd'})}
      }
    }
    document.addEventListener('keydown',onKey,true)
    return()=>document.removeEventListener('keydown',onKey,true)
  })

  // === Mouse selection ===
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
    if(!wasDragging){/* bare velg */ }
  }

  const onCellDoubleClick=(r:number,c:number)=>(ev:React.MouseEvent)=>{
    ev.preventDefault()
    suppressClickToEditOnce.current=true
    setEditing({r,c,mode:'selectAll'})
  }

  // === Clipboard ===
  const onCopy=(e:React.ClipboardEvent)=>{
    const {r1,r2,c1,c2}=sel
    const m:string[][]=[]
    for(let r=r1;r<=r2;r++){
      const row=data[r]
      const line=[]
      for(let c=c1;c<=c2;c++){line.push(String(row.cells[columns[c].key]??''))}
      m.push(line)
    }
    e.clipboardData.setData('text/plain',toTSV(m));e.preventDefault()
  }
  const onPaste=(e:React.ClipboardEvent)=>{
    const txt=e.clipboardData.getData('text/plain');if(!txt)return
    e.preventDefault()
    const m=parseClipboard(txt)
    const next=data.slice();const {r1,c1}=sel
    for(let i=0;i<m.length;i++){const rr=r1+i;if(rr>=next.length)break
      for(let j=0;j<m[i].length;j++){const cc=c1+j;if(cc>=columns.length)break
        const col=columns[cc];const raw=m[i][j]
        next[rr].cells[col.key]=isNumericColumn(col)?(raw===''?'':Number(raw)):raw
      }}
    setAndPropagate(next)
  }

  // === Sammendrag ===
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
      {/* header */}
      <div className="tc-header" style={{gridTemplateColumns:gridCols}}>
        <div className="tc-cell tc-idx">#</div>
        {columns.map(col=><div key={col.key} className="tc-cell">{col.title}</div>)}
      </div>

      {/* summary */}
      {showSummary&&sums&&(
        <div className="tc-row tc-summary" style={{gridTemplateColumns:gridCols}}>
          <div className="tc-cell tc-idx"></div>
          {columns.map(col=><div key={col.key} className="tc-cell">{String(sums[col.key]??'')}</div>)}
        </div>
      )}

      {/* rows */}
      {data.map((row,rIdx)=>{
        const showIndex=rowHasContent(row,columns)
        return(
        <div key={row.id} className="tc-row" style={{gridTemplateColumns:gridCols}}>
          <div className="tc-cell tc-idx">{showIndex?rIdx+1:''}</div>
          {columns.map((col,cIdx)=>{
            const inSel=rIdx>=sel.r1&&rIdx<=sel.r2&&cIdx>=sel.c1&&cIdx<=sel.c2
            const top=inSel&&rIdx===sel.r1,bottom=inSel&&rIdx===sel.r2,left=inSel&&cIdx===sel.c1,right=inSel&&cIdx===sel.c2
            const classes=['tc-cell'];if(inSel)classes.push('sel');if(top)classes.push('sel-top');if(bottom)classes.push('sel-bottom');if(left)classes.push('sel-left');if(right)classes.push('sel-right')

            const editingHere=editing&&editing.r===rIdx&&editing.c===cIdx
            const val=row.cells[col.key]??''

            if(editingHere){
              return(
              <div key={col.key} className={classes.join(' ')} data-cell data-r={rIdx} data-c={cIdx}>
                {isNumericColumn(col)?
                  <input autoFocus defaultValue={String(val)}
                    ref={el=>{
                      if(!el)return;requestAnimationFrame(()=>{
                        if(editing.mode==='selectAll')el.select()
                        else if(editing.mode==='caretEnd'){const e=el.value.length;el.setSelectionRange(e,e)}
                      })
                    }}
                    onBlur={e=>commitEdit(rIdx,cIdx,e.currentTarget.value)}
                    onKeyDown={e=>{
                      if(e.key==='Enter'){e.preventDefault();commitEdit(rIdx,cIdx,e.currentTarget.value);setSel(s=>({r1:clamp(rIdx+1,0,data.length-1),r2:clamp(rIdx+1,0,data.length-1),c1:cIdx,c2:cIdx}))}
                      if(e.key==='Escape'){e.preventDefault();setEditing(null)}
                    }}
                    type="number" style={{width:'100%',border:'none',outline:'none',background:'transparent'}}/>
                :
                  <textarea autoFocus defaultValue={String(val)}
                    ref={el=>{
                      if(!el)return;requestAnimationFrame(()=>{
                        if(editing.mode==='selectAll')el.select()
                        else if(editing.mode==='caretEnd'){const e=el.value.length;el.setSelectionRange(e,e)}
                      })
                    }}
                    onBlur={e=>commitEdit(rIdx,cIdx,e.currentTarget.value)}
                    onKeyDown={e=>{
                      if(e.key==='Enter'&&e.altKey){ // Alt+Enter = linjeskift
                        e.preventDefault()
                        const ta=e.currentTarget
                        const pos=ta.selectionStart??ta.value.length
                        ta.value=ta.value.slice(0,pos)+'\n'+ta.value.slice(pos)
                        ta.setSelectionRange(pos+1,pos+1)
                        return
                      }
                      if(e.key==='Enter'){e.preventDefault();commitEdit(rIdx,cIdx,e.currentTarget.value);setSel(s=>({r1:clamp(rIdx+1,0,data.length-1),r2:clamp(rIdx+1,0,data.length-1),c1:cIdx,c2:cIdx}))}
                      if(e.key==='Escape'){e.preventDefault();setEditing(null)}
                    }}
                    style={{width:'100%',border:'none',outline:'none',background:'transparent',resize:'vertical',minHeight:'22px'}}/>
                }
              </div>)
            }

            return(
            <div key={col.key}
              className={classes.join(' ')}
              data-cell data-r={rIdx} data-c={cIdx}
              onMouseDown={onCellMouseDown(rIdx,cIdx)}
              onDoubleClick={onCellDoubleClick(rIdx,cIdx)}>
              {col.isTitle?
                <span className="tc-title">
                  <span className="tc-indent" style={{['--lvl' as any]:row.indent}}/>
                  <span>{String(val)}</span>
                </span>
              :<span>{String(val)}</span>}
            </div>)
          })}
        </div>)
      })}
    </div>
  </div>)
}
