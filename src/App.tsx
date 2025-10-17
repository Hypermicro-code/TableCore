import React, { useMemo, useState } from "react"
import TableCore from "./core/TableCore"
import type { Column, Row } from "./core/types"

/** Demo: blanding av rot/barn for tre-modus + validering */
function makeRows(n: number): Row[] {
  const out: Row[] = []
  for (let i = 0; i < n; i++) {
    const id = i + 1
    const parentId = (i % 5 === 0) ? null : (i % 5 === 1 ? id - 1 : (i % 5 === 2 ? id - 2 : null))
    out.push({
      id,
      parentId,
      aktivitet: `Aktivitet ${id}`,
      ansvarlig: ["Ola","Kari","Nils","Anne","Per"][i % 5],
      start: `2025-10-${String((i % 28) + 1).padStart(2,"0")}`,
      slutt: `2025-11-${String((i % 28) + 1).padStart(2,"0")}`,
      timer: (i % 13) * 2,
      farge: ["🔵","🟢","🟣","🟡","🟠"][i % 5],
    })
  }
  return out
}

export default function App() {
  const [rows, setRows] = useState<Row[]>(() => makeRows(5000))

  const [columns, setColumns] = useState<Column[]>(() => ([
    { key: "aktivitet", name: "Aktivitet", width: 260, editable: true },
    { key: "ansvarlig", name: "Ansvarlig", width: 160, editable: true },
    {
      key: "start", name: "Start", width: 140, editable: true,
      validate: (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) || "Bruk format YYYY-MM-DD"
    },
    {
      key: "slutt", name: "Slutt", width: 140, editable: true,
      validate: (v, row) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return "Bruk format YYYY-MM-DD"
        const s = new Date(String(row.start)); const e = new Date(String(v))
        return e >= s || "Sluttdato kan ikke være før start"
      }
    },
    {
      key: "timer", name: "Timer", width: 120, editable: true,
      validate: (v) => {
        const num = Number(v)
        if (!Number.isFinite(num)) return "Må være et tall"
        return num >= 0 || "Kan ikke være negativ"
      }
    },
    { key: "farge", name: "Farge", width: 100, editable: true },
  ]))

  return (
    <div className="app">
      <div className="panel">
        <h1 style={{margin:0, fontSize:18}}>TableCore – Etapper 2–4</h1>
        <ul style={{marginTop:8, color:"var(--muted)"}}>
          <li>#-kolonne: caret (tre), radnr (skjules på tom rad), drag-handle</li>
          <li>Dra/slipp: kolonner i header, rader (inkl. markert blokk)</li>
          <li>Tre-modus: parentId, caret, Ctrl/Cmd+←/→, Alt+→ (2-trinn), Alt+←, Alt+↑/↓</li>
          <li>Typografi pr nivå (fet/kursiv/størrelse)</li>
          <li>Clipboard: copy/paste TSV og HTML-tabell, validering m/feilvisning</li>
        </ul>
      </div>

      <div className="panel">
        <TableCore
          columns={columns}
          rows={rows}
          onRowsChange={setRows}
          onCommit={setRows}
          onPatch={() => {}}
          onSelectionChange={() => {}}
          onReorderColumns={({ fromIndex, toIndex }) => {
            // Kolonnelista i TableCore inkluderer # på index 0 – her mottar vi 1-basert innhold (uten #)
            const cols = columns.slice()
            const from = fromIndex - 1
            const to = toIndex - 1
            if (from < 0 || to < 0) return
            const [mv] = cols.splice(from, 1)
            cols.splice(to, 0, mv)
            setColumns(cols)
          }}
          onReorderRows={({ fromIndex, toIndex, count }) => {
            const next = rows.slice()
            const moved = next.splice(fromIndex, count)
            const insertAt = toIndex
            next.splice(insertAt, 0, ...moved)
            setRows(next)
          }}
          rowHeight={28}
          headerHeight={30}
          treeMode={true}
        />
      </div>
    </div>
  )
}
