// ==== [BLOCK: Types] BEGIN ====
export type CellValue = string | number | ''

export type ColumnType = 'text' | 'number'

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

  /**
   * Viser sammendragslinje mellom header og første rad.
   * Hvis 'summaryValues' er satt, brukes disse verdiene (fra app/prosjekt).
   * Hvis ikke, faller vi tilbake til automatisk summering for numeriske kolonner
   * som har summarizable:true.
   */
  showSummary?: boolean
  summaryValues?: Record<string, CellValue>
  /** Teksten i tittelkolonnen for sammendragslinja hvis title-cellen ellers er tom */
  summaryTitle?: string
}
// ==== [BLOCK: Types] END ====
