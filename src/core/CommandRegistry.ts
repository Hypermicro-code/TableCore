import { Command, ToolbarContext } from "./types"

type Store = {
  commands: Map<string, Command>
}

const store: Store = {
  commands: new Map<string, Command>()
}

export function registerCommands(cmds: Command[]){
  for(const c of cmds){
    store.commands.set(c.id, c)
  }
}

export function getCommand(id: string): Command | undefined {
  return store.commands.get(id)
}

export function getCommandsByIds(ids: string[]): Command[]{
  return ids.map(id => store.commands.get(id)).filter(Boolean) as Command[]
}

export function runCommand(id: string, ctx: ToolbarContext, payload?: unknown){
  const cmd = store.commands.get(id)
  if(!cmd) return
  if(cmd.isVisible && !cmd.isVisible(ctx)) return
  if(cmd.isEnabled && !cmd.isEnabled(ctx)) return
  return cmd.run(ctx, payload)
}
