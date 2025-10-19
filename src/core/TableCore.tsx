// ==== [BLOCK: Imports] BEGIN ====
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
