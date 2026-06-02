"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  FileText,
  AlertTriangle,
  Mail,
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"

const navSections = [
  {
    label: "Monitor",
    items: [
      { href: "/", label: "Portfolio Overview", icon: LayoutDashboard },
      { href: "/contracts", label: "Contract Manager", icon: FileText },
      { href: "/breaches", label: "Breach Log", icon: AlertTriangle },
    ],
  },
  {
    label: "Actions",
    items: [
      { href: "/claims", label: "Dispute Review", icon: Mail },
      { href: "/audit", label: "Audit Records", icon: Activity },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  function isActive(href: string) {
    if (href === "/") return pathname === "/"
    if (href === "/contracts") return pathname.startsWith("/contracts")
    if (href === "/breaches") return pathname.startsWith("/breaches")
    if (href === "/claims") return pathname.startsWith("/claims")
    if (href === "/audit") return pathname.startsWith("/audit")
    return false
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 flex h-full flex-col border-r bg-background transition-all duration-300",
        collapsed ? "w-16" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-14 items-center border-b px-4 gap-3",
          collapsed && "justify-center px-0"
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white font-bold text-sm font-mono">
          VG
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight tracking-tight">VendorGuard</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-tight mt-0.5">
              SLA Intelligence
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {navSections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="mb-1 px-3 text-[9px] font-semibold uppercase tracking-[1.5px] text-muted-foreground/60">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      "hover:bg-emerald-50 hover:text-emerald-700",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                      active
                        ? "bg-emerald-50 text-emerald-700 border-l-2 border-emerald-500"
                        : "text-muted-foreground border-l-2 border-transparent",
                      collapsed && "justify-center px-2"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="border-t px-4 py-3 text-xs text-muted-foreground flex items-center gap-1.5">
          <span className="vg-pulse-dot bg-emerald-500 shrink-0" />
          Monitoring active · 3 vendors
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>
    </aside>
  )
}
