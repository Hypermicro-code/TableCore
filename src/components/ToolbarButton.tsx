import React from "react"
import { cn } from "../utils"
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode
  label?: string
  tooltip?: string
  pressed?: boolean
}
export default function ToolbarButton({icon, label, tooltip, pressed, className, ...rest}: Props){
  return (
    <button
      className={cn("tb-btn", className)}
      title={tooltip}
      aria-pressed={pressed ? "true" : "false"}
      {...rest}
    >
      {icon && <span className="tb-icon">{icon}</span>}
      {label && <span>{label}</span>}
    </button>
  )
}

// tiny util
export function IconWrap({children}:{children:React.ReactNode}){
  return <span className="tb-icon" aria-hidden="true">{children}</span>
}
