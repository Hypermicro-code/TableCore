import React from "react"
import { useTranslation } from "react-i18next"
import { getCommandsByIds } from "@/core/CommandRegistry"
import type { ToolbarContext, ToolbarGroupDef } from "@/core/types"

type Props = {
  group: ToolbarGroupDef
  ctx: ToolbarContext
}

/**
 * Viser en (flat) gruppe med knapper i ribbon/toolbar.
 * Henter kommandoer via CommandRegistry og kaller cmd.run(ctx) ved klikk.
 */
export default function ToolbarGroup({ group, ctx }: Props) {
  const { t } = useTranslation()
  const cmds = getCommandsByIds(group.commandIds || [])

  return (
    <div className="tb-group" aria-label={group.id}>
      {cmds.map((cmd) => {
        if (!cmd) return null

        const visible = cmd.isVisible ? !!cmd.isVisible(ctx) : true
        if (!visible) return null

        const enabled = cmd.isEnabled ? !!cmd.isEnabled(ctx) : true
        const label = cmd.labelKey ? t(cmd.labelKey as any) : ""
        const title =
          cmd.shortcut && label ? `${label} (${cmd.shortcut})` : label || undefined

        const ariaPressed =
          typeof (cmd as any).pressed === "function"
            ? ((cmd as any).pressed(ctx) ? "true" : "false")
            : undefined

        return (
          <button
            key={cmd.id}
            className="tb-btn"
            type="button"
            onClick={() => {
              if (!enabled) return
              try {
                cmd.run?.(ctx)
              } catch (err) {
                console.error(`Command failed: ${cmd.id}`, err)
              }
            }}
            disabled={!enabled}
            title={title}
            aria-label={label || cmd.id}
            aria-pressed={ariaPressed}
          >
            {cmd.icon ? <span className="tb-icon">{cmd.icon}</span> : null}
            <span>{label || cmd.id}</span>
          </button>
        )
      })}
    </div>
  )
}
