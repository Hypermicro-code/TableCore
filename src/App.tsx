import React, { useMemo, useState } from "react"
import TableCore from "./core/TableCore"
import type { Column, Row } from "./core/types"

/** Demo: generer 50 000 rader for å demonstrere virtuell rulling */
function makeRows(n: number): Row[] {
  const out: Row[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      id: i + 1,
      aktivitet: `Aktivitet ${i + 1}`,
      ansvarlig: i % 5 === 0 ? "Ola" : i % 5 === 1 ? "Kari" : i % 5 === 2 ? "Nils" : i % 5 === 3 ? "Anne" : "Per",
      start: `2025-10-${String((i % 28) + 1).padStart(2,"0")}`,
      slutt: `2025-11-${String((i % 28) + 1).padStart(2,"0")}`,
      farge: ["🔵","🟢","🟣","🟡","🟠"][i % 5],
    })
  }
  return out
}

export default function App() {
  const columns: Column[] = useMemo(() => ([
    { key: "id", name: "ID", width: 80, editable: false },
    { key: "aktivitet", name: "Aktivitet", width: 240, editable: true },
    { key: "ansvarlig", name: "Ansvarlig", width: 160, editable: true },
    { key: "start", name: "Start", width: 140, editable: true },
    { key: "slutt", name: "Slutt", width: 140, editable: true },
    { key: "farge", name: "Farge", width: 100, editable: true },
  ]), [])

  const [rows, setRows] = useState<Row[]>(() => makeRows(50000))

  return (
    <div className="app">
      <div className="panel">
        <h1 style={{margin:0, fontSize:18}}>TableCore – Etappe 1 (Grunn-grid)</h1>
        <p style={{marginTop:8, color:"var(--muted)"}}>
          Multi-markering (klikk / Shift+klikk / klikk+drag), piltaster, Tab, Enter, Delete, umiddelbar redigering (ingen hvit editor), Undo/Redo (Ctrl/Cmd+Z / Ctrl/Cmd+Y), og virtuell rulling.
        </p>
      </div>

      <div className="panel">
        <TableCore
          columns={columns}
          rows={rows}
          onRowsChange={setRows}
          onCommit={(r) => setRows(r)}
          onPatch={(p) => { /* kan logges i konsollen ved behov */ }}
          onSelectionChange={(s) => { /* f.eks. vis status */ }}
          rowHeight={28}
          headerHeight={30}
        />
      </div>
    </div>
  )
}
