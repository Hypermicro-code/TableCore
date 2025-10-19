import { useCallback } from 'react'
import type { Column, Row, Selection } from './types'

function toTSV(cols: Column[], rows: Row[], sel: Selection): string {
  if (!sel.start || !sel.end) return ''
  const r0 = Math.min(sel.start.r, sel.end.r)
  const r1 = Math.max(sel.start.r, sel.end.r)
  const c0 = Math.min(sel.start.c, sel.end.c)
  const c1 = Math.max(sel.start.c, sel.end.c)
  const header = cols.slice(c0, c1 + 1).map(c => c.title).join('\t')
  const body = rows.slice(r0, r1 + 1).map(row =>
    cols.slice(c0, c1 + 1).map(c => row.cells[c.id] ?? '').join('\t')
  ).join('\n')
  return header + '\n' + body
}

function parseTable(text: string): string[][] {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean)
  return lines.map(line => line.includes('\t') ? line.split('\t') : splitCSV(line))
}

function splitCSV(line: string): string[] {
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
