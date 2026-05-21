"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Building2,
  Activity,
  UserCheck,
} from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { subDays, format, startOfDay } from "date-fns"

import { PageHeader } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useDataStore } from "@/lib/store"
import { formatCurrency, formatINR } from "@/lib/utils/format"
import { CurrencyValue, TimeAgo } from "@/components/shared/DynamicValues"
import { FileText, Database, Mail } from "lucide-react"
import type {
  OperationalEvent,
  AtRiskItem,
  Breach,
  AuditEntry,
  Vendor,
} from "@/lib/types"

// ─── KPI Card ────────────────────────────────────────────────────────────

function AnimatedNumber({ value, duration = 800 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef(0)

  useEffect(() => {
    fromRef.current = display
    startRef.current = null
    let frame: number
    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(fromRef.current + (value - fromRef.current) * eased))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  return <>{display.toLocaleString("en-IN")}</>
}

function KpiCard({
  label,
  value,
  formattedValue,
  trend,
  trendUp,
  icon: Icon,
  accent,
  thresholdAlert,
}: {
  label: string
  value: number
  formattedValue?: string
  trend: number
  trendUp: boolean
  icon: typeof ArrowUp
  accent: string
  thresholdAlert?: boolean
}) {
  return (
    <Card
      className={`relative overflow-hidden transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 ${thresholdAlert ? "border-l-4 border-l-amber-500" : ""}`}
      style={{ animationDelay: "0ms", animationFillMode: "both" }}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className={`h-4 w-4 ${accent}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight tabular-nums">
          {formattedValue ?? <AnimatedNumber value={value} />}
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs">
          {trendUp ? (
            <ArrowUp className="h-3 w-3 text-emerald-500" />
          ) : (
            <ArrowDown className="h-3 w-3 text-red-500" />
          )}
          <span className={trendUp ? "text-emerald-600" : "text-red-500"}>
            {Math.abs(trend)}%
          </span>
          <span className="text-muted-foreground ml-1">vs last month</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Chart ───────────────────────────────────────────────────────────────

function BreachesChart({ breaches }: { breaches: Breach[] }) {
  const now = new Date()
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = subDays(now, 29 - i)
    const key = startOfDay(d).getTime()
    const total = breaches
      .filter((b) => {
        const bd = startOfDay(new Date(b.breachedAt)).getTime()
        return bd === key
      })
      .reduce((sum, b) => sum + b.penaltyAmount, 0)
    return {
      date: format(d, "MMM dd"),
      amount: total,
    }
  })

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Breaches over time</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={days}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                }}
                formatter={(value) => [formatINR(Number(value) || 0), "Penalty"]}
              />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Top Offending Vendors ───────────────────────────────────────────────

function TopOffendingVendors({
  vendors,
  breaches,
  events,
}: {
  vendors: Vendor[]
  breaches: Breach[]
  events: OperationalEvent[]
}) {
  const vendorMap = new Map(vendors.map((v) => [v.id, v]))
  const eventMap = new Map(events.map((e) => [e.id, e]))

  const aggregated = breaches.reduce(
    (acc, b) => {
      const ev = eventMap.get(b.eventId)
      const vid = ev?.vendorId
      if (!vid) return acc
      if (!acc[vid]) acc[vid] = { vendorId: vid, totalPenalty: 0, count: 0 }
      acc[vid].totalPenalty += b.penaltyAmount
      acc[vid].count++
      return acc
    },
    {} as Record<string, { vendorId: string; totalPenalty: number; count: number }>
  )

  const sorted = Object.values(aggregated)
    .sort((a, b) => b.totalPenalty - a.totalPenalty)
    .slice(0, 5)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Top offending vendors</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sorted.map((item, i) => {
          const v = vendorMap.get(item.vendorId)
          const initials = v?.name
            ?.split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2) ?? "??"
          return (
            <div key={item.vendorId} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-4 tabular-nums">
                {i + 1}
              </span>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" suppressHydrationWarning>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{v?.name ?? "Unknown"}</p>
                <p className="text-xs text-muted-foreground">
                  {item.count} breach{item.count !== 1 ? "es" : ""}
                </p>
              </div>
              <CurrencyValue value={item.totalPenalty} className="text-sm font-semibold tabular-nums" />
            </div>
          )
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No breaches recorded</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── At-Risk / Breach Tables ─────────────────────────────────────────────

function AtRiskTable({
  items,
  events,
  vendors,
}: {
  items: AtRiskItem[]
  events: OperationalEvent[]
  vendors: Vendor[]
}) {
  const vendorMap = new Map(vendors.map((v) => [v.id, v]))
  const eventMap = new Map(events.map((e) => [e.id, e]))

  const pending = items
    .filter((a) => a.status === "pending")
    .sort((a, b) => a.hoursRemaining - b.hoursRemaining)

  if (pending.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <Clock className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No items at risk right now</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs uppercase text-muted-foreground">
            <th className="text-left font-medium pb-2 pr-4">Vendor</th>
            <th className="text-left font-medium pb-2 pr-4">Order</th>
            <th className="text-left font-medium pb-2 pr-4">Hours remaining</th>
            <th className="text-left font-medium pb-2">Deadline</th>
          </tr>
        </thead>
        <tbody>
          {pending.slice(0, 10).map((a) => {
            const ev = eventMap.get(a.eventId)
            const v = ev ? vendorMap.get(ev.vendorId) : undefined
            const hoursLeft = a.hoursRemaining
            const pillClass =
              hoursLeft < 4
                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                : hoursLeft < 12
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-muted text-muted-foreground"

            return (
              <tr
                key={a.id}
                className="border-b last:border-0 hover:bg-muted/50 transition-colors"
              >
                <td className="py-3 pr-4">
                  <Link href={`/breaches/${a.id}`} className="block">
                    <span className="font-medium">{v?.name ?? "—"}</span>
                  </Link>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  <Link href={`/breaches/${a.id}`} className="block">
                    {ev?.externalId ?? "—"}
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <Link href={`/breaches/${a.id}`} className="block">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${pillClass}`}
                    >
                      {hoursLeft < 1 ? "<1" : Math.round(hoursLeft)}h
                    </span>
                  </Link>
                </td>
                <td className="py-3 text-muted-foreground">
                  <Link href={`/breaches/${a.id}`} className="block">
                    {ev ? format(new Date(ev.deadlineAt), "MMM dd, HH:mm") : "—"}
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RecentBreachesTable({
  breaches,
  events,
  vendors,
}: {
  breaches: Breach[]
  events: OperationalEvent[]
  vendors: Vendor[]
}) {
  const vendorMap = new Map(vendors.map((v) => [v.id, v]))
  const eventMap = new Map(events.map((e) => [e.id, e]))

  const recent = [...breaches]
    .sort((a, b) => new Date(b.breachedAt).getTime() - new Date(a.breachedAt).getTime())
    .slice(0, 5)

  const statusLabel: Record<string, string> = {
    open: "Open",
    claim_drafted: "Drafting",
    claim_sent: "Claim Sent",
    recovered: "Recovered",
    disputed: "Disputed",
  }

  const statusVariant: Record<string, "destructive" | "warning" | "secondary" | "success"> = {
    open: "destructive",
    claim_drafted: "warning",
    claim_sent: "secondary",
    recovered: "success",
    disputed: "warning",
  }

  if (recent.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No recent breaches</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs uppercase text-muted-foreground">
            <th className="text-left font-medium pb-2 pr-4">Vendor</th>
            <th className="text-left font-medium pb-2 pr-4">Order</th>
            <th className="text-left font-medium pb-2 pr-4">Penalty</th>
            <th className="text-left font-medium pb-2 pr-4">When</th>
            <th className="text-left font-medium pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((b) => {
            const ev = eventMap.get(b.eventId)
            const v = ev ? vendorMap.get(ev.vendorId) : undefined
            return (
              <tr
                key={b.id}
                className="border-b last:border-0 hover:bg-muted/50 transition-colors"
              >
                <td className="py-3 pr-4">
                  <Link href={`/breaches/${b.id}`} className="block">
                    <span className="font-medium">{v?.name ?? "—"}</span>
                  </Link>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  <Link href={`/breaches/${b.id}`} className="block">
                    {ev?.externalId ?? "—"}
                  </Link>
                </td>
                <td className="py-3 pr-4 tabular-nums font-medium">
                  <Link href={`/breaches/${b.id}`} className="block">
                    <CurrencyValue value={b.penaltyAmount} />
                  </Link>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  <Link href={`/breaches/${b.id}`} className="block">
                    <TimeAgo date={b.breachedAt} />
                  </Link>
                </td>
                <td className="py-3">
                  <Link href={`/breaches/${b.id}`} className="block">
                    <Badge variant={statusVariant[b.status] ?? "secondary"}>
                      {statusLabel[b.status] ?? b.status}
                    </Badge>
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Activity Stream ─────────────────────────────────────────────────────

const actionIcons: Record<string, typeof Activity> = {
  "contract.uploaded": FileText,
  "contract.extracted": FileText,
  "contract.approved": FileText,
  "datasource.ingested": Database,
  "datasource.field_mapping_updated": Database,
  "breach.detected": AlertTriangle,
  "breach.opened": AlertTriangle,
  "claim.drafted": Mail,
  "claim.sent": Mail,
  "response.classified": UserCheck,
  "event.exempted": Clock,
}

const actorStyles: Record<string, string> = {
  user: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  system: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ai: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
}

function pl(e: AuditEntry) {
  return e.payload as Record<string, unknown>
}

function actionDescription(entry: AuditEntry): string {
  const descriptions: Record<string, (e: AuditEntry) => string> = {
    "contract.uploaded": (e) => `Contract "${pl(e).fileName ?? "—"}" uploaded`,
    "contract.extracted": (e) =>
      `SLA rules extracted from contract (${pl(e).rulesFound ?? 0} rules found)`,
    "contract.approved": (e) => `Contract approved by ${pl(e).approvedBy ?? "—"}`,
    "datasource.ingested": (e) =>
      `Data source ingested — ${pl(e).rowsIngested ?? 0} rows imported`,
    "datasource.field_mapping_updated": () => `Data source field mapping updated`,
    "breach.detected": (e) =>
      `Breach detected — ${pl(e).hoursOverdue ?? 0}h overdue`,
    "breach.opened": (e) =>
      `Breach opened — ₹${(Number(pl(e).penaltyAmount) || 0).toLocaleString("en-IN")} penalty`,
    "claim.drafted": (e) => `Claim drafted for breach ${pl(e).claimId ?? "—"}`,
    "claim.sent": (e) => `Claim sent to ${pl(e).recipientEmail ?? "—"}`,
    "response.classified": (e) =>
      `Vendor response classified — ${pl(e).matchesException ? "exception" : "no match"} (${Math.round((Number(pl(e).confidence) || 0) * 100)}% confidence)`,
    "event.exempted": () => `Event exempted from penalty`,
  }
  return descriptions[entry.action]?.(entry) ?? entry.action
}

function ActivityStream({ entries }: { entries: AuditEntry[] }) {
  const sorted = [...entries]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Activity stream</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {sorted.map((entry, i) => {
          const Icon = actionIcons[entry.action] ?? Activity
          const actorClass = actorStyles[entry.actor] ?? "bg-muted text-muted-foreground"
          return (
            <div key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
              {/* Timeline line */}
              {i < sorted.length - 1 && (
                <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
              )}
              {/* Icon circle */}
              <div className="relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              {/* Content */}
              <div className="min-w-0 flex-1">
                <p className="text-sm">{actionDescription(entry)}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    <TimeAgo date={entry.timestamp} />
                  </span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${actorClass}`}>
                    {entry.actor}
                  </Badge>
                </div>
              </div>
            </div>
          )
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent activity
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Helper: fake trend ──────────────────────────────────────────────────

function computeTrend(current: number, previous: number): { pct: number; up: boolean } {
  if (previous === 0) return { pct: 100, up: current > 0 }
  const pct = Math.round(((current - previous) / previous) * 100)
  return { pct: Math.abs(pct), up: pct >= 0 }
}

// ─── Main Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const {
    vendors,
    contracts,
    breaches,
    atRiskItems,
    operationalEvents,
    auditEntries,
  } = useDataStore()

  const now = new Date()
  const thirtyDaysAgo = subDays(now, 30)
  const sixtyDaysAgo = subDays(now, 60)

  // ── Computed KPIs ──────────────────────────────────────────────────────

  const totalRecoveryThisMonth = breaches
    .filter((b) => {
      const d = new Date(b.breachedAt)
      return (
        d >= thirtyDaysAgo &&
        (b.status === "recovered" || b.status === "claim_sent")
      )
    })
    .reduce((sum, b) => sum + b.penaltyAmount, 0)

  const totalRecoveryPrevMonth = breaches
    .filter((b) => {
      const d = new Date(b.breachedAt)
      return d >= sixtyDaysAgo && d < thirtyDaysAgo && (b.status === "recovered" || b.status === "claim_sent")
    })
    .reduce((sum, b) => sum + b.penaltyAmount, 0)

  const activeBreaches = breaches.filter(
    (b) => b.status === "open" || b.status === "claim_drafted"
  ).length
  const activeBreachesPrev = breaches.filter((b) => {
    const d = new Date(b.breachedAt)
    return d >= sixtyDaysAgo && d < thirtyDaysAgo && (b.status === "open" || b.status === "claim_drafted")
  }).length

  const atRiskPending = atRiskItems.filter((a) => a.status === "pending").length

  const approvedVendorIds = new Set(
    contracts.filter((c) => c.status === "approved").map((c) => c.vendorId)
  )
  const vendorsMonitored = vendors.filter((v) => approvedVendorIds.has(v.id)).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Real-time view of vendor compliance across your contracts"
      />

      {/* KPI cards */}
      <div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        style={{ animation: "none" }}
      >
        {/* Manually apply stagger via style */}
        {([
          {
            label: "Total recovery this month",
            value: totalRecoveryThisMonth,
            formattedValue: formatCurrency(totalRecoveryThisMonth),
            trend: computeTrend(totalRecoveryThisMonth, totalRecoveryPrevMonth),
            icon: ArrowUp,
            accent: "text-emerald-500",
            thresholdAlert: false,
          },
          {
            label: "Active breaches",
            value: activeBreaches,
            trend: computeTrend(activeBreaches, activeBreachesPrev),
            icon: ShieldAlert,
            accent: activeBreaches > 10 ? "text-amber-500" : "text-red-500",
            thresholdAlert: activeBreaches > 10,
          },
          {
            label: "At-risk items",
            value: atRiskPending,
            trend: { pct: atRiskPending > 0 ? 12 : 0, up: atRiskPending > 0 },
            icon: AlertTriangle,
            accent: "text-amber-500",
            thresholdAlert: false,
          },
          {
            label: "Vendors monitored",
            value: vendorsMonitored,
            trend: { pct: vendorsMonitored > 0 ? 5 : 0, up: true },
            icon: Building2,
            accent: "text-blue-500",
            thresholdAlert: false,
          },
        ] as const).map((kpi, i) => (
          <div
            key={kpi.label}
            className="animate-in fade-in slide-in-from-bottom-4"
            style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}
          >
            <KpiCard
              label={kpi.label}
              value={kpi.value}
              formattedValue={"formattedValue" in kpi ? kpi.formattedValue : undefined}
              trend={(kpi.trend as { pct: number; up: boolean }).pct}
              trendUp={
                kpi.label === "Active breaches" || kpi.label === "At-risk items"
                  ? false
                  : (kpi.trend as { pct: number; up: boolean }).up
              }
              icon={kpi.icon}
              accent={kpi.accent}
              thresholdAlert={kpi.thresholdAlert}
            />
          </div>
        ))}
      </div>

      {/* Chart + Top offending vendors */}
      <div className="grid gap-4 lg:grid-cols-5">
        <BreachesChart breaches={breaches} />
        <div className="lg:col-span-2">
          <TopOffendingVendors
            vendors={vendors}
            breaches={breaches}
            events={operationalEvents}
          />
        </div>
      </div>

      {/* Items needing attention */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-medium">Items needing attention</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="at-risk">
            <TabsList className="mb-4">
              <TabsTrigger value="at-risk" className="text-xs">
                At-risk now
              </TabsTrigger>
              <TabsTrigger value="breaches" className="text-xs">
                Recent breaches
              </TabsTrigger>
            </TabsList>
            <TabsContent value="at-risk">
              <AtRiskTable
                items={atRiskItems}
                events={operationalEvents}
                vendors={vendors}
              />
            </TabsContent>
            <TabsContent value="breaches">
              <RecentBreachesTable
                breaches={breaches}
                events={operationalEvents}
                vendors={vendors}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Activity stream */}
      <ActivityStream entries={auditEntries} />
    </div>
  )
}
