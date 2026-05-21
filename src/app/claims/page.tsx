"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Mail, Search } from "lucide-react"
import { useDataStore } from "@/lib/store"
import { FormattedDate } from "@/components/shared/DateDisplay"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/layout"
import { EmptyState } from "@/components/layout"

const claimStatusStyles: Record<string, "secondary" | "warning" | "success" | "destructive" | "outline"> = {
  draft: "secondary",
  sent: "warning",
  recovered: "success",
  disputed: "destructive",
}

export default function ClaimsPage() {
  const { claims, breaches, operationalEvents, vendors } = useDataStore()
  const [search, setSearch] = useState("")

  const rows = useMemo(() => {
    const sorted = [...claims].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    return sorted
      .map((claim) => {
        const breach = breaches.find((b) => b.id === claim.breachId)
        const event = breach
          ? operationalEvents.find((e) => e.id === breach.eventId)
          : undefined
        const vendor = event
          ? vendors.find((v) => v.id === event.vendorId)
          : undefined

        return { claim, breach, event, vendor }
      })
      .filter(({ claim, vendor, event: evt }) => {
        if (!search) return true
        const q = search.toLowerCase()
        return (
          vendor?.name.toLowerCase().includes(q) ||
          claim.recipientEmail.toLowerCase().includes(q) ||
          claim.draftSubject.toLowerCase().includes(q) ||
          evt?.externalId.toLowerCase().includes(q) ||
          claim.id.toLowerCase().includes(q)
        )
      })
  }, [claims, breaches, operationalEvents, vendors, search])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Claims"
        description="Track and manage all SLA penalty claims"
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search claims..."
          className="pl-8 h-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No claims yet"
          description="Claims will appear here once they are drafted or sent."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim ID</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Breach</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Drafted</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ claim, vendor }) => (
                <TableRow key={claim.id}>
                  <TableCell>
                    <Link
                      href={`/claims/${claim.id}`}
                      className="font-mono text-xs text-emerald-600 hover:underline"
                    >
                      {claim.id}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    {vendor?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    {breaches.find((b) => b.id === claim.breachId) ? (
                      <Link
                        href={`/breaches/${claim.breachId}`}
                        className="text-xs text-emerald-600 hover:underline font-mono"
                      >
                        {claim.breachId}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground font-mono">
                        {claim.breachId}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {claim.recipientEmail}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
                    <FormattedDate date={claim.createdAt} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
                    {claim.sentAt
                      ? <FormattedDate date={claim.sentAt} />
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={claimStatusStyles[claim.status] ?? "secondary"}
                      className="text-xs"
                    >
                      {claim.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
