# TableCore – v1 (Etapper 1–4)

Grunnmodul for **Progress**, **Estimates** og **Forms**. Denne leveransen inkluderer:

- **Grid**: mørkt tema, skarpe hjørner, virtuell rulling (10–50k+).
- **Markering**: klikk / Shift+klikk / klikk+drag (rektangel).
- **Navigasjon**: piltaster, Tab, Enter (rediger), Delete (tøm utvalg).
- **Redigering**: klikk = rediger, dobbeltklikk = marker tekst; editor uten hvit bakgrunn.
- **Undo/Redo**: lokalt per tabell (Ctrl/Cmd+Z / Ctrl/Cmd+Y).
- **#-kolonne**: radnummer (skjules på tom rad), caret (▸/▾) for tre, drag-handle for rader.
- **Dra/slipp**:
  - Kolonner i header.
  - Rader (inkl. blokk ved multi-markering).
- **Tre-modus**:
  - `parentId` per rad, expand/collapse med caret og **Ctrl/Cmd+←/→**.
  - **Alt+→** to-trinns innrykk (samme nivå som forrige → barn av forrige).
  - **Alt+←** rykke ut ett nivå.
  - **Alt+↑/↓** flytte (blokk hvis markert) **innen samme parent**.
  - Typografi pr nivå: parent=fet, nivå1=kursiv, nivå≥2=kursiv+0.95em.
- **Clipboard**:
  - **Copy**: TSV.
  - **Paste**: TSV + enkel HTML-tabell (fra Excel/Sheets). Overskriver utvalg.
- **Validering**:
  - `Column.validate(value, row)` → `true | string | false`.
  - Ved feil: rød kant/markering, commit blokkeres og editor blir stående.

## Props

```ts
type Column = {
  key: string; name: string; width?: number; editable?: boolean;
  validate?: (value:any,row:Row)=>true|string|false
}
type Row = { id?: string|number; parentId?: string|number|null } & Record<string,any>

type TableCoreProps = {
  columns: Column[]
  rows: Row[]
  onRowsChange: (rows: Row[]) => void
  onPatch?: (patch: { rowIndex:number; key:string; prev:any; next:any }) => void
  onCommit?: (rows: Row[]) => void
  onSelectionChange?: (sel: {r1:number;c1:number;r2:number;c2:number}) => void
  onReorderRows?: (args: { fromIndex:number; toIndex:number; count:number; parentId?:string|number|null }) => void
  onReorderColumns?: (args: { fromIndex:number; toIndex:number }) => void
  rowHeight?: number
  headerHeight?: number
  treeMode?: boolean
}
