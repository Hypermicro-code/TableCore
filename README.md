# TableCore – v1 komplett (Etappe 1–5)

**Formål:** robust, modulær tabell-kjerne for **Progress**, **Estimates** og **Forms**.

## Funksjoner

- **Grid**: mørkt tema, skarpe hjørner, virtuell rulling (10–50k+ rader).
- **Markering**: klikk / Shift+klikk / klikk+drag (rektangel).
- **Navigasjon**: piltaster, Tab, Enter (rediger), Delete (tøm utvalg),
  **Home/End** (start/slutt av rad), **PageUp/PageDown** (en skjerm).
- **Redigering**: klikk = rediger, dobbeltklikk = marker tekst; editor uten hvit bakgrunn (kant-i-kant).
- **Validering**: `Column.validate(value,row) → true | string | false`; ved feil blokkeres commit og felt vises med rød kant.
- **Undo/Redo**: lokalt per tabell (**Ctrl/Cmd+Z**, **Ctrl/Cmd+Y**).
- **#-kolonne**: radnummer (skjules på tom rad), caret (▸/▾) for expand/collapse, drag-handle for rader. Headeren er låst, ikke-drabar.
- **Dra/slipp**:
  - Kolonner i header (unntatt `#`).
  - Rader (inkl. blokk ved multi-markering).
- **Tre-modus**:
  - `parentId` per rad, expand/collapse via caret og **Ctrl/Cmd+←/→**.
  - **Alt+→** to-trinns innrykk (samme nivå som forrige → barn av forrige).
  - **Alt+←** rykke ut ett nivå.
  - **Alt+↑/↓** flytte (blokk hvis markert) **innen samme parent**.
  - Typografi pr nivå: parent=fet, nivå1=kursiv, nivå≥2=kursiv+0.95em.
- **Clipboard**:
  - **Copy**: TSV.
  - **Paste**: TSV + enkel HTML-tabell (fra Excel/Sheets). Overskriver utvalg.

## Props

```ts
type Column = {
  key: string
  name: string
  width?: number
  editable?: boolean
  validate?: (value:any, row:Row) => true | string | false
}

type Row = {
  id?: string | number
  parentId?: string | number | null
} & Record<string, any>

type Patch = { rowIndex: number; key: string; prev: any; next: any }
type Selection = { r1:number; c1:number; r2:number; c2:number }

type TableCoreProps = {
  columns: Column[]
  rows: Row[]
  onRowsChange: (rows: Row[]) => void

  onPatch?: (patch: Patch) => void
  onCommit?: (rows: Row[]) => void
  onSelectionChange?: (sel: Selection) => void
  onReorderRows?: (args: { fromIndex:number; toIndex:number; count:number; parentId?:string|number|null }) => void
  onReorderColumns?: (args: { fromIndex:number; toIndex:number }) => void

  rowHeight?: number           // default 28
  headerHeight?: number        // default 30
  viewportHeight?: number      // default 480 (px)
  treeMode?: boolean           // default true
  expandAllByDefault?: boolean // default false
}
