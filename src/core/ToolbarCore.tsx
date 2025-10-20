import React from "react"
import { useTranslation } from "react-i18next"
import ToolbarGroup from "@/components/ToolbarGroup"
import OverflowMenu from "@/components/OverflowMenu"
import { ToolbarContext, ToolbarGroupDef, SlotInjection } from "./types"
import { registerCommands } from "./CommandRegistry"
import {
  Save, Undo2, Redo2, ZoomIn, ZoomOut, Square, ChevronRight, ChevronLeft, Search, HelpCircle, User, Cloud
} from "lucide-react"

// ===== [BLOCK: Default Commands] BEGIN =====
registerCommands([
  {
    id: "toolbar.file.save",
    labelKey: "file.save",
    icon: <Save />,
    shortcut: "Ctrl+S",
    group: "file",
    isEnabled: (ctx)=> ctx.online || true,
    run: (ctx)=> { console.log("Save run", ctx); alert("Lagre (demo)"); }
  },
  { id:"toolbar.edit.undo", labelKey:"edit.undo", icon:<Undo2/>, shortcut:"Ctrl+Z", group:"edit", run:()=>alert("Angre (demo)") },
  { id:"toolbar.edit.redo", labelKey:"edit.redo", icon:<Redo2/>, shortcut:"Shift+Ctrl+Z", group:"edit", run:()=>alert("Gjør om (demo)") },

  { id:"toolbar.view.zoomout", labelKey:"view.zoomout", icon:<ZoomOut/>, group:"view",
    run:(ctx)=>console.log("Zoom - (demo)", ctx) },
  { id:"toolbar.view.zoomreset", labelKey:"view.zoomreset", icon:<Square/>, group:"view",
    run:(ctx)=>console.log("Zoom 100% (demo)", ctx) },
  { id:"toolbar.view.zoomin", labelKey:"view.zoomin", icon:<ZoomIn/>, group:"view",
    run:(ctx)=>console.log("Zoom + (demo)", ctx) },

  { id:"toolbar.hierarchy.indent", labelKey:"hierarchy.indent", icon:<ChevronRight/>, group:"hierarchy", run:()=>alert("Innrykk (demo)") },
  { id:"toolbar.hierarchy.outdent", labelKey:"hierarchy.outdent", icon:<ChevronLeft/>, group:"hierarchy", run:()=>alert("Utrykk (demo)") },

  { id:"toolbar.help.shortcuts", labelKey:"help.shortcuts", icon:<HelpCircle/>, group:"help", run:()=>alert("Snarveier (demo)") }
])
// ===== [BLOCK: Default Commands] END =====

// ===== [BLOCK: Default Groups] BEGIN =====
const GROUPS_LEFT: ToolbarGroupDef[] = [
  { id:"grp-file", commandIds:["toolbar.file.save"] },
  { id:"grp-undo", commandIds:["toolbar.edit.undo","toolbar.edit.redo"] }
]

const GROUPS_CENTER: ToolbarGroupDef[] = [
  { id:"grp-view", commandIds:["toolbar.view.zoomout","toolbar.view.zoomreset","toolbar.view.zoomin"] },
  { id:"grp-hierarchy", commandIds:["toolbar.hierarchy.indent","toolbar.hierarchy.outdent"] }
]

const GROUPS_RIGHT: ToolbarGroupDef[] = [
  // søk som knapp (demo). Senere kan dette bli inputfelt i høyresonen:
  { id:"grp-help", commandIds:["toolbar.help.shortcuts"] }
]
// ===== [BLOCK: Default Groups] END =====

type Props = {
  ctx: ToolbarContext
  slots?: SlotInjection[]   // apper kan injisere egne grupper
  projectName?: string
  status?: "saved" | "autosave" | "offline"
}

export default function ToolbarCore({ctx, slots = [], projectName="Uten navn", status="saved"}: Props){
  const { t } = useTranslation()

  // del opp slots per sone og sorter på order
  const leftSlots = slots.filter(s => s.area==="left").sort((a,b)=>a.order-b.order)
  const centerSlots = slots.filter(s => s.area==="center").sort((a,b)=>a.order-b.order)
  const rightSlots = slots.filter(s => s.area==="right").sort((a,b)=>a.order-b.order)

  // overflow: i denne enkle startpakka sender vi midtsonen + "ekstra" grupper til overflow på smal skjerm.
  const [overflowOpen, setOverflowOpen] = React.useState(false)

  return (
    <div className="toolbar" role="toolbar" aria-label="Hovedverktøylinje">
      {/* VENSTRE */}
      <div className="tb-left">
        {/* Prosjektnavn + status-chip */}
        <div className="status-chip" aria-live="polite">
          <span>{projectName}</span>
          <span className={`status-dot ${status==="saved" ? "status-ok" : status==="offline" ? "status-off" : ""}`} />
        </div>

        <div className="tb-divider" />

        {GROUPS_LEFT.map(g => <ToolbarGroup key={g.id} group={g} ctx={ctx} />)}
        {leftSlots.map(slot => slot.groups.map(g => <ToolbarGroup key={g.id} group={g} ctx={ctx}/>))}
      </div>

      {/* MIDT */}
      <div className="tb-center">
        {GROUPS_CENTER.map(g => <ToolbarGroup key={g.id} group={g} ctx={ctx} />)}
        {centerSlots.map(slot => slot.groups.map(g => <ToolbarGroup key={g.id} group={g} ctx={ctx}/>))}
      </div>

      {/* HØYRE */}
      <div className="tb-right">
        {/* Søk-knapp (placeholder) */}
        <button className="tb-btn" title={t("search.placeholder")} aria-label={t("search.placeholder")}>
          <span className="tb-icon"><Search/></span>
        </button>

        <div className="tb-divider" />

        {rightSlots.map(slot => slot.groups.map(g => <ToolbarGroup key={g.id} group={g} ctx={ctx}/>))}
        {GROUPS_RIGHT.map(g => <ToolbarGroup key={g.id} group={g} ctx={ctx} />)}

        {/* Bruker & Synk indikator (demo) */}
        <span className="status-chip" title="Profil">
          <span className="tb-icon"><User/></span> admin
        </span>
        <span className="status-chip" title="Synk">
          <span className="tb-icon"><Cloud/></span> {ctx.online ? "Online" : "Offline"}
        </span>

        {/* Overflow-knapp for smal skjerm (demo viser samme grupper) */}
        <div className="tb-overflow">
          <button className="tb-btn" onClick={()=>setOverflowOpen(v=>!v)} aria-haspopup="menu" aria-expanded={overflowOpen ? "true":"false"}>⋯</button>
          {overflowOpen && (
            <div className="tb-overflow-panel" role="menu">
              {[...GROUPS_CENTER, ...GROUPS_RIGHT].map(g => <ToolbarGroup key={"ov-"+g.id} group={g} ctx={ctx} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
