"use client"

import { format } from "date-fns"

export function FormattedDate({
  date,
  formatStr = "MMM dd, yyyy",
  className,
}: {
  date: string | Date
  formatStr?: string
  className?: string
}) {
  return (
    <span className={className} suppressHydrationWarning>
      {format(new Date(date), formatStr)}
    </span>
  )
}
