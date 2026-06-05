"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"
import { CommandPalette } from "@/components/shared/CommandPalette"
import { FirstTimeTour } from "@/components/shared/FirstTimeTour"
import { DebugOverlay } from "@/components/shared/DebugOverlay"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Don't render the shell chrome on the login page
  if (pathname.startsWith("/login")) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div
        className="transition-all duration-300"
        style={{ paddingLeft: collapsed ? "4rem" : "220px" }}
      >
        <TopBar />
        <main className="p-6 pb-0">{children}</main>
      </div>
      <CommandPalette />
      <FirstTimeTour />
      <DebugOverlay />
    </div>
  )
}
