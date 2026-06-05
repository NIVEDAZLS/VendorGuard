"use client"
import { BASE } from "@/lib/api/base"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ShieldAlert, Activity } from "lucide-react"
import { format } from "date-fns"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts"

import { PageHeader } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"


interface VendorRow {
  vendor_id: string
  vendor_name: string
  industry: string | null
  contract_id: string | null
  contract_name: string | null
  total_events: number
  breaches_30d: number
  penalties_owed: number
  penalties_paid: number
  compliance_pct: number
  status: "Healthy" | "At Risk" | "Critical"
}

interface Kpis {
  penalties_identified_mtd: number
  penalties_recovered_ytd: number
  active_breaches_30d: number
  pending_disputes: number
  contracts_monitored: number
}

interface RecentBreach {
  id: string
  vendor_name: string
  order_id: string | null
  metric_name: string | null
  penalty_amount: number
  delay_hours: number
  dispute_status: string
  breached_at: string
}

function formatINR(n: number) {
  if (!n) return "INR 0"
  return "INR " + Math.round(n).toLocaleString("en-IN")
}

// ── Animated Number ──────────────────────────────────────────────────────────
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

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, formattedValue, sub, topBorderClass, valueClass }: {
  label: string; value: number; formattedValue?: string; sub?: string
  topBorderClass: string; valueClass: string
}) {
  return (
    <Card className={`relative overflow-hidden border-t-2 ${topBorderClass}`}>
      <CardContent className="pt-5 pb-4">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
        <div className={`text-2xl font-bold tabular-nums leading-none ${valueClass}`}>
          {formattedValue ?? <AnimatedNumber value={value} />}
        </div>
        {sub && <p className="text-[11px] text-muted-foreground mt-2">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ── Vendor Scorecard ─────────────────────────────────────────────────────────
function VendorScorecard({ rows }: { rows: VendorRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No vendors found.</p>
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            {["Vendor", "Contract", "Compliance %", "Breaches (30d)", "Penalties Owed", "Penalties Paid", "Status", ""].map(h => (
              <th key={h} className="text-left font-medium text-xs uppercase tracking-wider text-muted-foreground p-3 pl-4">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const barColor = r.status === "Healthy" ? "#1a00d9" : r.status === "At Risk" ? "#f59e0b" : "#ef4444"
            const statusCls = r.status === "Healthy" ? "bg-[#dbeaff] text-[#1a00d9]" : r.status === "At Risk" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
            return (
              <tr key={r.vendor_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="p-3 pl-4">
                  <p className="font-semibold">{r.vendor_name}</p>
                  <p className="text-xs text-muted-foreground">{r.industry ?? "—"}</p>
                </td>
                <td className="p-3 font-mono text-xs text-muted-foreground">{r.contract_name ?? "—"}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${r.compliance_pct}%`, background: barColor }} />
                    </div>
                    <span className="text-xs font-medium tabular-nums" style={{ color: barColor }}>{r.compliance_pct.toFixed(1)}%</span>
                  </div>
                </td>
                <td className="p-3 font-medium tabular-nums">
                  {r.breaches_30d > 0 ? <span className="text-red-600">{r.breaches_30d}</span> : <span className="text-muted-foreground">0</span>}
                </td>
                <td className="p-3 font-mono text-xs tabular-nums">
                  {r.penalties_owed > 0 ? <span className="text-red-600">{formatINR(r.penalties_owed)}</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="p-3 font-mono text-xs tabular-nums">
                  {r.penalties_paid > 0 ? <span className="text-[#1a00d9]">{formatINR(r.penalties_paid)}</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls}`}>{r.status}</span>
                </td>
                <td className="p-3 pr-4">
                  <Link href={`/vendors/${r.vendor_id}`}>
                    <Button variant="outline" size="sm" className="h-7 text-xs">View</Button>
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

// ── Recent Breaches Table ────────────────────────────────────────────────────
function RecentBreachesTable({ breaches }: { breaches: RecentBreach[] }) {
  const statusLabel: Record<string, string> = { open: "Open", pending_review: "Pending", sent: "Claim Sent", paid: "Paid", disputed: "Disputed" }
  const statusVariant: Record<string, "destructive" | "warning" | "secondary" | "success"> = {
    open: "destructive", pending_review: "warning", sent: "secondary", paid: "success", disputed: "warning",
  }

  if (breaches.length === 0) {
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
            <th className="text-left font-medium pb-2 pr-4">Metric</th>
            <th className="text-left font-medium pb-2 pr-4">Penalty</th>
            <th className="text-left font-medium pb-2 pr-4">Delay</th>
            <th className="text-left font-medium pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {breaches.map(b => (
            <tr key={b.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
              <td className="py-3 pr-4">
                <Link href={`/breaches/${b.id}`} className="block font-medium">{b.vendor_name ?? "—"}</Link>
              </td>
              <td className="py-3 pr-4 text-muted-foreground text-xs">
                <Link href={`/breaches/${b.id}`} className="block">{b.metric_name ?? b.order_id ?? "—"}</Link>
              </td>
              <td className="py-3 pr-4 tabular-nums font-medium">
                <Link href={`/breaches/${b.id}`} className="block">{formatINR(b.penalty_amount)}</Link>
              </td>
              <td className="py-3 pr-4">
                <Link href={`/breaches/${b.id}`} className="block">
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full tabular-nums">
                    +{b.delay_hours.toFixed(1)}h
                  </span>
                </Link>
              </td>
              <td className="py-3">
                <Link href={`/breaches/${b.id}`} className="block">
                  <Badge variant={statusVariant[b.dispute_status] ?? "secondary"}>
                    {statusLabel[b.dispute_status] ?? b.dispute_status}
                  </Badge>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Chart data helpers ────────────────────────────────────────────────────────
function buildMetricChartData(breaches: RecentBreach[]) {
  const counts: Record<string, number> = {}
  for (const b of breaches) {
    const key = (b.metric_name ?? b.order_id ?? "Unknown").replace(/_/g, " ")
    counts[key] = (counts[key] ?? 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }))
}

function buildMonthTrendData(breaches: RecentBreach[]) {
  const now = new Date()
  const months: { label: string; key: string }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    })
  }
  const counts: Record<string, number> = {}
  for (const b of breaches) {
    const d = new Date(b.breached_at)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    counts[k] = (counts[k] ?? 0) + 1
  }
  return months.map(m => ({ month: m.label, breaches: counts[m.key] ?? 0 }))
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [scorecard, setScorecard] = useState<VendorRow[]>([])
  const [allBreaches, setAllBreaches] = useState<RecentBreach[]>([])
  const [loading, setLoading] = useState(true)
  const now = new Date()

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/portfolio/`).then(r => r.json()).catch(() => null),
      fetch(`${BASE}/breaches/?days=365`).then(r => r.json()).catch(() => []),
    ]).then(([portfolio, breaches]) => {
      if (portfolio) {
        setKpis(portfolio.kpis)
        setScorecard(portfolio.scorecard ?? [])
      }
      setAllBreaches((breaches as RecentBreach[]))
      setLoading(false)
    })
  }, [])

  const totalIdentified = kpis ? kpis.penalties_identified_mtd : 0
  const totalRecovered = kpis ? kpis.penalties_recovered_ytd : 0
  const recoveryRate = totalIdentified > 0 ? ((totalRecovered / totalIdentified) * 100).toFixed(1) : "0.0"

  const metricChartData = buildMetricChartData(allBreaches)
  const trendChartData = buildMonthTrendData(allBreaches)

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Portfolio Overview"
        description="Real-time vendor compliance across all active contracts"
      />

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm gap-2">
          <Activity className="h-4 w-4 animate-pulse" /> Loading portfolio…
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Penalties Identified (MTD)"
              value={totalIdentified}
              formattedValue={formatINR(totalIdentified)}
              sub={`${recoveryRate}% recovered`}
              topBorderClass="border-t-red-400"
              valueClass="text-red-600"
            />
            <KpiCard
              label="Penalties Recovered (YTD)"
              value={totalRecovered}
              formattedValue={formatINR(totalRecovered)}
              sub={`${recoveryRate}% recovery rate`}
              topBorderClass="border-t-[#1a00d9]"
              valueClass="text-[#1a00d9]"
            />
            <KpiCard
              label="Active Breaches (30d)"
              value={kpis?.active_breaches_30d ?? 0}
              sub={`${kpis?.pending_disputes ?? 0} pending disputes`}
              topBorderClass="border-t-amber-400"
              valueClass="text-amber-600"
            />
            <KpiCard
              label="Contracts Monitored"
              value={kpis?.contracts_monitored ?? 0}
              sub={`${scorecard.length} vendor${scorecard.length !== 1 ? "s" : ""} tracked`}
              topBorderClass="border-t-[#5e9eff]"
              valueClass="text-[#1a00d9]"
            />
          </div>

          {/* Analytics charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Chart A — Breach Distribution by SLA Metric */}
            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Breach Distribution by SLA Metric</CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                {metricChartData.length === 0 ? (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                    <ShieldAlert className="h-5 w-5 mr-2" /> No breach data yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={metricChartData}
                      layout="vertical"
                      margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={160}
                        tickLine={false}
                        axisLine={false}
                        tick={(props) => {
                          const { x, y, payload } = props
                          const label: string = payload.value
                          const maxChars = 20
                          const display = label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label
                          return (
                            <text x={x} y={y} dy={4} textAnchor="end" fontSize={10} fill="hsl(var(--muted-foreground))">
                              {display}
                            </text>
                          )
                        }}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                        labelStyle={{ fontWeight: 600 }}
                        formatter={(v) => [v, "Breaches"]}
                      />
                      <Bar dataKey="count" fill="#1a00d9" radius={[0, 4, 4, 0]} name="Breaches" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Chart B — Monthly Breach Trend */}
            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Breach Trend — Last 6 Months</CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={trendChartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                    <defs>
                      <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#5e9eff" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#5e9eff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                      labelStyle={{ fontWeight: 600 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="breaches"
                      stroke="#1a00d9"
                      strokeWidth={2}
                      fill="url(#trendGradient)"
                      name="Breaches"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Vendor Compliance Scorecard */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Vendor Compliance Scorecard</h2>
              <span className="text-xs text-muted-foreground font-mono">
                {format(now, "dd MMM yyyy, HH:mm")}
              </span>
            </div>
            <VendorScorecard rows={scorecard} />
          </div>
        </>
      )}
    </div>
  )
}
