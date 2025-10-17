import React, { useState } from "react"
import TableCore from "./core/TableCore"
import type { Column, Row, Selection } from "./core/types"

/** Demo-data */
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
  const [treeMode, setTreeMode] = useState(true)
  const [selection, setSelection] = useState<Selection>({ r1: 0, c1: 1, r2: 0, c2: 1 })

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

  // For demoens enkle “visible”
  const buildVisible = (src: Row[]) => src

  const addRowBelow = () => {
    const vr = selection.r2
    const vis = buildVisible(rows)
    const row = vis[vr]
    if (!row) return
    const insertAfterDataIdx = rows.indexOf(row)
    const next = rows.slice()
    const lastIdNum = Number(next[next.length - 1]?.id ?? next.length)
    const id = lastIdNum + 1
    const newRow: Row = {
      id,
      parentId: next[insertAfterDataIdx]?.parentId ?? null,
      aktivitet: `Ny aktivitet ${id}`,
      ansvarlig: "",
      start: "",
      slutt: "",
      timer: "",
      farge: ""
    }
    next.splice(insertAfterDataIdx + 1, 0, newRow)
    setRows(next)
  }

  const deleteSelectedRows = () => {
    const s = selection
    const vis = buildVisible(rows)
    const toDelete = new Set<number>()
    for (let vr = s.r1; vr <= s.r2; vr++) {
      const r = vis[vr]
      if (!r) continue
      const di = rows.indexOf(r)
      if (di >= 0) toDelete.add(di)
    }
    const next = rows.filter((_, idx) => !toDelete.has(idx))
    setRows(next)
  }

  return (
    <div className="app">
      <div className="panel">
        <h1 style={{margin:0, fontSize:18}}>TableCore – v1 ferdig</h1>
        <p style={{marginTop:8, color:"var(--muted)"}}>
          Polert props-kontrakt, tastaturforbedringer, og demo-verktøylinje for raske tester.
        </p>
      </div>

      <div className="panel">
        <div className="toolbar">
          <button className="btn" onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key:"z", ctrlKey:true }))}>↶ Angre</button>
          <button className="btn" onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key:"y", ctrlKey:true }))}>↷ Gjør om</button>
          <button className="btn" onClick={addRowBelow}>＋ Legg til rad under</button>
          <button className="btn" onClick={deleteSelectedRows}>🗑 Slett markerte rader</button>
          <button className="btn" onClick={() => setTreeMode(v => !v)}>
            {treeMode ? "Tre-modus: PÅ" : "Tre-modus: AV"}
          </button>
          <span style={{marginLeft:12, color:"var(--muted)"}}>
            Markering: r{selection.r1}–{selection.r2}, c{selection.c1}–{selection.c2}
          </span>
        </div>
      </div>

      <div className="panel">
        <TableCore
          columns={columns}
          rows={rows}
          onRowsChange={setRows}
          onCommit={setRows}
          onPatch={() => {}}
          onSelectionChange={(s) => setSelection(s)}
          onReorderColumns={({ fromIndex, toIndex }) => {
            const cols = columns.slice()
            const from = fromIndex - 1
            const to = toIndex - 1
            if (from < 0 || to < 0) return
            const [mv] = cols.splice(from, 1)
            if (!mv) return
            cols.splice(to, 0, mv)
            setColumns(cols)
          }}
          onReorderRows={({ fromIndex, toIndex, count }) => {
            const next = rows.slice()
            const moved = next.splice(fromIndex, count)
            next.splice(toIndex, 0, ...moved)
            setRows(next)
          }}
          rowHeight={28}
          headerHeight={30}
          viewportHeight={520}
          treeMode={treeMode}
          expandAllByDefault={true}
        />
      </div>
    </div>
  )
}
