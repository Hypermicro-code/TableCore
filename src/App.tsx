import React from "react"
import "./index.css"
import "./i18n"
import ToolbarCore from "./core/ToolbarCore"
import { registerCommands } from "./core/CommandRegistry"
import { ToolbarContext, SlotInjection } from "./core/types"
import { Layers, Percent } from "lucide-react"

export default function App(){
  const [ctx, setCtx] = React.useState<ToolbarContext>({
    role: "admin",
    online: true,
    dirty: false,
    zoom: 1,
    density: "comfortable",
    app: "generic"
  })

  // DEMO: App-spesifikke kommandoer (injiseres via slots)
  React.useEffect(()=>{
    registerCommands([
      { id:"planning.timescale", labelKey:"Planning", icon:<Layers/>, group:"planning", run:()=>alert("Timeskala (demo)") },
      { id:"estimates.vat", labelKey:"MVA", icon:<Percent/>, group:"estimates", run:()=>alert("MVA-profil (demo)") }
    ])
  },[])

  const slots: SlotInjection[] = [
    {
      area: "center",
      order: 50,
      groups: [
        { id:"grp-planning", commandIds:["planning.timescale"] }
      ]
    },
    {
      area: "right",
      order: 10,
      groups: [
        { id:"grp-estimates", commandIds:["estimates.vat"] }
      ]
    }
  ]

  return (
    <>
      <ToolbarCore
        ctx={ctx}
        slots={slots}
        projectName="DemoProsjekt"
        status={ctx.online ? (ctx.dirty ? "autosave" : "saved") : "offline"}
      />
      <div style={{padding:16}}>
        <h1>ToolbarCore – Startpakke</h1>
        <p>Bygg videre med slots/kommandoer. Hjørner er spisse (radius 0px) i henhold til ønsket stil.</p>
        <div style={{display:"flex", gap:8, marginTop:16}}>
          <button onClick={()=>setCtx(c=>({...c, online: !c.online}))}>
            Toggle Online ({String(ctx.online)})
          </button>
          <button onClick={()=>setCtx(c=>({...c, dirty: !c.dirty}))}>
            Toggle Dirty ({String(ctx.dirty)})
          </button>
        </div>
      </div>
    </>
  )
}
