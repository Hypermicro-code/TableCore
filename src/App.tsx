import React, { useState } from 'react'
import TableCore from './core/TableCore'
import type { ColumnDef, RowData } from './core/TableTypes'


const COLS: ColumnDef[] = [
{ key:'title', title:'Navn / Tittel', isTitle:true },
{ key:'qty', title:'Antall', type:'number', summarizable:true, width:100 },
{ key:'price', title:'Pris', type:'number', summarizable:true, width:120 },
{ key:'note', title:'Notat', type:'text' }
]


const startRows: RowData[] = [
{ id:'r1', indent:0, cells:{ title:'Prosjekt', qty:'', price:'', note:'' } },
{ id:'r2', indent:1, cells:{ title:'Aktivitet A', qty:2, price:5000, note:'—' } },
{ id:'r3', indent:1, cells:{ title:'Aktivitet B', qty:1, price:12000, note:'' } },
{ id:'r4', indent:0, cells:{ title:'Andre kostnader', qty:'', price:'', note:'' } },
]


export default function App(){
const [rows, setRows] = useState<RowData[]>(startRows)
return (
<div style={{ padding:20 }}>
<h1>TableCore – demo</h1>
<p>Tips: Klikk for å redigere · hold‑dra for å markere · dblklikk for å markere tekst. Piltaster/Tab/Enter for navigasjon. Alt+←/→ for inn/ut‑rykk. Alt+Shift+↑/↓ for å flytte rad. Kopier/lim inn fungerer mot Excel.</p>
<TableCore
columns={COLS}
rows={rows}
onChange={setRows}
showSummary
/>
</div>
)
}
