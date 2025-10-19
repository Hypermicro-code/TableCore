// src/App.tsx
import React, { useState } from 'react'
import { TableCore } from './TableCore'
import type { Column, Row, Selection } from './types'

const initialColumns: Column[] = [
  { id: 'title', title: 'Tittel', width: 280, type: 'text' },
  { id: 'start', title: 'Start', width: 140, type: 'date' },
  { id: 'end', title: 'Slutt', width: 140, type: 'date' },
  { id: 'dur', title: 'Varighet (d)', width: 120, type: 'number' },
  { id: 'owner', title: 'Ansvar', width: 160, type: 'text' },
  { id: 'color', title: 'Farge', width: 90, type: 'color' }
]

const initialRows: Row[] = [
  { id: 'r1', level: 0, cells: { title: 'Planlegging', start: '', end: '', dur: '', owner: '', color: '#60a5fa' } },
  { id: 'r2', level: 1, cells: { title: 'Kickoff', start: '2025-10-20', end: '2025-10-20', dur: '1', owner: 'AA', color: '#f59e0b' } },
  { id: 'r3', level: 1, cells: { title: 'Kravinnsamling', start: '2025-10-21', end: '2025-10-23', dur: '3', owner: 'BB', color: '#10b981' } },
  { id: 'r4', level: 0, cells: { title: 'Bygg TabellCore', start: '', end: '', dur: '', owner: '', color: '#6366f1' } },
  { id: 'r5', level: 1, cells: { title: 'MVP', start: '2025-10-24', end: '2025-10-28', dur: '5', owner: 'CC', color: '#ef4444' } }
]

export function App() {
  // ── State ────────────────────────────────────────────────────────────────
  const [columns] = useState(initialColumns)
  const [rows, setRows] = useState(initialRows)
  const [dark, setDark] = useState(false)
  const [summary, setSummary] = useState(true)
  const [selectedRow, setSelectedRow] = useState<number | null>(null)

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleNewRowBelowSelection() {
    setRows(prev => {
      const newRow: Row = { id: crypto.randomUUID(), level: 0, cells: {} }

      // Ingen rad valgt → legg TIL SLUTT og arve nivå fra siste rad (hvis finnes)
      if (selectedRow == null || selectedRow < 0 || selectedRow >= prev.length) {
        const inheritedLevel = prev.length > 0 ? (prev[prev.length - 1].level ?? 0) : 0
        newRow.level = inheritedLevel
        return [...prev, newRow]
      }

      // Rad valgt → legg rett UNDER valgt rad, med SAMME nivå
      newRow.level = prev[selectedRow].level ?? 0
      const next = prev.slice()
      next.splice(selectedRow + 1, 0, newRow)
      return next
    })
  }

  return (
    <div className={dark ? 'app dark' : 'app'}>
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="toolbar">
        <button onClick={() => setDark(d => !d)}>{dark ? 'Lyst tema' : 'Mørkt tema'}</button>

        <button onClick={handleNewRowBelowSelection}>Ny rad ⊕</button>

        <button onClick={() => setSummary(s => !s)}>
          {summary ? 'Skjul sammendrag' : 'Vis sammendrag'}
        </button>

        <div className="spacer" />

        <small style={{ color: 'var(--muted)' }}>
          Tips: Alt+←/→ (i «Tittel») eller Ctrl/Cmd+[ / ] for innrykk/utrykk.
          Dobbeltklikk for redigering. Dra kolonner/rader for å flytte.
        </small>
      </div>

      {/* ── Tabell ────────────────────────────────────────────────────────── */}
      <div className="card">
        <TableCore
          columns={columns}
          rows={rows}
          onRowsChange={setRows}
          showSummaryRow={summary}
          // Viktig: gi TableCore en callback som oppdaterer valgt rad
          onSelectionChange={(s) => setSelectedRow(s.start?.r ?? null)}
        />
      </div>
    </div>
  )
}
