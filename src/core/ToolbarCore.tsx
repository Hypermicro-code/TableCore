import React from "react"
import { useTranslation } from "react-i18next"
import ToolbarGroup from "@/components/ToolbarGroup"
import { ToolbarContext, ToolbarGroupDef, SlotInjection } from "./types"
import { registerCommands } from "./CommandRegistry"
import {
  Save, Undo2, Redo2, ZoomIn, ZoomOut, Square,
  Scissors, Copy, ClipboardPaste, Search,
  ChevronRight, ChevronLeft, Trash2, Plus, HelpCircle,
  Upload, Download, ListFilter, FileUp
} from "lucide-react"

/* ===== [BLOCK: Default Commands] ===== */
registerCommands([
  // File
  { id: "toolbar.file.save",   labelKey:"file.save",   icon:<Save/>,     group:"file",  shortcut:"Ctrl+S",        run:(ctx)=>alert("Lagre (demo)") },
  { id: "toolbar.file.import", labelKey:"file.import", icon:<Upload/>,   group:"file",                          run:()=>alert("Importer (demo)") },
  { id: "toolbar.file.export", labelKey:"file.export", icon:<Download/>, group:"file",                          run:()=>alert("Eksporter (demo)") },

  // Edit
  { id:"toolbar.edit.cut",     labelKey:"edit.cut",    icon:<Scissors/>,       group:"edit",                          run:()=>alert("Klipp (demo)") },
  { id:"toolbar.edit.copy",    labelKey:"edit.copy",   icon:<Copy/>,           group:"edit",                          run:()=>alert("Kopier (demo)") },
  { id:"toolbar.edit.paste",   labelKey:"edit.paste",  icon:<ClipboardPaste/>, group:"edit",                          run:()=>alert("Lim inn (demo)") },
  { id:"toolbar.edit.undo",    labelKey:"edit.undo",   icon:<Undo2/>,          group:"edit",  shortcut:"Ctrl+Z",      run:()=>alert("Angre (demo)") },
  { id:"toolbar.edit.redo",    labelKey:"edit.redo",   icon:<Redo2/>,          group:"edit",  shortcut:"Shift+Ctrl+Z", run:()=>alert("Gjør om (demo)") },
  { id:"toolbar.edit.delete",  labelKey:"edit.delete", icon:<Trash2/>,         group:"edit",                          run:()=>alert("Slett (demo)") },

  // View
  { id:"toolbar.view.zoomout",  labelKey:"view.zoomout",  icon:<ZoomOut/>,  group:"view", run:()=>alert("Zoom − (demo)") },
  { id:"toolbar.view.zoomreset", labelKey:"view.zoomreset", icon:<Square/>, group:"view", run:()=>alert("100% (demo)") },
  { id:"toolbar.view.zoomin",   labelKey:"view.zoomin",   icon:<ZoomIn/>,   group:"view", run:()=>alert("Zoom + (demo)") },
  { id:"toolbar.view.filter",   labelKey:"view.filter",   icon:<ListFilter/>, group:"view", run:()=>alert("Filter (demo)") },

  // Insert
  { id:"toolbar.insert.newrow",     labelKey:"insert.row",        icon:<Plus/>,   group:"insert", run:()=>alert("Ny rad (demo)") },
  { id:"toolbar.insert.attachment", labelKey:"insert.attachment", icon:<FileUp/>, group:"insert", run:()=>alert("Vedlegg (demo)") },

  // Tools (hierarki/rader)
  { id:"toolbar.hierarchy.indent",  labelKey:"hierarchy.indent",  icon:<ChevronRight/>, group:"tools", run:()=>alert("Innrykk (demo)") },
  { id:"toolbar.hierarchy.outdent", labelKey:"hierarchy.outdent", icon:<ChevronLeft/>,  group:"tools", run:()=>alert("Utrykk (demo)") },

  // Help
  { id:"toolbar.help.shortcuts", labelKey:"help.shortcuts", icon:<HelpCircle/>, group:"help", run:()=>alert("Snarveier (demo)") }
])

/* ===== [BLOCK: Groups per tab] ===== */
const GROUPS_MAP: Record<string, ToolbarGroupDef[]> = {
  File:  [ { id:"file-1", commandIds:["toolbar.file.save","toolbar.file.import","toolbar.file.export"] } ],
  Edit:  [
    { id:"edit-1", commandIds:["toolbar.edit.cut","toolbar.edit.copy","toolbar.edit.paste"] },
    { id:"edit-2", commandIds:["toolbar.edit.undo","toolbar.edit.redo","toolbar.edit.delete"] }
  ],
  View:  [
    { id:"view-1", commandIds:["toolbar.view.zoomout","toolbar.view.zoomreset","toolbar.view.zoomin"] },
    { id:"view-2", commandIds:["toolbar.view.filter"] }
  ],
  Insert:[ { id:"ins-1",  commandIds:["toolbar.insert.newrow","toolbar.insert.attachment"] } ],
  Tools: [ { id:"tools-1",commandIds:["toolbar.hierarchy.indent","toolbar.hierarchy.outdent"] } ],
  Help:  [ { id:"help-1", commandIds:["toolbar.help.shortcuts"] } ]
}

type Props = {
  ctx: ToolbarContext
  slots?: SlotInjection[]   // app-spesifikke grupper (renderes i ribbon når synlig)
  projectName?: string
  status?: "saved" | "autosave" | "offline"
  /** Appen kan sende inn ekstra innhold til høyre i menylinja (f.eks. logo). */
  headerRight?: React.ReactNode
}

export default function ToolbarCore({
  ctx,
  slots = [],
  projectName = "Uten navn",
  status = "saved",
  headerRight
}: Props){
  const { t } = useTranslation()
  const tabs = React.useMemo(()=>["File","Edit","View","Insert","Tools","Help"],[])
  // aktiv fane eller null hvis ribbon er skjult
  const [active, setActive] = React.useState<string | null>(null)

  // toggling: klikk på valgt fane => skjul; klikk på annen fane => vis ny
  const onTabClick = (tab: string) => {
    setActive(prev => (prev === tab ? null : tab))
  }

  // 🔔 Legg klasse på <html> når ribbon er åpen for sømløs styling i CSS
  React.useEffect(() => {
    const el = document.documentElement
    if (active) {
      el.classList.add("ribbon-open")
    } else {
      el.classList.remove("ribbon-open")
    }
    return () => { el.classList.remove("ribbon-open") }
  }, [active])

  // slots rendres etter base-gruppene når ribbon er synlig
  const slotGroups = slots.flatMap(s => s.groups)
  const groups = React.useMemo(() => {
    if (!active) return []
    const base = GROUPS_MAP[active] ?? []
    return [...base, ...slotGroups]
  }, [active, slotGroups])

  return (
    <>
      {/* ===== MENYLINJE ===== */}
      <div className="menubar" role="menubar" aria-label="Hovedmeny">
        <div className="menu-tabs">
          {tabs.map(tab => {
            const selected = active === tab
            return (
              <button
                key={tab}
                className="menu-tab"
                role="button"
                aria-expanded={selected ? "true" : "false"}
                aria-pressed={selected ? "true" : "false"}
                onClick={()=>onTabClick(tab)}
                title={tab}
              >
                {tab}
              </button>
            )
          })}
        </div>
        <div className="menu-right">
          <span className="status-chip" title={projectName}>
            <span>{projectName}</span>
            <span className={`status-dot ${status==="saved" ? "status-ok" : status==="offline" ? "status-off" : ""}`} />
          </span>
          <span className="status-chip" title="Søk">
            <span className="tb-icon"><Search/></span>
            <span>{t("search.placeholder")}</span>
          </span>
          {headerRight /* appen kan injisere logo/innhold */}
        </div>
      </div>

      {/* ===== RIBBON (vises bare når en fane er aktiv) ===== */}
      <div
        className={`ribbon ${active ? "" : "ribbon--hidden"}`}
        role="toolbar"
        aria-label={active ? `Ribbon: ${active}` : "Ribbon skjult"}
        aria-hidden={active ? "false" : "true"}
      >
        {active && groups.map(g => (
          <ToolbarGroup key={`${active}-${g.id}`} group={g} ctx={ctx} />
        ))}
      </div>
    </>
  )
}
