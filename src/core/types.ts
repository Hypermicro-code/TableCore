import { ReactNode } from "react"

export type Role = "admin" | "kontor" | "felt"

export type ToolbarContext = {
  role: Role
  online: boolean
  dirty: boolean
  selection?: { rows: number[]; cols?: number[] }
  zoom: number
  density: "compact" | "comfortable"
  app: "progress" | "estimates" | "documents" | "generic"
}

export type CommandRun = (ctx: ToolbarContext, payload?: unknown) => void | Promise<void>

export type Command = {
  id: string                         // f.eks. "toolbar.file.save"
  labelKey: string                   // i18n nøkkel
  icon?: ReactNode                   // lucide icon element
  shortcut?: string                  // "Ctrl+S"
  group: string                      // "file", "edit", "view", "hierarchy", ...
  isEnabled?: (ctx: ToolbarContext) => boolean
  isVisible?: (ctx: ToolbarContext) => boolean
  run: CommandRun
}

export type ToolbarGroupDef = {
  id: string
  titleKey?: string
  commandIds: string[]
}

export type SlotArea = "left" | "center" | "right"

export type SlotInjection = {
  area: SlotArea
  order: number
  groups: ToolbarGroupDef[]
}
