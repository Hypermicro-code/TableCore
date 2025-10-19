export const SRC_TABLECORE_TSX = `import React, { useEffect, useMemo, useRef, useState } from 'react'
onPointerEnter={e => onCellPointerEnter(e, r, colIdx)}
onDoubleClick={() => onCellDoubleClick(r, colIdx)}
>
{/* Indent bullets for level */}
{colIdx === 0 && (
<>
{Array.from({ length: row.level }).map((_, i) => <span key={i} className="tc-indent" />)}
{row.level > 0 && <span className="tc-level-bullet" />}
</>
)}


{/* Editors */}
{c.type === 'color' ? (
<input type="color" value={val || '#9ca3af'} onChange={e => setCell(r, colIdx, e.target.value)} />
) : c.type === 'date' ? (
<input type="date" value={val} onChange={e => setCell(r, colIdx, e.target.value)} />
) : (
<div
contentEditable
suppressContentEditableWarning
spellCheck={false}
onBlur={(e) => setCell(r, colIdx, (e.target as HTMLElement).innerText)}
onKeyDown={(e) => {
if (e.key === 'Enter') { (e.target as HTMLElement).blur(); e.preventDefault() }
}}
>{val}</div>
)}
</div>
)
})}
</div>
))}


{/* Summary row */}
{showSummaryRow && (
<div className={clsx('tc-row tc-summary')}>
<div className="tc-cell tc-index">Σ</div>
{cols.map(c => (
<div key={c.id} className={clsx('tc-cell', c.type === 'number' && 'numeric')}>
{c.type === 'number' ? summary[c.id]?.toLocaleString?.() ?? '' : ''}
</div>
))}
</div>
)}
</div>
</div>
)
}
`;
