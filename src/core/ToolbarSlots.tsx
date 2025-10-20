import React from "react"
import { SlotInjection } from "./types"

/** En enkel slot-container: apper kan sende inn SlotInjection[] til ToolbarCore */
export default function ToolbarSlots({injections}:{injections: SlotInjection[]}){
  // Denne komponenten brukes internt i ToolbarCore (for klarhet ligger den separat)
  return <>{/* no-op, selve rendring gjøres i ToolbarCore via props */}</>
}
