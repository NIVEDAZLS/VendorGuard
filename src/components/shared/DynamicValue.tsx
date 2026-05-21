"use client"

import { useState, useEffect } from "react"

export function DynamicValue({ children, className }: { children: React.ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return <span className={className} aria-hidden />
  return <span className={className}>{children}</span>
}
