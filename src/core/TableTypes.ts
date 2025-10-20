// ==== [BLOCK: Types] BEGIN ====
export type CellValue = string | number | ''

export type ColumnType = 'text' | 'number' | 'date' | 'datetime' // ← la til dato-typer

export type ColumnDef = {
  key: string
  title: string
  width?: number
  type?: ColumnType
  /** true = dette er tittelkolonnen som får hierarki/innrykk */
  isTitle?: boolean
  /** true = kan summeres i fallback-sammendrag */
  summarizable?: boolean
}

export type RowData = {
  id: string
  indent: number // 0 = toppnivå
  cells: Record<string, CellValue>
}

export type Selection = {
  r1: number
  c1: number
  r2: number
  c2: number
}

export type TableCoreProps = {
  columns: ColumnDef[]
  rows: RowData[]
  onChange: (next: RowData[]) => void

  /** Sammendragslinje mellom header og første rad. */
  showSummary?: boolean
  summaryValues?: Record<string, CellValue>
  summaryTitle?: string
}
// ==== [BLOCK: Types] END ====
