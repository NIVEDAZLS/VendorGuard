"use client"

import { usePathname } from "next/navigation"
import { Bell, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useDataStore } from "@/lib/store"
import { useEffect, useState } from "react"
import { DemoControlsSheet } from "@/components/shared/DemoControlsSheet"

function useBreadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)
  const crumbs: { label: string; href: string }[] = []

  const labels: Record<string, string> = {
    vendors: "Vendors & Contracts",
    contracts: "Contracts",
    operations: "Operations",
    breaches: "Breaches & Claims",
    claims: "Claims",
    audit: "Audit Log",
  }

  let href = ""
  for (const seg of segments) {
    href += `/${seg}`
    crumbs.push({
      label: labels[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1),
      href,
    })
  }

  return crumbs
}

export function TopBar() {
  const crumbs = useBreadcrumbs()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const atRiskCount = useDataStore((s) => s.atRiskItems.filter((a) => a.status === "pending").length)

  useEffect(() => setMounted(true), [])

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/80 backdrop-blur-sm px-6">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
        {crumbs.length === 0 ? (
          <span className="text-muted-foreground">Dashboard</span>
        ) : (
          crumbs.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-1">
              {i > 0 && (
                <span className="text-muted-foreground mx-1">/</span>
              )}
              <span
                className={
                  i === crumbs.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }
              >
                {crumb.label}
              </span>
            </span>
          ))
        )}
      </nav>

      {/* Right side */}
      <div className="flex items-center gap-2">
        <kbd className="hidden sm:inline-flex text-[10px] text-muted-foreground/50 font-mono mr-1 border rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
        <DemoControlsSheet />

        {/* Notification bell */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {atRiskCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] leading-none"
            >
              {atRiskCount}
            </Badge>
          )}
        </Button>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          {mounted && theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </header>
  )
}
