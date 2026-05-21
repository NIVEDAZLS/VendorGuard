"use client"

import { Shield } from "lucide-react"

export function Footer() {
  return (
    <footer className="border-t mt-12">
      <div className="px-6 py-4 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-emerald-600" />
          <span>VendorGuard — Demo Build</span>
        </div>
        <p>Backend and AI are simulated. Built for Ideathon 2026.</p>
      </div>
    </footer>
  )
}
