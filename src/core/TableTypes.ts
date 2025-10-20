// ==== [BLOCK: Types] BEGIN ====
export type CellValue = string | number | ''

export type ColumnType = 'text' | 'number' | 'date' | 'datetime'

/**
 * For dato/datetime-kolonner kan du sette dateRole:
 *  - 'start'  = viser min (tidligste) i parent-aggregat
 *  - 'end'    = viser max (seneste) i parent-aggregat
 *  - undefined (eller annet) = auto (viser "min → max")
 */
export type ColumnDef = {
  key: string
  title: string
  width?: number
  type?: ColumnType
  isTitle?: boolean
  summarizable?: boolean
  dateRole?: 'start' | 'end'
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
  showSummary?: boolean
  summaryValues?: Record<string, CellValue>
  summaryTitle?: string
}
// ==== [BLOCK: Types] END ====
