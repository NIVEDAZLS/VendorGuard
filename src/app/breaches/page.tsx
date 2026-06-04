"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  AlertTriangle, MoreHorizontal, Eye, Activity, Mail, Clock,
  CheckCircle, XCircle, Pencil, ShieldAlert, ShieldCheck, ShieldOff,
  Link2, ChevronDown, ChevronRight,
} from "lucide-react"
import { PageHeader } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

const BASE = "http://localhost:8000/api"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Breach {
  id: string
  vendor_id: string
  vendor_name: string
  log_id: string | null
  rule_id: string | null
  order_id: string | null
  metric_name: string | null
  threshold_hours: number | null
  contract_section: string | null
  actual_hours: number
  delay_hours: number
  penalty_amount: number
  dispute_status: string
  confidence: number
  reasoning: string
  breached_at: string
}

interface Vendor {
  id: string
  name: string
}

interface Dispute {
  id: string
  breach_id: string
  vendor_id: string
  vendor_name: string | null
  email_subject: string | null
  email_body: string | null
  status: string
  penalty_amount: number | null
  metric_name: string | null
  created_at: string
}

interface PreBreachWarning {
  id: string
  log_id: string
  vendor_id: string
  vendor_name: string
  used: boolean
  expires_at: string
  sent_at: string
  event_type: string
  external_id: string | null
  started_at: string
  metric_name: string | null
  threshold_hours: number | null
  exception_request_id: string | null
  vendor_reason: string | null
  vendor_description: string | null
  vendor_submitted_at: string | null
  breach_id: string | null
}

// ─── Config ──────────────────────────────────────────────────────────────────

const breachStatusConfig: Record<string, { label: string; cls: string }> = {
  open:           { label: "Open",           cls: "bg-red-50 text-red-700 border-red-200" },
  pending_review: { label: "Pending Review", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  sent:           { label: "Claim Sent",     cls: "bg-blue-50 text-blue-700 border-blue-200" },
  paid:           { label: "Paid",           cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  disputed:       { label: "Disputed",       cls: "bg-red-50 text-red-700 border-red-200" },
  waived:         { label: "Waived",         cls: "bg-gray-50 text-gray-500 border-gray-200" },
}

const disputeStatusStyles: Record<string, string> = {
  pending_review: "bg-amber-50 text-amber-700",
  sent:           "bg-blue-50 text-blue-700",
  rejected:       "bg-red-50 text-red-700",
  approved:       "bg-emerald-50 text-emerald-700",
}

const disputeStatusLabels: Record<string, string> = {
  pending_review: "Pending Review",
  sent:           "Sent · Awaiting Response",
  rejected:       "Rejected",
  approved:       "Approved",
}

const PAGE_SIZE = 25

function formatINR(n: number) {
  if (!n) return "—"
  return "INR " + n.toLocaleString("en-IN")
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function BreachesPage() {
  const [breaches, setBreaches] = useState<Breach[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [warnings, setWarnings] = useState<PreBreachWarning[]>([])
  const [vendorFilter, setVendorFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState("dispute-emails")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [expandedWarning, setExpandedWarning] = useState<string | null>(null)
  const [warningEmails, setWarningEmails] = useState<Record<string, string>>({})

  const loadData = useCallback(async () => {
    const params = new URLSearchParams({ days: "365" })
    if (vendorFilter !== "all") params.set("vendor_id", vendorFilter)
    if (statusFilter !== "all") params.set("status", statusFilter)

    const [breachData, vendorData, disputeData, warningData] = await Promise.all([
      fetch(`${BASE}/breaches/?${params}`).then(r => r.json()).catch(() => []),
      fetch(`${BASE}/vendors/`).then(r => r.json()).catch(() => []),
      fetch(`${BASE}/disputes/?status=all`).then(r => r.json()).catch(() => []),
      fetch(`${BASE}/disputes/pre-breach-warnings`).then(r => r.json()).catch(() => []),
    ])
    setBreaches(breachData as Breach[])
    setVendors(vendorData as Vendor[])
    setDisputes(disputeData as Dispute[])
    setWarnings(warningData as PreBreachWarning[])
    setLoading(false)
  }, [vendorFilter, statusFilter])

  useEffect(() => { loadData() }, [loadData])

  // ── KPI calculations ──────────────────────────────────────────────────────
  const totalRecords = breaches.length
  const actualBreaches = breaches.filter(b => b.confidence >= 70 && b.dispute_status !== "waived").length
  const nonBreaches = breaches.filter(b => b.confidence < 70 || b.dispute_status === "waived").length
  const activeWarnings = warnings.filter(w => !w.used).length

  const totalPages = Math.ceil(breaches.length / PAGE_SIZE)
  const paged = breaches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const pendingDisputes = disputes.filter(d => d.status === "pending_review").length

  // Awaiting: token unused, not expired
  const awaitingWarnings = warnings.filter(w => !w.used && new Date(w.expires_at) > new Date())
  // Responded: token used (exception_request exists)
  const respondedWarnings = warnings.filter(w => w.used && w.exception_request_id)

  // ── Dispute actions ───────────────────────────────────────────────────────
  const handleApproveSend = async (breachId: string, disputeId: string) => {
    setActionLoading(disputeId)
    try {
      const res = await fetch(`${BASE}/disputes/breach/${breachId}/send`, { method: "POST" })
      if (!res.ok) throw new Error()
      toast.success("Dispute email sent to vendor.")
      loadData()
    } catch {
      toast.error("Failed to send dispute email.")
    } finally {
      setActionLoading(null)
    }
  }

  const handleRejectDispute = async (disputeId: string) => {
    setActionLoading(disputeId)
    try {
      const res = await fetch(`${BASE}/disputes/${disputeId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      })
      if (!res.ok) throw new Error()
      toast.success("Dispute rejected.")
      loadData()
    } catch {
      toast.error("Failed to reject dispute.")
    } finally {
      setActionLoading(null)
    }
  }

  // ── Pre-breach actions ────────────────────────────────────────────────────
  const handleGenerateDispute = async (breachId: string | null, tokenId: string) => {
    if (!breachId) {
      toast.error("No breach record found — run breach detection first.")
      return
    }
    setActionLoading(tokenId)
    try {
      const res = await fetch(`${BASE}/disputes/breach/${breachId}/draft`, { method: "POST" })
      if (!res.ok) throw new Error()
      toast.success("Dispute draft generated. Check the Dispute Emails tab.")
      loadData()
    } catch {
      toast.error("Failed to generate dispute draft.")
    } finally {
      setActionLoading(null)
    }
  }

  const toggleWarningEmail = async (w: PreBreachWarning) => {
    if (expandedWarning === w.id) { setExpandedWarning(null); return }
    setExpandedWarning(w.id)
    if (!warningEmails[w.id]) {
      const now = Date.now()
      const started = new Date(w.started_at).getTime()
      const threshold_ms = (w.threshold_hours ?? 1) * 3600_000
      const elapsed_h = ((now - started) / 3600_000).toFixed(1)
      const pct = Math.min(100, ((now - started) / threshold_ms) * 100).toFixed(0)
      const remaining_min = Math.max(0, Math.round((threshold_ms - (now - started)) / 60_000))
      const base = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
      const magic = `${base}/exception?token=[magic-link-in-email]`
      const body = [
        `Dear ${w.vendor_name} Operations Team,`,
        ``,
        `This is an automated pre-breach warning from VendorGuard.`,
        ``,
        `SLA Rule  : ${w.metric_name ?? w.event_type}`,
        `Order/Log : ${w.external_id ?? w.log_id}`,
        `Started   : ${new Date(w.started_at).toLocaleString("en-IN")}`,
        `Elapsed   : ${elapsed_h}h (${pct}% of ${w.threshold_hours}h threshold)`,
        `Remaining : ${remaining_min < 1 ? "< 1 min" : remaining_min + " minutes"} before breach threshold`,
        ``,
        `If there is a valid exception under your SLA agreement, please file it before the deadline:`,
        `[Magic link was sent in the email — valid for 24 hours, single-use]`,
        ``,
        `Failure to respond will result in a formal breach notice and penalty claim.`,
        ``,
        `VendorGuard Compliance System`,
      ].join("\n")
      setWarningEmails(prev => ({ ...prev, [w.id]: body }))
    }
  }

  const copyMagicLink = (w: PreBreachWarning) => {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
    // Fetch actual token from DB via validate endpoint isn't possible without JWT
    // Show the log_id so user can look it up, and copy the exception URL pattern
    const text = `${base}/exception?token=<jwt-in-sent-email>`
    navigator.clipboard.writeText(text)
    toast.info("Magic link pattern copied. The actual JWT was sent in the warning email.")
  }

  const handleWaive = async (breachId: string | null, tokenId: string) => {
    if (!breachId) {
      toast.error("No breach record found — cannot waive.")
      return
    }
    setActionLoading(tokenId)
    try {
      const res = await fetch(`${BASE}/breaches/${breachId}/waive`, { method: "POST" })
      if (!res.ok) throw new Error()
      toast.success("Breach waived.")
      loadData()
    } catch {
      toast.error("Failed to waive breach.")
    } finally {
      setActionLoading(null)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Breach & Disputes"
        description="Detected SLA breaches, dispute emails, and pre-breach warnings"
        actions={null}
      />

      {/* ── KPI bar ── */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Records</p>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{totalRecords}</p>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Actual Breaches</p>
          </div>
          <p className="text-2xl font-semibold tabular-nums text-red-600">{actualBreaches}</p>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldOff className="h-4 w-4 text-slate-400" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Non-Breach / False Alarms</p>
          </div>
          <p className="text-2xl font-semibold tabular-nums text-slate-500">{nonBreaches}</p>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-4 w-4 text-amber-500" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Pre-Breach Warnings</p>
          </div>
          <p className="text-2xl font-semibold tabular-nums text-amber-600">{activeWarnings}</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="dispute-emails">
            Dispute Emails
            {pendingDisputes > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {pendingDisputes}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pre-breach-warnings">
            Pre-Breach Warnings
            {activeWarnings > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {activeWarnings}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════
            TAB 1 — Dispute Emails (breach table + dispute cards)
            ════════════════════════════════════════════════════ */}
        <TabsContent value="dispute-emails" className="space-y-6 mt-4">
          {/* Breach table */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-56">
                <Select value={vendorFilter} onValueChange={v => { setVendorFilter(v); setPage(1) }}>
                  <SelectTrigger><SelectValue placeholder="All vendors" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All vendors</SelectItem>
                    {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-44">
                <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1) }}>
                  <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="pending_review">Pending Review</SelectItem>
                    <SelectItem value="sent">Claim Sent</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="disputed">Disputed</SelectItem>
                    <SelectItem value="waived">Waived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground ml-auto">{breaches.length} breach{breaches.length !== 1 ? "es" : ""}</p>
            </div>

            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left font-medium p-3 pl-4">Vendor</th>
                    <th className="text-left font-medium p-3">Metric</th>
                    <th className="text-left font-medium p-3">Order / Ref</th>
                    <th className="text-left font-medium p-3">Breach date</th>
                    <th className="text-left font-medium p-3">Delay</th>
                    <th className="text-right font-medium p-3">Penalty</th>
                    <th className="text-left font-medium p-3">Confidence</th>
                    <th className="text-left font-medium p-3">Status</th>
                    <th className="w-10 p-3" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                        <Activity className="h-4 w-4 animate-pulse inline mr-2" />Loading breaches…
                      </td>
                    </tr>
                  ) : paged.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-sm text-muted-foreground">
                        No breaches detected yet. That&apos;s a good sign.
                      </td>
                    </tr>
                  ) : paged.map(b => {
                    const sc = breachStatusConfig[b.dispute_status] ?? { label: b.dispute_status, cls: "bg-muted text-muted-foreground" }
                    const initials = (b.vendor_name ?? "??").split(" ").map(n => n[0]).join("").slice(0, 2)
                    return (
                      <tr key={b.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="p-3 pl-4">
                          <Link href={`/breaches/${b.id}`} className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{b.vendor_name ?? "—"}</span>
                          </Link>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">
                          <Link href={`/breaches/${b.id}`} className="block">
                            {b.metric_name ?? "—"}
                            {b.contract_section && <span className="ml-1 text-muted-foreground/60">§{b.contract_section}</span>}
                          </Link>
                        </td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">
                          <Link href={`/breaches/${b.id}`} className="block">{b.order_id ?? "—"}</Link>
                        </td>
                        <td className="p-3 text-muted-foreground tabular-nums">
                          <Link href={`/breaches/${b.id}`} className="block">
                            {new Date(b.breached_at).toLocaleDateString("en-IN")}
                          </Link>
                        </td>
                        <td className="p-3">
                          <Link href={`/breaches/${b.id}`} className="block">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                              b.delay_hours > 12 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                            }`}>
                              +{b.delay_hours.toFixed(1)}h
                            </span>
                          </Link>
                        </td>
                        <td className="p-3 text-right tabular-nums font-medium">
                          <Link href={`/breaches/${b.id}`} className="block">{formatINR(b.penalty_amount)}</Link>
                        </td>
                        <td className="p-3">
                          <Link href={`/breaches/${b.id}`} className="block">
                            <span className={`text-xs tabular-nums font-medium ${b.confidence >= 90 ? "text-emerald-600" : b.confidence >= 70 ? "text-amber-600" : "text-muted-foreground"}`}>
                              {b.confidence}%
                            </span>
                          </Link>
                        </td>
                        <td className="p-3">
                          <Link href={`/breaches/${b.id}`} className="block">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${sc.cls}`}>
                              {sc.label}
                            </span>
                          </Link>
                        </td>
                        <td className="p-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-32">
                              <DropdownMenuItem onClick={() => window.location.href = `/breaches/${b.id}`}>
                                <Eye className="mr-2 h-3.5 w-3.5" /> View
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm mt-3">
                <span className="text-muted-foreground">Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </div>

          {/* Dispute draft cards */}
          {disputes.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Dispute Emails ({disputes.length})
              </h3>
              {disputes.map(d => {
                const statusCls = disputeStatusStyles[d.status] ?? "bg-muted text-muted-foreground"
                const statusLabel = disputeStatusLabels[d.status] ?? d.status
                const isPending = d.status === "pending_review"
                const isSent = d.status === "sent"
                return (
                  <Card key={d.id} className="overflow-hidden">
                    <div className="flex flex-row items-start justify-between gap-4 p-4 border-b">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">{d.vendor_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {d.id.slice(0, 8)}…
                          {d.metric_name && ` · ${d.metric_name}`}
                          {d.penalty_amount ? ` · Penalty: ${formatINR(d.penalty_amount)}` : ""}
                          {d.created_at && ` · ${new Date(d.created_at).toLocaleDateString("en-IN")}`}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusCls}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <CardContent className="pt-3">
                      {d.email_subject && (
                        <div className="bg-muted/30 rounded-md p-3 mb-3 text-xs">
                          <p className="font-semibold mb-1">{d.email_subject}</p>
                          <p className="whitespace-pre-wrap text-muted-foreground line-clamp-4">{d.email_body}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {isPending && (
                          <>
                            <Button
                              size="sm"
                              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={actionLoading === d.id}
                              onClick={() => handleApproveSend(d.breach_id, d.id)}
                            >
                              <CheckCircle className="h-3.5 w-3.5" /> Approve &amp; Send
                            </Button>
                            <Link href={`/breaches/${d.breach_id}`}>
                              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                                <Pencil className="h-3.5 w-3.5" /> Edit Draft
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700 border-red-200"
                              disabled={actionLoading === d.id}
                              onClick={() => handleRejectDispute(d.id)}
                            >
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </Button>
                          </>
                        )}
                        {isSent && (
                          <Link href={`/breaches/${d.breach_id}`}>
                            <Button size="sm" variant="outline" className="h-8 text-xs">View Full Email</Button>
                          </Link>
                        )}
                        {!isPending && !isSent && (
                          <Link href={`/breaches/${d.breach_id}`}>
                            <Button size="sm" variant="outline" className="h-8 text-xs">View Details</Button>
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {!loading && disputes.length === 0 && breaches.length === 0 && (
            <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
              <Mail className="h-8 w-8" />
              <p className="text-sm">No breaches or disputes yet.</p>
            </div>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════
            TAB 2 — Pre-Breach Warnings
            ════════════════════════════════════════════════════ */}
        <TabsContent value="pre-breach-warnings" className="space-y-6 mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Activity className="h-4 w-4 animate-pulse" /> Loading warnings…
            </div>
          ) : warnings.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
              <Clock className="h-8 w-8" />
              <p className="text-sm">No pre-breach warnings sent yet.</p>
              <p className="text-xs text-muted-foreground/70">Run <code className="font-mono bg-muted px-1 rounded">python scripts/seed_inprogress_logs.py</code> then the pre_breach job to generate warnings.</p>
            </div>
          ) : (
            <>
              {/* Section A — Awaiting vendor response */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  Awaiting Vendor Response
                  <span className="text-muted-foreground font-normal">({awaitingWarnings.length})</span>
                </h3>

                {awaitingWarnings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active warnings awaiting response.</p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="w-6 p-3" />
                          <th className="text-left font-medium p-3 pl-2">Vendor</th>
                          <th className="text-left font-medium p-3">SLA Metric</th>
                          <th className="text-left font-medium p-3">Order Ref</th>
                          <th className="text-left font-medium p-3">Started</th>
                          <th className="text-left font-medium p-3">% Elapsed</th>
                          <th className="text-left font-medium p-3">Time Remaining</th>
                          <th className="text-left font-medium p-3">Warning Sent</th>
                          <th className="text-left font-medium p-3">Token Expires</th>
                          <th className="text-left font-medium p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {awaitingWarnings.map(w => {
                          const now = Date.now()
                          const started = new Date(w.started_at).getTime()
                          const threshold_ms = (w.threshold_hours ?? 0) * 3600_000
                          const elapsed_ms = now - started
                          const elapsed_pct = threshold_ms > 0 ? Math.min(100, (elapsed_ms / threshold_ms) * 100) : 0
                          const remaining_ms = Math.max(0, threshold_ms - elapsed_ms)
                          const remaining_min = Math.round(remaining_ms / 60_000)
                          const timeClass = remaining_min < 60 ? "text-red-600 font-medium" : remaining_min < 240 ? "text-amber-600" : "text-emerald-600"
                          const isExpanded = expandedWarning === w.id
                          return (
                            <>
                              <tr key={w.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => toggleWarningEmail(w)}>
                                <td className="p-3 text-muted-foreground">
                                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </td>
                                <td className="p-3 pl-2 font-medium">{w.vendor_name}</td>
                                <td className="p-3 text-xs text-muted-foreground">{w.metric_name ?? w.event_type}</td>
                                <td className="p-3 font-mono text-xs text-muted-foreground">{w.external_id ?? "—"}</td>
                                <td className="p-3 text-xs tabular-nums text-muted-foreground">
                                  {new Date(w.started_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </td>
                                <td className="p-3 text-xs tabular-nums">
                                  <span className={elapsed_pct >= 90 ? "text-red-600 font-medium" : "text-amber-600"}>
                                    {elapsed_pct.toFixed(0)}%
                                  </span>
                                </td>
                                <td className={`p-3 text-xs tabular-nums ${timeClass}`}>
                                  {remaining_min < 1 ? "< 1 min" : remaining_min < 60 ? `${remaining_min} min` : `${(remaining_min / 60).toFixed(1)}h`}
                                </td>
                                <td className="p-3 text-xs tabular-nums text-muted-foreground">
                                  {new Date(w.sent_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </td>
                                <td className="p-3 text-xs tabular-nums text-muted-foreground">
                                  {new Date(w.expires_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </td>
                                <td className="p-3" onClick={e => e.stopPropagation()}>
                                  <Button
                                    size="sm" variant="outline"
                                    className="h-7 text-xs gap-1 px-2"
                                    onClick={() => copyMagicLink(w)}
                                  >
                                    <Link2 className="h-3 w-3" /> Copy Link
                                  </Button>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr key={`${w.id}-expand`} className="border-b bg-muted/20">
                                  <td colSpan={10} className="px-6 py-4">
                                    <div className="space-y-2">
                                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                        <Mail className="h-3 w-3" /> Warning Email Sent to Vendor
                                      </p>
                                      <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono bg-white border rounded-md p-3 max-h-64 overflow-y-auto leading-relaxed">
                                        {warningEmails[w.id] ?? "Loading…"}
                                      </pre>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section B — Vendor responded */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                  Vendor Responded — Action Required
                  <span className="text-muted-foreground font-normal">({respondedWarnings.length})</span>
                </h3>

                {respondedWarnings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No vendor responses yet.</p>
                ) : (
                  <div className="space-y-3">
                    {respondedWarnings.map(w => (
                      <Card key={w.id} className="overflow-hidden">
                        <div className="flex flex-row items-start justify-between gap-4 p-4 border-b">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm">{w.vendor_name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {w.metric_name ?? w.event_type}
                              {w.external_id && ` · Ref: ${w.external_id}`}
                              {w.vendor_submitted_at && ` · Responded: ${new Date(w.vendor_submitted_at).toLocaleDateString("en-IN")}`}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">
                            Vendor Response Received
                          </span>
                        </div>
                        <CardContent className="pt-3 space-y-2">
                          <div className="rounded-md bg-muted/30 p-3 text-xs">
                            <p className="font-medium mb-1">Vendor Reason</p>
                            <p className="text-muted-foreground">{w.vendor_reason ?? "—"}</p>
                            {w.vendor_description && (
                              <p className="text-muted-foreground mt-1">{w.vendor_description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={actionLoading === w.id}
                              onClick={() => handleGenerateDispute(w.breach_id, w.id)}
                            >
                              <Mail className="h-3.5 w-3.5" /> Generate Dispute
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700 border-red-200"
                              disabled={actionLoading === w.id}
                              onClick={() => handleWaive(w.breach_id, w.id)}
                            >
                              <XCircle className="h-3.5 w-3.5" /> Reject / Waive
                            </Button>
                            {w.breach_id && (
                              <Link href={`/breaches/${w.breach_id}`}>
                                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                                  <Eye className="h-3.5 w-3.5" /> View Breach
                                </Button>
                              </Link>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
