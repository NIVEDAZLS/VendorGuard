"use client"
import { BASE } from "@/lib/api/base"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import {
  AlertTriangle, Scale, FileText, Send, CheckCircle,
  Activity, Sparkles, ChevronLeft, Loader2,
} from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"


interface BreachDetail {
  id: string
  vendor_id: string
  vendor_name: string
  contact_email: string
  log_id: string | null
  rule_id: string | null
  order_id: string | null
  metric_name: string | null
  threshold_hours: number | null
  threshold_unit: string | null
  penalty_type: string | null
  penalty_value: number | null
  contract_section: string | null
  exception_clauses: string[]
  actual_hours: number
  delay_hours: number
  penalty_amount: number
  dispute_status: string
  confidence: number
  reasoning: string
  breached_at: string
  started_at: string | null
  completed_at: string | null
  metadata: Record<string, unknown>
}

interface DisputeDraft {
  id: string
  breach_id: string
  vendor_name: string
  contact_email: string
  email_subject: string
  email_body: string
  status: string
  payment_status: string
  penalty_amount: number
  metric_name: string | null
  delay_hours: number | null
  created_at: string
  sent_at: string | null
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  open:           { label: "Open",           cls: "bg-red-50 text-red-700 border-red-200" },
  pending_review: { label: "Pending Review", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  sent:           { label: "Claim Sent",     cls: "bg-blue-50 text-blue-700 border-blue-200" },
  paid:           { label: "Paid",           cls: "bg-[#dbeaff] text-[#1a00d9] border-[#5e9eff]" },
  disputed:       { label: "Disputed",       cls: "bg-red-50 text-red-700 border-red-200" },
  waived:         { label: "Waived",         cls: "bg-gray-50 text-gray-500 border-gray-200" },
}

function formatINR(n: number | null) {
  if (!n) return "—"
  return "INR " + Math.round(n).toLocaleString("en-IN")
}

function formatDate(s: string | null) {
  if (!s) return "—"
  return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function BreachDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [breach, setBreach] = useState<BreachDetail | null>(null)
  const [dispute, setDispute] = useState<DisputeDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [editingBody, setEditingBody] = useState(false)
  const [editedBody, setEditedBody] = useState("")
  const [savingBody, setSavingBody] = useState(false)

  const loadData = useCallback(async () => {
    const [breachData, disputeData] = await Promise.all([
      fetch(`${BASE}/breaches/${id}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${BASE}/disputes/breach/${id}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
    setBreach(breachData)

    if (disputeData) {
      setDispute(disputeData)
      if (disputeData.email_body) setEditedBody(disputeData.email_body)
    } else {
      // Fire auto-draft in background — page renders immediately, email section fills in async
      setDraftLoading(true)
      setDraftError(false)
      fetch(`${BASE}/disputes/breach/${id}/draft`, { method: "POST" })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(data => {
          if (data) {
            setDispute({ ...data, status: "pending_review" } as DisputeDraft)
            setEditedBody(data.email_body ?? "")
          } else {
            setDraftError(true)
          }
        })
        .catch(() => setDraftError(true))
        .finally(() => setDraftLoading(false))
    }

    setLoading(false)
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  const handleGenerateDraft = async () => {
    setDraftLoading(true)
    setDraftError(false)
    try {
      const r = await fetch(`${BASE}/disputes/breach/${id}/draft`, { method: "POST" })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      toast.success("Dispute email drafted by AI")
      setDispute({ ...data, status: "pending_review" } as DisputeDraft)
      setEditedBody(data.email_body ?? "")
    } catch (e) {
      setDraftError(true)
      toast.error("Failed to generate draft: " + String(e))
    } finally {
      setDraftLoading(false)
    }
  }

  const handleSaveBody = async () => {
    setSavingBody(true)
    try {
      const r = await fetch(`${BASE}/disputes/breach/${id}/email-body`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_body: editedBody }),
      })
      if (!r.ok) throw new Error(await r.text())
      setDispute(d => d ? { ...d, email_body: editedBody } : d)
      setEditingBody(false)
      toast.success("Email body saved")
    } catch (e) {
      toast.error("Save failed: " + String(e))
    } finally {
      setSavingBody(false)
    }
  }

  const handleSendEmail = async () => {
    setSendLoading(true)
    try {
      const r = await fetch(`${BASE}/disputes/breach/${id}/send`, { method: "POST" })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      toast.success(`Email sent to ${data.recipient}`)
      setBreach(b => b ? { ...b, dispute_status: "sent" } : b)
      setDispute(d => d ? { ...d, status: "sent" } : d)
    } catch (e) {
      toast.error("Send failed: " + String(e))
    } finally {
      setSendLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading breach…
      </div>
    )
  }

  if (!breach) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-muted-foreground gap-3">
        <AlertTriangle className="h-8 w-8" />
        <p>Breach not found</p>
        <Link href="/breaches"><Button variant="outline" size="sm">Back to breaches</Button></Link>
      </div>
    )
  }

  const sc = statusConfig[breach.dispute_status] ?? { label: breach.dispute_status, cls: "bg-muted text-muted-foreground" }
  const hasDraft = !!dispute

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back */}
      <Link href="/breaches" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All breaches
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{breach.vendor_name ?? "—"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {breach.metric_name ?? "SLA Breach"} · Ref {breach.order_id ?? "—"}
            {breach.contract_section && <span className="ml-2 font-mono text-xs">§{breach.contract_section}</span>}
          </p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${sc.cls}`}>{sc.label}</span>
      </div>

      {/* Red banner */}
      <Card className="border-red-200 bg-red-50">
        <CardContent className="flex items-center gap-3 pt-4 pb-4">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">
              Breach confirmed — {breach.delay_hours.toFixed(1)}h overdue
            </p>
            <p className="text-xs text-red-600 mt-0.5">{breach.reasoning}</p>
          </div>
        </CardContent>
      </Card>

      {/* Evidence */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" /> Breach evidence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">SLA threshold</p>
              <p className="font-medium tabular-nums">{breach.threshold_hours ?? "—"} {breach.threshold_unit ?? "hours"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actual duration</p>
              <p className="font-medium tabular-nums text-red-600">{breach.actual_hours.toFixed(1)}h</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Delay</p>
              <p className="font-medium tabular-nums text-red-600">+{breach.delay_hours.toFixed(1)}h</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">AI confidence</p>
              <p className={`font-medium tabular-nums ${breach.confidence >= 90 ? "text-[#1a00d9]" : "text-amber-600"}`}>{breach.confidence}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Started</p>
              <p className="font-medium tabular-nums">{formatDate(breach.started_at)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="font-medium tabular-nums">{formatDate(breach.completed_at)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Detected at</p>
              <p className="font-medium tabular-nums">{formatDate(breach.breached_at)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vendor email</p>
              <p className="font-medium text-xs truncate">{breach.contact_email ?? "—"}</p>
            </div>
          </div>

          {breach.exception_clauses && breach.exception_clauses.length > 0 && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-xs text-muted-foreground mb-2">Exception clauses in contract</p>
                <div className="space-y-1">
                  {breach.exception_clauses.map((ex, i) => (
                    <p key={i} className="text-xs bg-muted rounded px-2 py-1 italic">{ex}</p>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Financial impact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" /> Financial impact
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold tabular-nums text-red-500">{formatINR(breach.penalty_amount)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {breach.penalty_type === "per_unit" && `INR ${breach.penalty_value?.toLocaleString("en-IN")} × ${breach.delay_hours.toFixed(1)}h delay`}
            {breach.penalty_type === "fixed" && `Fixed penalty`}
            {breach.penalty_type === "percentage" && `${breach.penalty_value}% of invoice`}
            {(!breach.penalty_type || breach.penalty_type === "none") && "See contract for penalty terms"}
          </p>
        </CardContent>
      </Card>

      {/* Dispute email draft */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" /> Dispute email
            {hasDraft && <Badge variant="secondary" className="text-[10px] ml-1">{dispute?.status}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasDraft ? (
            <div className="flex flex-col items-center py-6 text-center gap-3">
              {draftError ? (
                <>
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                  <p className="text-sm text-muted-foreground">Failed to generate draft — AI service may be unavailable.</p>
                  <Button size="sm" variant="outline" onClick={handleGenerateDraft} disabled={draftLoading} className="gap-2">
                    {draftLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Retry
                  </Button>
                </>
              ) : (
                <>
                  <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                  <p className="text-sm text-muted-foreground">
                    {draftLoading ? "Drafting dispute email with AI…" : "Preparing draft…"}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium">To:</span> {dispute?.contact_email ?? breach.contact_email ?? "—"} &nbsp;|&nbsp;
                <span className="font-medium">Subject:</span> {dispute?.email_subject ?? "—"}
              </div>

              {editingBody ? (
                <div className="space-y-2">
                  <Textarea
                    value={editedBody}
                    onChange={e => setEditedBody(e.target.value)}
                    rows={16}
                    className="font-mono text-xs"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveBody} disabled={savingBody}>
                      {savingBody ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                      Save changes
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setEditingBody(false); setEditedBody(dispute?.email_body ?? "") }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="relative group">
                  <pre className="whitespace-pre-wrap rounded-md bg-muted/50 border p-4 text-xs text-foreground font-sans leading-relaxed max-h-80 overflow-y-auto">
                    {dispute?.email_body}
                  </pre>
                  <Button
                    size="sm" variant="outline"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7"
                    onClick={() => { setEditingBody(true); setEditedBody(dispute?.email_body ?? "") }}
                  >
                    Edit
                  </Button>
                </div>
              )}

              {/* Actions */}
              {!editingBody && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {dispute?.status !== "sent" && (
                    <Button onClick={handleSendEmail} disabled={sendLoading} className="gap-2">
                      {sendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {sendLoading ? "Sending…" : "Send to vendor"}
                    </Button>
                  )}
                  {dispute?.status === "sent" && (
                    <div className="flex items-center gap-1.5 text-sm text-[#1a00d9]">
                      <CheckCircle className="h-4 w-4" /> Email sent {dispute.sent_at ? formatDate(dispute.sent_at) : ""}
                    </div>
                  )}
                  <Button variant="outline" onClick={handleGenerateDraft} disabled={draftLoading} className="gap-2">
                    {draftLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Regenerate
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" /> System notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground leading-relaxed">{breach.reasoning}</p>
          {breach.metadata && Object.keys(breach.metadata).length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Raw log metadata</summary>
              <pre className="mt-2 text-[11px] bg-muted rounded p-2 overflow-x-auto">
                {JSON.stringify(breach.metadata, null, 2)}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
