export const SRC_TYPES_TS = `export type ColType = 'text' | 'number' | 'date' | 'color'


export type Column = {
id: string
title: string
width?: number
type?: ColType
// For summeringer – sum vises kun i summaryRow for 'number'
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
`;
