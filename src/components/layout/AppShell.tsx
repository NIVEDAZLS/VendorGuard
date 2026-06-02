"use client"

import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"
import { CommandPalette } from "@/components/shared/CommandPalette"
import { FirstTimeTour } from "@/components/shared/FirstTimeTour"
import { DebugOverlay } from "@/components/shared/DebugOverlay"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="pl-[220px] transition-all duration-300">
        <TopBar />
        <main className="p-6 pb-0">{children}</main>
      </div>
      <CommandPalette />
      <FirstTimeTour />
      <DebugOverlay />
    </div>
  )
}
