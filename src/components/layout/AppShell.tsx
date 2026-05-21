"use client"

import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"
import { Footer } from "@/components/shared/Footer"
import { CommandPalette } from "@/components/shared/CommandPalette"
import { FirstTimeTour } from "@/components/shared/FirstTimeTour"
import { DebugOverlay } from "@/components/shared/DebugOverlay"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="pl-60 transition-all duration-300">
        <TopBar />
        <main className="p-6 pb-0">{children}</main>
        <Footer />
      </div>
      <CommandPalette />
      <FirstTimeTour />
      <DebugOverlay />
    </div>
  )
}
