export type ColType = 'text' | 'number' | 'date' | 'color'

export type Column = {
  id: string
  title: string
  width?: number
  type?: ColType
}

export type Row = {
  id: string
  level: number // 0 = toppnivå, 1+ = under-rader
  cells: Record<string, string>
}

export type Selection = {
  start: { r: number; c: number } | null
  end: { r: number; c: number } | null
}
