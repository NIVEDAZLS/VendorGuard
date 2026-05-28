"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import {
  LayoutDashboard,
  Building2,
  Database,
  AlertTriangle,
  Mail,
  Activity,
} from "lucide-react"
import { useDataStore } from "@/lib/store"
import { cn } from "@/lib/utils"

const pages = [
  { id: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard },
  { id: "vendors", href: "/vendors", label: "Vendors & Contracts", icon: Building2 },
  { id: "operations", href: "/operations", label: "Operations", icon: Database },
  { id: "breaches", href: "/breaches", label: "Breaches", icon: AlertTriangle },
  { id: "claims", href: "/claims", label: "Claims", icon: Mail },
  { id: "audit", href: "/audit", label: "Audit Log", icon: Activity },
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const vendors = useDataStore((s) => s.vendors)
  const breaches = useDataStore((s) => s.breaches)
  const claims = useDataStore((s) => s.claims)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
      // g + key shortcuts
      if (e.key === "d" && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.altKey) {
        e.preventDefault()
        router.push("/")
      }
      if (e.key === "v" && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.altKey) {
        e.preventDefault()
        router.push("/vendors")
      }
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.altKey) {
        e.preventDefault()
        router.push("/vendors")
      }
      if (e.key === "b" && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.altKey) {
        e.preventDefault()
        router.push("/breaches")
      }
      if (e.key === "m" && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.altKey) {
        e.preventDefault()
        router.push("/claims")
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [router])

  const run = useCallback(
    (href: string) => {
      setOpen(false)
      setQuery("")
      router.push(href)
    },
    [router]
  )

  return (
    <>
      {/* Invisible overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Quick search"
        className={cn(
          "fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg",
          "rounded-xl border bg-background shadow-2xl overflow-hidden"
        )}
      >
        <Command.Input
          placeholder="Search pages, vendors, breaches..."
          value={query}
          onValueChange={setQuery}
          className="w-full border-0 border-b px-4 py-3 text-sm outline-none bg-transparent placeholder:text-muted-foreground"
        />
        <Command.List className="max-h-72 overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          <Command.Group heading="Pages" className="text-xs text-muted-foreground px-2 py-1">
            {pages.map((p) => {
              const Icon = p.icon
              return (
                <Command.Item
                  key={p.id}
                  onSelect={() => run(p.href)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {p.label}
                </Command.Item>
              )
            })}
          </Command.Group>

          {vendors.length > 0 && (
            <Command.Group heading="Vendors" className="text-xs text-muted-foreground px-2 py-1">
              {vendors.map((v) => (
                <Command.Item
                  key={v.id}
                  onSelect={() => run(`/vendors/${v.id}`)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {v.name}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {breaches.length > 0 && (
            <Command.Group heading="Breaches" className="text-xs text-muted-foreground px-2 py-1">
              {breaches.slice(0, 5).map((b) => (
                <Command.Item
                  key={b.id}
                  onSelect={() => run(`/breaches/${b.id}`)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
                >
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  {b.id} — ₹{b.penaltyAmount.toLocaleString("en-IN")}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {claims.length > 0 && (
            <Command.Group heading="Claims" className="text-xs text-muted-foreground px-2 py-1">
              {claims.slice(0, 5).map((c) => (
                <Command.Item
                  key={c.id}
                  onSelect={() => run(`/claims/${c.id}`)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
                >
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {c.id} — {c.recipientEmail}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command.Dialog>
    </>
  )
}
