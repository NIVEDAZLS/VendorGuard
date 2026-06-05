"use client"

import { usePathname } from "next/navigation"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

function useBreadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)
  const crumbs: { label: string; href: string }[] = []

  const labels: Record<string, string> = {
    vendors: "Contract Manager",
    contracts: "Contract Manager",
    operations: "Operations",
    breaches: "Breach Log",
    claims: "Dispute Review",
    audit: "Audit Records",
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

      {/* Right side — theme toggle only */}
      <div className="flex items-center gap-2">
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
