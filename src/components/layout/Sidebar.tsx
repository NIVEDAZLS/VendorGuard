"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Shield,
  LayoutDashboard,
  Building2,
  Database,
  AlertTriangle,
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useState } from "react"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, shortcut: "⌥D" },
  { href: "/vendors", label: "Vendors & Contracts", icon: Building2, shortcut: "⌥V" },
  { href: "/operations", label: "Operations", icon: Database },
  { href: "/breaches", label: "Breaches & Claims", icon: AlertTriangle, shortcut: "⌥B" },
  { href: "/audit", label: "Audit Log", icon: Activity },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 flex h-full flex-col border-r bg-background transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-14 items-center border-b px-4",
          collapsed && "justify-center px-0"
        )}
      >
        <Shield className="h-5 w-5 shrink-0 text-emerald-600" />
        {!collapsed && (
          <span className="ml-2.5 text-sm font-semibold tracking-tight">
            VendorGuard
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href) ||
                (item.href === "/vendors" && pathname.startsWith("/contracts")) ||
                (item.href === "/breaches" && pathname.startsWith("/claims"))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
                isActive
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "text-muted-foreground",
                collapsed && "justify-center px-0"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && item.shortcut && (
                <kbd className="text-[10px] text-muted-foreground/50 font-mono">{item.shortcut}</kbd>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div
        className={cn(
          "flex items-center gap-3 border-t px-4 py-3",
          collapsed && "justify-center px-0"
        )}
      >
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-medium dark:bg-emerald-900 dark:text-emerald-300">
            DU
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Demo User</p>
            <p className="text-xs text-muted-foreground truncate">
              admin@vendorguard.io
            </p>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground"
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
