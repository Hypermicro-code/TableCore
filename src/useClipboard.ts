export const SRC_USE_CLIPBOARD_TS = `import { useCallback } from 'react'
const lines = text.replace(/\r/g, '').split('\n').filter(Boolean)
return lines.map(line => line.includes('\t') ? line.split('\t') : splitCSV(line))
}


function splitCSV(line: string): string[] {
// Enkel CSV-splitter med støtte for sitater
const out: string[] = []
let cur = ''
let quoted = false
for (let i = 0; i < line.length; i++) {
const ch = line[i]
if (ch === '"') {
if (quoted && line[i+1] === '"') { cur += '"'; i++; }
else { quoted = !quoted }
} else if (ch === ',' && !quoted) { out.push(cur); cur = '' }
else { cur += ch }
}
out.push(cur)
return out
}


export function useClipboard(cols: Column[], rows: Row[], sel: Selection, setRows: (rows: Row[]) => void) {
const onCopy = useCallback((e: ClipboardEvent) => {
if (!sel.start || !sel.end) return
const tsv = toTSV(cols, rows, sel)
e.clipboardData?.setData('text/plain', tsv)
e.preventDefault()
}, [cols, rows, sel])


const onPaste = useCallback((e: ClipboardEvent) => {
const text = e.clipboardData?.getData('text/plain')
if (!text || !sel.start) return
const grid = parseTable(text)
const r0 = sel.start.r
const c0 = sel.start.c
const next = rows.map(r => ({...r, cells: {...r.cells}}))
for (let r = 0; r < grid.length; r++) {
for (let c = 0; c < grid[r].length; c++) {
const rr = r0 + r
const cc = c0 + c
if (rr >= next.length || cc >= cols.length) continue
const colId = cols[cc].id
next[rr].cells[colId] = grid[r][c]
}
}
setRows(next)
e.preventDefault()
}, [cols, rows, sel, setRows])


return { onCopy, onPaste }
}
`;
