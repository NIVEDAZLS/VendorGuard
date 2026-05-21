"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Activity,
  Search,
  Download,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { useDataStore } from "@/lib/store"
import { format } from "date-fns"
import { FormattedDate } from "@/components/shared/DateDisplay"
import { TimeAgo } from "@/components/shared/DynamicValues"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/layout"
import { EmptyState } from "@/components/layout"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const actorStyles: Record<string, string> = {
  user: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  system: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ai: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
}

const entityTypes = ["contract", "vendor", "datasource", "event", "breach", "claim", "response"]

export default function AuditPage() {
  const auditEntries = useDataStore((s) => s.auditEntries)
  const [search, setSearch] = useState("")
  const [entityFilter, setEntityFilter] = useState("all")
  const [actorFilter, setActorFilter] = useState("all")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    return auditEntries
      .filter((e) => {
        if (entityFilter !== "all" && e.entityType !== entityFilter) return false
        if (actorFilter !== "all" && e.actor !== actorFilter) return false
        if (!search) return true
        const q = search.toLowerCase()
        return (
          e.action.toLowerCase().includes(q) ||
          e.entityId.toLowerCase().includes(q) ||
          e.entityType.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q)
        )
      })
      .sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
  }, [auditEntries, search, entityFilter, actorFilter])

  const handleExportCSV = () => {
    const rows = [
      ["ID", "Timestamp", "Entity Type", "Entity ID", "Action", "Actor", "Payload"].join(","),
      ...filtered.map((e) =>
        [
          e.id,
          e.timestamp,
          e.entityType,
          e.entityId,
          e.action,
          e.actor,
          JSON.stringify(e.payload).replace(/"/g, '""'),
        ]
          .map((c) => `"${c}"`)
          .join(",")
      ),
    ].join("\r\n")

    const blob = new Blob(["\uFEFF" + rows], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="System activity and change history"
      />

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search entries..."
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {entityTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actorFilter} onValueChange={setActorFilter}>
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="Actor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actors</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="ai">AI</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No audit entries found"
          description={
            search || entityFilter !== "all" || actorFilter !== "all"
              ? "Try adjusting your filters."
              : "No system activity recorded yet."
          }
        />
      ) : (
        <div className="rounded-md border">
          <div className="divide-y">
            {filtered.map((entry) => {
              const isExpanded = expanded.has(entry.id)
              const actorClass = actorStyles[entry.actor] ?? "bg-muted text-muted-foreground"
              const entityLink =
                entry.entityType === "breach"
                  ? `/breaches/${entry.entityId}`
                  : entry.entityType === "claim"
                    ? `/claims/${entry.entityId}`
                    : entry.entityType === "contract"
                      ? `/contracts/${entry.entityId}`
                      : entry.entityType === "vendor"
                        ? `/vendors/${entry.entityId}`
                        : null

              return (
                <div
                  key={entry.id}
                  className="px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* Expand */}
                    <button
                      onClick={() => toggleExpand(entry.id)}
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${actorClass}`}
                        >
                          {entry.actor}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {entry.entityType}
                        </Badge>
                        {entityLink ? (
                          <Link
                            href={entityLink}
                            className="font-mono text-xs text-emerald-600 hover:underline"
                          >
                            {entry.entityId}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {entry.entityId}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground font-medium">
                          {entry.action.replace(/\./g, " · ")}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <TimeAgo date={entry.timestamp} />
                        <span className="text-muted-foreground/50">·</span>
                        <span suppressHydrationWarning>
                          <FormattedDate
                            date={entry.timestamp}
                            formatStr="MMM dd, yyyy HH:mm:ss"
                          />
                        </span>
                      </div>

                      {/* Expandable payload */}
                      {isExpanded && (
                        <pre className="mt-2 rounded bg-muted p-3 text-xs font-mono overflow-x-auto">
                          {JSON.stringify(entry.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Count */}
      <p className="text-xs text-muted-foreground text-center">
        Showing {filtered.length} of {auditEntries.length} entries
      </p>
    </div>
  )
}
