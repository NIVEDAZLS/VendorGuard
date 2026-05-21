"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  AlertTriangle,
  Clock,
  FileText,
  Sparkles,
  Truck,
  CheckCircle,
  XCircle,
  Send,
  DollarSign,
  Scale,
  Activity,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useDataStore } from "@/lib/store"
import { BreachAPI } from "@/lib/api"
import { formatINR, timeAgo } from "@/lib/utils/format"
import { CurrencyValue, TimeAgo } from "@/components/shared/DynamicValues"
import { SimulateResponseDialog } from "@/components/shared/SimulateResponseDialog"
import { toast } from "sonner"
import { format, differenceInHours } from "date-fns"
import type { Breach, AuditEntry } from "@/lib/types"

const statusLabels: Record<string, string> = {
  pending: "Pending",
  exempted: "Exempted",
  resolved_compliant: "Resolved",
  breached: "Breached",
}

const breachStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "warning" | "success" | "destructive" }> = {
  open: { label: "Open", variant: "secondary" },
  claim_drafted: { label: "Claim drafted", variant: "warning" },
  claim_sent: { label: "Claim sent", variant: "default" },
  recovered: { label: "Recovered", variant: "success" },
  disputed: { label: "Disputed", variant: "destructive" },
}

const actorStyles: Record<string, string> = {
  user: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  system: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ai: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
}

export default function BreachDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const {
    atRiskItems,
    breaches,
    operationalEvents,
    vendors,
    slaRules,
    vendorResponses,
    auditEntries,
    claims,
    updateAtRiskItem,
  } = useDataStore()

  const [simulateOpen, setSimulateOpen] = useState(false)

  // Determine if this is an at-risk item or a breach
  const atRiskItem = atRiskItems.find((a) => a.id === id)
  const breach = breaches.find((b) => b.id === id)

  // Shared lookups
  const event = atRiskItem
    ? operationalEvents.find((e) => e.id === atRiskItem.eventId)
    : breach
      ? operationalEvents.find((e) => e.id === breach.eventId)
      : undefined
  const vendor = event ? vendors.find((v) => v.id === event.vendorId) : undefined
  const rule = atRiskItem
    ? slaRules.find((r) => r.id === atRiskItem.ruleId)
    : breach
      ? slaRules.find((r) => r.id === breach.ruleId)
      : undefined

  // Audit trail for this entity
  const entityAudit = auditEntries.filter(
    (e) => e.entityId === id || e.entityId === event?.id
  )

  // Derived from at-risk
  const response = atRiskItem
    ? vendorResponses.find((vr) => vr.atRiskItemId === atRiskItem.id)
    : undefined

  // ─── At-risk mode ─────────────────────────────────────────────────────

  const handleSimulateResult = (result: {
    matchesException: boolean
    clauseId?: string
    clauseText?: string
    reasoning: string
    confidence: number
    responseText: string
  }) => {
    // Set the response in store (simplified — just update at-risk item)
    updateAtRiskItem(id, {
      status: result.matchesException ? "exempted" : "breached",
    })
    // Add audit entry
    useDataStore.getState().addAuditEntry({
      id: `aud-${Date.now()}`,
      entityType: "response",
      entityId: id,
      action: "response.classified",
      actor: "ai",
      payload: {
        matchesException: result.matchesException,
        confidence: result.confidence,
      },
      timestamp: new Date().toISOString(),
    })
    toast.success(
      result.matchesException
        ? "Exception accepted — vendor exempted"
        : "No exception — breach confirmed"
    )
  }

  const handleMarkBreached = () => {
    updateAtRiskItem(id, { status: "breached" })
    toast.success("Marked as breached")
  }

  const handleMarkResolved = () => {
    updateAtRiskItem(id, { status: "resolved_compliant" })
    toast.success("Marked as resolved — compliant")
  }

  // ─── Breach mode ──────────────────────────────────────────────────────

  const handleBreachAction = async (status: Breach["status"]) => {
    if (!breach) return
    await BreachAPI.updateStatus(breach.id, status)
    toast.success(`Breach status updated to ${status.replace("_", " ")}`)
  }

  // ─── Render ───────────────────────────────────────────────────────────

  if (!atRiskItem && !breach) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
        Item not found
      </div>
    )
  }

  // ─── At-risk detail ───────────────────────────────────────────────────
  if (atRiskItem) {
    const isPending = atRiskItem.status === "pending"
    const shippedDate = event ? new Date(event.shippedAt) : new Date()
    const deadlineDate = event ? new Date(event.deadlineAt) : new Date()
    const now = new Date()
    const totalWindow = differenceInHours(deadlineDate, shippedDate)
    const elapsed = differenceInHours(now, shippedDate)
    const remaining = Math.max(0, totalWindow - elapsed)
    const alertSentAgo = timeAgo(atRiskItem.alertSentAt)

    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-4 mb-1">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {vendor?.name ?? "—"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Order {event?.externalId ?? "—"} · {event?.destination ?? "—"}
              </p>
            </div>
            <Badge variant={isPending ? "warning" : atRiskItem.status === "exempted" ? "success" : "destructive"}>
              {statusLabels[atRiskItem.status] ?? atRiskItem.status}
            </Badge>
          </div>
        </div>

        {/* Status banner */}
        {isPending && (
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
            <CardContent className="flex items-center gap-3 pt-4">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  At risk — alert was sent to vendor {alertSentAgo}, awaiting response
                </p>
                {remaining > 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    {Math.round(remaining)} hours remaining before SLA deadline
                  </p>
                ) : (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                    Past deadline by {Math.round(Math.abs(remaining))} hours
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative flex items-center justify-between px-2">
              {/* Track line */}
              <div className="absolute left-0 right-0 top-4 h-0.5 bg-border" />
              {/* Segments */}
              <div
                className="absolute left-0 top-4 h-0.5 bg-emerald-500 transition-all"
                style={{
                  width: `${Math.min(100, (elapsed / totalWindow) * 100)}%`,
                }}
              />
              {/* Markers */}
              {[
                { label: "Shipped", time: format(shippedDate, "MMM dd HH:mm"), icon: Truck, pos: "0%" },
                { label: "Alert fired", time: alertSentAgo, icon: AlertTriangle, pos: `${Math.min(70, (differenceInHours(new Date(atRiskItem.alertSentAt), shippedDate) / totalWindow) * 100)}%` },
                { label: "Deadline", time: format(deadlineDate, "MMM dd HH:mm"), icon: Clock, pos: "100%" },
              ].map((m, i) => {
                const Icon = m.icon
                return (
                  <div key={i} className="relative z-10 flex flex-col items-center" style={{ marginLeft: i === 0 ? 0 : undefined, marginRight: i === 2 ? 0 : undefined }}>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                      i < 2 ? "bg-emerald-50 border-emerald-500 dark:bg-emerald-950" : "bg-background border-muted-foreground"
                    }`}>
                      <Icon className={`h-3.5 w-3.5 ${i < 2 ? "text-emerald-500" : "text-muted-foreground"}`} />
                    </div>
                    <p className="mt-2 text-xs font-medium">{m.label}</p>
                    <p className="text-[10px] text-muted-foreground">{m.time}</p>
                  </div>
                )
              })}
            </div>
            <div className="mt-6 text-center">
              <p className="text-2xl font-semibold tabular-nums">
                {Math.round(remaining)}h
              </p>
              <p className="text-xs text-muted-foreground">remaining</p>
            </div>
          </CardContent>
        </Card>

        {/* SLA being tracked */}
        {rule && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                SLA being tracked
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{rule.metricType.replace("_", " ")}</Badge>
                <span className="text-sm font-medium">{rule.metricLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Threshold</p>
                  <p className="font-medium tabular-nums">{rule.threshold.value} {rule.threshold.unit}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Penalty</p>
                  <p className="font-medium">{rule.penalty.type === "percent" ? `${rule.penalty.value}% of ${rule.penalty.basis}` : `₹${rule.penalty.value}/${rule.penalty.basis}`}</p>
                </div>
              </div>
              {rule.exceptions.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Exceptions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {rule.exceptions.map((ex, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] font-normal">
                        {ex.condition} (&gt;{ex.modifiedThreshold.value}{ex.modifiedThreshold.unit})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">View contract clause</summary>
                <p className="mt-2 italic p-2 rounded bg-muted">{rule.rawClauseText}</p>
              </details>
            </CardContent>
          </Card>
        )}

        {/* Vendor alert */}
        {atRiskItem && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                Vendor alert
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span suppressHydrationWarning>Sent <TimeAgo date={atRiskItem.alertSentAt} /></span>
              </div>
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">View alert body</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  {`⚠️ SLA Alert — At-Risk Shipment\n\nVendor: ${vendor?.name ?? "—"}\nOrder Ref: ${event?.externalId ?? "—"}\nDestination: ${event?.destination ?? "—"}\nOrder Value: ${event?.orderValue ? formatINR(event.orderValue) : "—"}\nSLA Deadline: ${event?.deadlineAt ? format(new Date(event.deadlineAt), "MMM dd, yyyy HH:mm") : "—"}\n\nThis shipment is approaching its SLA deadline and is at risk of breaching the agreed delivery timeline. Please take immediate action.\n\n— VendorGuard AI Monitoring`}
                </pre>
              </details>
            </CardContent>
          </Card>
        )}

        {/* Vendor response */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Vendor response
            </CardTitle>
          </CardHeader>
          <CardContent>
            {response ? (
              <div className="space-y-3">
                <div className="rounded-md bg-muted p-3 text-sm">{response.responseText}</div>
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>Received <TimeAgo date={response.receivedAt} /></p>
                {response.aiClassification && (
                  <Card className={response.aiClassification.matchesException ? "border-emerald-200 dark:border-emerald-800" : "border-red-200 dark:border-red-800"}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm font-medium">AI Classification</span>
                        <Badge variant={response.aiClassification.matchesException ? "success" : "destructive"}>
                          {response.aiClassification.matchesException ? "Exception matched" : "No match"}
                        </Badge>
                      </div>
                      {response.aiClassification.clauseText && (
                        <p className="text-xs bg-muted p-2 rounded">
                          <span className="font-medium">Matched: </span>{response.aiClassification.clauseText}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{response.aiClassification.reasoning}</p>
                      <p className="text-xs">Confidence: {Math.round(response.aiClassification.confidence * 100)}%</p>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={handleMarkBreached}>Reject</Button>
                        <Button size="sm" onClick={() => { updateAtRiskItem(id, { status: "exempted" }); toast.success("Exception accepted") }}>
                          Accept exception
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : isPending ? (
              <div className="flex flex-col items-center py-6 text-center">
                <Clock className="h-6 w-6 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-3">No response yet from vendor</p>
                <Button variant="outline" onClick={() => setSimulateOpen(true)}>
                  Simulate vendor response
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No response submitted</p>
            )}
          </CardContent>
        </Card>

        {/* Resolve actions */}
        {isPending && (
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleMarkBreached}>
              <XCircle className="mr-1.5 h-4 w-4" />
              Mark as breached
            </Button>
            <Button variant="outline" onClick={handleMarkResolved}>
              <CheckCircle className="mr-1.5 h-4 w-4" />
              Mark resolved (no breach)
            </Button>
          </div>
        )}

        {/* Simulate dialog */}
        <SimulateResponseDialog
          open={simulateOpen}
          onOpenChange={setSimulateOpen}
          ruleExceptions={rule?.exceptions.map((e) => e.condition) ?? []}
          onResult={handleSimulateResult}
        />

        {/* Audit trail */}
        <AuditTrail entries={entityAudit} />
      </div>
    )
  }

  // ─── Breach detail ─────────────────────────────────────────────────
  if (breach) {
    const s = breachStatusLabels[breach.status] ?? { label: breach.status, variant: "secondary" }
    const penaltyPercent = slaRules.find((r) => r.id === breach.ruleId)?.penalty.value ?? 5
    const penaltyFormula = `${penaltyPercent}% of ${formatINR(breach.evidence.orderValue)}`

    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-4 mb-1">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {vendor?.name ?? "—"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Order {event?.externalId ?? "—"} · {event?.destination ?? "—"}
              </p>
            </div>
            <Badge variant={s.variant}>{s.label}</Badge>
          </div>
        </div>

        {/* Red banner */}
        <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
          <CardContent className="flex items-center gap-3 pt-4">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Breach confirmed — {breach.evidence.hoursOverdue}h overdue
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                Contract clause: {breach.evidence.contractClause}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Evidence card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Scale className="h-4 w-4 text-muted-foreground" />
              Breach evidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Shipped</p>
                  <p className="font-medium tabular-nums">{format(new Date(breach.evidence.shippedAt), "MMM dd, yyyy HH:mm")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Scheduled delivery</p>
                  <p className="font-medium tabular-nums">{format(new Date(breach.evidence.deadlineAt), "MMM dd, yyyy HH:mm")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Actual delivery</p>
                  <p className="font-medium tabular-nums">{breach.evidence.deliveredAt ? format(new Date(breach.evidence.deliveredAt), "MMM dd, yyyy HH:mm") : "Not delivered"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Hours overdue</p>
                  <p className="font-medium tabular-nums text-red-500">{breach.evidence.hoursOverdue}h</p>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Applicable clause</p>
                <div className="rounded-md bg-muted p-3 text-xs">
                  <span className="font-medium">{breach.evidence.contractClause}</span>
                  {rule && <p className="mt-1 italic">{rule.rawClauseText}</p>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Financial impact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Financial impact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums text-red-500">
              <CurrencyValue value={breach.penaltyAmount} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {penaltyFormula} = {formatINR(breach.penaltyAmount)}
            </p>
            <div className="mt-3 rounded-md bg-muted p-3 text-xs text-muted-foreground">
              Order value: {formatINR(breach.evidence.orderValue)} ·
              Penalty rate: {penaltyPercent}% per day overdue
            </div>
          </CardContent>
        </Card>

        {/* Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant={s.variant} className="text-xs">{s.label}</Badge>
              <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                Breached <TimeAgo date={breach.breachedAt} />
              </span>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {breach.status === "open" && (
                <Button size="sm" onClick={() => router.push(`/breaches/${breach.id}/claim`)}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  Generate claim
                </Button>
              )}
              {(breach.status === "claim_drafted" || breach.status === "claim_sent") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const claim = claims.find((c) => c.breachId === breach.id)
                    if (claim) router.push(`/claims/${claim.id}`)
                    else router.push(`/breaches/${breach.id}/claim`)
                  }}
                >
                  View claim
                </Button>
              )}
              {breach.status === "claim_sent" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => handleBreachAction("recovered")}>
                    <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                    Mark recovered
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleBreachAction("disputed")}>
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    Mark disputed
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Audit trail */}
        <AuditTrail entries={entityAudit} />
      </div>
    )
  }

  return null
}

// ─── Shared audit trail sub-component ─────────────────────────────────

function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  if (sorted.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Audit trail
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {sorted.map((entry, i) => (
          <div key={entry.id} className="relative flex gap-4 pb-5 last:pb-0">
            {i < sorted.length - 1 && (
              <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
            )}
            <div className="relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{entry.action}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="text-xs text-muted-foreground" suppressHydrationWarning><TimeAgo date={entry.timestamp} /></span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${actorStyles[entry.actor] ?? ""}`}>
                  {entry.actor}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
