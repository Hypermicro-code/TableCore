/** Kolonnedefinisjon for TableCore */
export type Column = {
  /** Unik nøkkel mot felt i rad-objektet */
  key: string
  /** Visningsnavn i header */
  name: string
  /** Fast bredde i px (v1–v2) */
  width?: number
  /** Om celler kan redigeres */
  editable?: boolean
  /** Validering: true/tekst=ok; string=feilmelding; false=ugyldig */
  validate?: (value: any, row: Row) => true | string | false
}

/** En rad: anbefalt å ha id og parentId for tre */
export type Row = {
  id?: string | number
  parentId?: string | number | null
} & Record<string, any>

/** Utvalg (rektangel) i *synlig liste* */
export type Selection = { r1: number, c1: number, r2: number, c2: number }

/** Patch for Undo/Redo */
export type Patch = { rowIndex: number, key: string, prev: any, next: any }

/** Reorder */
export type ReorderRowsArgs = {
  fromIndex: number
  toIndex: number
  count: number
  parentId?: string | number | null
}
export type ReorderColumnsArgs = { fromIndex: number, toIndex: number }
