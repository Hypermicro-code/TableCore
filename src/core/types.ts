/** Kolonnedefinisjon for TableCore */
export type Column = {
  /** Unik nøkkel mot felt i rad-objektet */
  key: string
  /** Visningsnavn i header */
  name: string
  /** Piksler, valgfri – enkel fast bredde i v1 */
  width?: number
  /** Om celler kan redigeres */
  editable?: boolean
}

/** En rad er et "map" fra kolonnenøkler til verdier */
export type Row = Record<string, any>

/** Utvalg (rektangel) i gridet, inkl. anker og aktiv */
export type Selection = {
  r1: number, c1: number, r2: number, c2: number
}

/** Patch brukes for Undo/Redo (enkelt i v1) */
export type Patch = {
  rowIndex: number
  key: string
  prev: any
  next: any
}

