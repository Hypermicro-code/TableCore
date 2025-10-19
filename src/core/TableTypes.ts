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
/** true = kan summeres i sammendragsrad */
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
/** viser sammendragslinje mellom header og første rad */
showSummary?: boolean
}
// ==== [BLOCK: Types] END ====
