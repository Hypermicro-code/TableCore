// ==== [BLOCK: Types] BEGIN ====

// Verdi i en celle. '' = tom streng. undefined brukes internt når felt ikke er satt.
export type CellValue = string | number | '' | undefined

export type ColumnType = 'text' | 'number' | 'date' | 'datetime'

/**
 * For dato/datetime-kolonner kan du sette dateRole:
 *  - 'start'  = viser min (tidligste) i parent-aggregat
 *  - 'end'    = viser max (seneste) i parent-aggregat
 *  - undefined = auto (viser "min → max" som en tekst i samme celle)
 */
export type ColumnDef = {
  key: string
  title: string
  width?: number            // brukes i grid-template-columns og kan endres via kolonne-resize
  type?: ColumnType
  isTitle?: boolean
  summarizable?: boolean
  dateRole?: 'start' | 'end'
}

export type RowData = {
  id: string
  indent: number            // 0 = toppnivå
  cells: Record<string, CellValue>
}

export type Selection = {
  r1: number
  c1: number
  r2: number
  c2: number
}

/**
 * UI-styring fra app (valgfritt).
 * Send kun det du vil overstyre – hvis du lar det være tomt, brukes tabellens standarder.
 */
export type TableUIOverrides = {
  rowHeightPx?: number      // eks. 28, 32, 40 ...
  fontSizePx?: number       // eks. 14, 16 ...
  colors?: Partial<{
    bg: string              // --tc-bg
    fg: string              // --tc-fg
    grid: string            // --tc-grid
    accent: string          // --tc-accent
    sel: string             // --tc-sel
    selBorder: string       // --tc-sel-border
    editBg: string          // --tc-edit-bg
  }>
}

export type TableCoreProps = {
  columns: ColumnDef[]
  rows: RowData[]
  onChange: (next: RowData[]) => void
  showSummary?: boolean
  summaryValues?: Record<string, CellValue> | null
  summaryTitle?: string

  // Valgfri UI-konfig fra appen
  ui?: TableUIOverrides
}
// ==== [BLOCK: Types] END ====
