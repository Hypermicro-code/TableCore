# TableCore – Etappe 1 (Grunn-grid)

Mål: grunnmodul for flere apper (Progress, Estimates, Forms). **Etappe 1** implementerer:

- Grid med rader/kolonner, skarpe hjørner, mørkt tema, god kontrast  
- Multi-markering: klikk, Shift+klikk, klikk+drag (rektangel)  
- Navigasjon: piltaster, Tab, Enter (starter redigering), Delete (tømmer utvalg)  
- Redigering: klikk for å redigere, dobbeltklikk for å markere tekst; editor uten hvit bakgrunn  
- Undo/Redo lokalt per tabell (Ctrl/Cmd+Z / Ctrl/Cmd+Y)  
- Virtuell rulling (testet med 50k rader)

## Bruk

- `npm i`
- `npm run dev` (lokalt) eller push rett til GitHub/Netlify/StackBlitz.

## Props (v1)

```ts
type Column = { key: string; name: string; width?: number; editable?: boolean }
type Row = Record<string, any>

type TableCoreProps = {
  columns: Column[]
  rows: Row[]
  onRowsChange: (rows: Row[]) => void
  onPatch?: (patch: { rowIndex:number; key:string; prev:any; next:any }) => void
  onCommit?: (rows: Row[]) => void
  onSelectionChange?: (sel: {r1:number;c1:number;r2:number;c2:number}) => void
  rowHeight?: number
  headerHeight?: number
}
