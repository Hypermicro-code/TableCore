import React from "react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { getCommandsByIds, runCommand } from "@/core/CommandRegistry"
import { ToolbarContext, ToolbarGroupDef } from "@/core/types"
import ToolbarButton from "./ToolbarButton"

export default function ToolbarGroup({group, ctx}:{group: ToolbarGroupDef; ctx: ToolbarContext}){
  const { t } = useTranslation()
  const commands = useMemo(()=> getCommandsByIds(group.commandIds), [group.commandIds])

  return (
    <div className="tb-group" role="group" aria-label={group.titleKey ? t(group.titleKey) : undefined}>
      {commands.filter(c => c.isVisible ? c.isVisible(ctx) : true).map(cmd => {
        const enabled = cmd.isEnabled ? cmd.isEnabled(ctx) : true
        return (
          <ToolbarButton
            key={cmd.id}
            onClick={() => runCommand(cmd.id, ctx)}
            disabled={!enabled}
            icon={cmd.icon}
            label={t(cmd.labelKey)}
            tooltip={cmd.shortcut ? `${t(cmd.labelKey)} (${cmd.shortcut})` : t(cmd.labelKey)}
          />
        )
      })}
    </div>
  )
}
