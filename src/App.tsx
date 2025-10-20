import React, { useState } from "react"
import TableCore from "./core/TableCore"
import type { RowData, ColumnDef } from "./core/TableTypes"
import "./styles/tablecore.css"

const columns: ColumnDef[] = [
  { key: "tittel", title: "Tittel", isTitle: true },
  { key: "fra", title: "Fra dato", type: "date" },
  { key: "til", title: "Til dato", type: "date" },
  { key: "timer", title: "Timer", type: "number", summarizable: true },
]

const initialRows: RowData[] = [
  { id: "r1", indent: 0, cells: { tittel: "Prosjektstart", fra: "2025-03-01", til: "2025-03-01", timer: 4 } },
  { id: "r2", indent: 1, cells: { tittel: "Planlegging", fra: "2025-03-01", til: "2025-03-02", timer: 6 } },
  { id: "r3", indent: 1, cells: { tittel: "Utførelse", fra: "2025-03-02", til: "2025-03-04", timer: 12 } },
  { id: "r4", indent: 0, cells: { tittel: "Avslutning", fra: "2025-03-05", til: "2025-03-05", timer: 3 } },
]

export default function App() {
  const [rows, setRows] = useState(initialRows)

  return (
    <div style={{ padding: 24 }}>
      <h2>Tabell med datoaggregat</h2>
      <TableCore
        columns={columns}
        rows={rows}
        onChange={setRows}
        showSummary
      />
      <p style={{ marginTop: 16, fontStyle: "italic" }}>
        Tips: Rekk ned "Planlegging" og "Utførelse" (Alt + →).<br />
        Parent-raden "Prosjektstart" skal da vise <b>2025-03-01 → 2025-03-04</b> og sum = 18 timer.
      </p>
    </div>
  )
}
