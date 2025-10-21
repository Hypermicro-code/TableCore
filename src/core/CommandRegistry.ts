/* ============================================================================
   Morning Coffee Labs – Command Registry Core
   Felles kommandobus for alle apper i Manage-systemet
   ============================================================================ */

/** Grunnstruktur for en kommando (én knapp i toolbaren) */
export type Command = {
  /** Stabil, unik ID, f.eks. "toolbar.file.save" */
  id: string
  /** i18n-nøkkel eller visningsnavn */
  labelKey: string
  /** Ikon-komponent (React-element) */
  icon?: React.ReactNode
  /** Gruppe (brukes i toolbarens layout) */
  group?: string
  /** Tastatursnarvei, f.eks. "Ctrl+S" */
  shortcut?: string
  /** Funksjon som kjøres når brukeren klikker / aktiverer kommandoen */
  run?: (ctx: any, payload?: any) => void
  /** Skal knappen være synlig i gjeldende kontekst? */
  isVisible?: (ctx: any) => boolean
  /** Skal knappen være aktivert (ikke grået ut)? */
  isEnabled?: (ctx: any) => boolean
  /** Skal knappen ha vedvarende "på"-tilstand? (toggle) */
  toggleable?: boolean
}

/* ---------------------------------------------------------------------------
   Intern lagring (enkelt globalt register)
--------------------------------------------------------------------------- */
const registry = new Map<string, Command>()

/**
 * Registrer én eller flere kommandoer i systemet.
 * Kan kalles fra hvilken som helst app/modul.
 */
export function registerCommands(cmds: Command[]) {
  for (const cmd of cmds) {
    if (!cmd.id) {
      console.warn("Command missing id:", cmd)
      continue
    }
    if (registry.has(cmd.id)) {
      console.warn(`Command already registered: ${cmd.id}`)
      continue
    }
    registry.set(cmd.id, cmd)
  }
}

/**
 * Hent én kommando via ID.
 */
export function getCommand(id: string): Command | undefined {
  return registry.get(id)
}

/**
 * Hent flere kommandoer i gitt rekkefølge.
 * (brukes av ToolbarGroup for å vise riktig sett med knapper)
 */
export function getCommandsByIds(ids: string[]): Command[] {
  return ids.map(id => registry.get(id)).filter(Boolean) as Command[]
}

/**
 * Fjern kommando (f.eks. ved hot reload eller midlertidig modul).
 */
export function unregisterCommand(id: string) {
  registry.delete(id)
}

/**
 * Tøm hele registeret (brukes sjelden, mest for tester).
 */
export function clearCommands() {
  registry.clear()
}

/**
 * Få alle registrerte kommandoer (til debugging eller logging)
 */
export function getAllCommands(): Command[] {
  return Array.from(registry.values())
}
