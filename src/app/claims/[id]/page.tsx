"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Mail,
  FileText,
  CheckCircle,
  XCircle,
  Send,
  Clock,
  DollarSign,
  Activity,
  Loader2,
  Sparkles,
  Download,
} from "lucide-react"
import { useDataStore } from "@/lib/store"
import { FormattedDate } from "@/components/shared/DateDisplay"
import { CurrencyValue, TimeAgo } from "@/components/shared/DynamicValues"
import { formatCurrency } from "@/lib/utils/format"
import { format } from "date-fns"
import { downloadEvidenceCSV } from "@/lib/utils/csv"
import { draftClaimEmail } from "@/lib/ai"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const claimStatusStyles: Record<string, { label: string; variant: "secondary" | "warning" | "success" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  sent: { label: "Sent", variant: "warning" },
  recovered: { label: "Recovered", variant: "success" },
  disputed: { label: "Disputed", variant: "destructive" },
}

export default function ClaimDetailPage() {
  const params = useParams()
  const id = params.id as string
  const {
    claims,
    breaches,
    operationalEvents,
    vendors,
    slaRules,
    updateClaim,
    updateBreach,
    addAuditEntry,
  } = useDataStore()

  const claim = claims.find((c) => c.id === id)
  const breach = claim ? breaches.find((b) => b.id === claim.breachId) : undefined
  const event = breach
    ? operationalEvents.find((e) => e.id === breach.eventId)
    : undefined
  const vendor = event ? vendors.find((v) => v.id === event.vendorId) : undefined
  const rule = breach ? slaRules.find((r) => r.id === breach.ruleId) : undefined

  // Dialogs
  const [recoverOpen, setRecoverOpen] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [recoverAmount, setRecoverAmount] = useState(
    breach?.penaltyAmount?.toString() ?? ""
  )
  const [disputeNote, setDisputeNote] = useState("")
  const [followUpSending, setFollowUpSending] = useState(false)
  const [followUpSubject, setFollowUpSubject] = useState("")
  const [followUpBody, setFollowUpBody] = useState("")

  if (!claim || !breach || !event || !vendor) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
        Claim not found
      </div>
    )
  }

  const s = claimStatusStyles[claim.status] ?? {
    label: claim.status,
    variant: "secondary",
  }

  // Timeline entries
  const timeline = [
    { label: "Drafted", date: claim.createdAt, done: true },
    { label: "Sent", date: claim.sentAt, done: !!claim.sentAt },
    {
      label: claim.status === "recovered" ? "Recovered" : claim.status === "disputed" ? "Disputed" : "Resolution",
      date:
        claim.status === "recovered" || claim.status === "disputed"
          ? claim.updatedAt
          : null,
      done: claim.status === "recovered" || claim.status === "disputed",
    },
  ]

  const handleMarkRecovered = () => {
    const now = new Date().toISOString()
    updateClaim(claim.id, { status: "recovered", updatedAt: now })
    updateBreach(breach.id, { status: "recovered" })
    addAuditEntry({
      id: `aud-${Date.now()}`,
      entityType: "claim",
      entityId: claim.id,
      action: "claim.recovered",
      actor: "user",
      payload: { recoveredAmount: Number(recoverAmount) },
      timestamp: now,
    })
    toast.success(`Claim marked as recovered — ₹${Number(recoverAmount).toLocaleString("en-IN")}`)
    setRecoverOpen(false)
  }

  const handleMarkDisputed = () => {
    const now = new Date().toISOString()
    updateClaim(claim.id, { status: "disputed", updatedAt: now })
    updateBreach(breach.id, { status: "disputed" })
    addAuditEntry({
      id: `aud-${Date.now()}`,
      entityType: "claim",
      entityId: claim.id,
      action: "claim.disputed",
      actor: "user",
      payload: { note: disputeNote },
      timestamp: now,
    })
    toast.success("Claim marked as disputed")
    setDisputeOpen(false)
  }

  const handleFollowUp = async () => {
    setFollowUpSending(true)
    try {
      const result = await draftClaimEmail(
        {
          breachId: breach.id,
          vendorName: vendor.name,
          contactName: vendor.contactName,
          contactEmail: vendor.contactEmail,
          orderValue: breach.evidence.orderValue,
          penaltyAmount: breach.penaltyAmount,
          hoursOverdue: breach.evidence.hoursOverdue,
          contractClause: breach.evidence.contractClause,
          externalId: event.externalId,
          destination: event.destination,
          deadlineAt: breach.evidence.deadlineAt,
          deliveredAt: breach.evidence.deliveredAt,
        },
        "diplomatic"
      )

      const followUpPrefix = "FOLLOW-UP — "
      setFollowUpSubject(followUpPrefix + result.subject)
      setFollowUpBody(
        `This is a follow-up to our previous notice sent on ${format(new Date(claim.sentAt ?? claim.createdAt), "MMM dd, yyyy")}.\n\n` +
        result.body
      )
      setFollowUpOpen(true)
    } catch {
      toast.error("Failed to generate follow-up")
    } finally {
      setFollowUpSending(false)
    }
  }

  const handleSendFollowUp = () => {
    const now = new Date().toISOString()
    addAuditEntry({
      id: `aud-${Date.now()}`,
      entityType: "claim",
      entityId: claim.id,
      action: "claim.follow_up_sent",
      actor: "user",
      payload: { subject: followUpSubject },
      timestamp: now,
    })
    toast.success("Follow-up sent to vendor")
    setFollowUpOpen(false)
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/claims"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to claims
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {vendor.name}
            </h1>
            <Badge variant={s.variant}>{s.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {claim.draftSubject}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Email + Breach */}
        <div className="lg:col-span-2 space-y-6">
          {/* Email */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Claim Email
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">To</p>
                  <p className="font-medium">{claim.recipientEmail}</p>
                </div>
                {claim.cc && (
                  <div>
                    <p className="text-xs text-muted-foreground">CC</p>
                    <p className="font-medium">{claim.cc}</p>
                  </div>
                )}
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Subject</p>
                <p className="text-sm font-medium">{claim.draftSubject}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Body</p>
                <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-xs font-mono leading-relaxed">
                  {claim.draftBody}
                </pre>
              </div>
            </CardContent>
          </Card>

          {/* Breach info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Linked Breach
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {breach.id}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Breached <TimeAgo date={breach.breachedAt} />
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Order</p>
                  <p className="font-medium">{event.externalId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Destination</p>
                  <p className="font-medium">{event.destination}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Hours overdue</p>
                  <p className="font-medium text-red-500">
                    {breach.evidence.hoursOverdue}h
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Clause</p>
                  <p className="font-medium">{breach.evidence.contractClause}</p>
                </div>
              </div>
              <div
                className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                onClick={() =>
                  downloadEvidenceCSV({
                    externalId: event.externalId,
                    shippedAt: breach.evidence.shippedAt,
                    deadlineAt: breach.evidence.deadlineAt,
                    deliveredAt: breach.evidence.deliveredAt,
                    hoursOverdue: breach.evidence.hoursOverdue,
                    contractClause: breach.evidence.contractClause,
                    orderValue: breach.evidence.orderValue,
                    penaltyAmount: breach.penaltyAmount,
                  })
                }
              >
                <Download className="h-4 w-4" />
                <span className="text-xs">
                  Download evidence CSV
                </span>
              </div>
              <Link
                href={`/breaches/${breach.id}`}
                className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
              >
                <ArrowLeft className="h-3 w-3" />
                View breach detail
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Right column - Timeline + Actions */}
        <div className="space-y-6">
          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Status Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {timeline.map((entry, i) => (
                <div key={i} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < timeline.length - 1 && (
                    <div
                      className={`absolute left-[15px] top-8 bottom-0 w-px ${
                        entry.done ? "bg-emerald-200 dark:bg-emerald-800" : "bg-border"
                      }`}
                    />
                  )}
                  <div
                    className={`relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                      entry.done
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                        : "border-muted-foreground/30 bg-background"
                    }`}
                  >
                    {entry.done ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
                    )}
                  </div>
                  <div className="pt-1">
                    <p className="text-sm font-medium">{entry.label}</p>
                    <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                      {entry.date
                        ? <FormattedDate date={entry.date} formatStr="MMM dd, yyyy HH:mm" />
                        : "Pending"}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Penalty */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Penalty Amount
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums text-red-500">
                <CurrencyValue value={breach.penaltyAmount} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {rule
                  ? `${rule.penalty.value}% of ${formatCurrency(breach.evidence.orderValue)}`
                  : "Calculated penalty"}
              </p>
            </CardContent>
          </Card>

          {/* Tone */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                Draft Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tone</span>
                <span className="font-medium capitalize">{claim.draftTone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium" suppressHydrationWarning>
                  <FormattedDate date={claim.createdAt} />
                </span>
              </div>
              {claim.sentAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sent</span>
                  <span className="font-medium" suppressHydrationWarning>
                    <FormattedDate date={claim.sentAt} />
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {claim.status === "sent" && (
                <>
                  <Button
                    className="w-full"
                    size="sm"
                    onClick={() => setRecoverOpen(true)}
                  >
                    <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                    Mark Recovered
                  </Button>
                  <Button
                    className="w-full"
                    size="sm"
                    variant="outline"
                    onClick={() => setDisputeOpen(true)}
                  >
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    Mark Disputed
                  </Button>
                  <Button
                    className="w-full"
                    size="sm"
                    variant="outline"
                    onClick={handleFollowUp}
                    disabled={followUpSending}
                  >
                    {followUpSending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Send Follow-up
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recover dialog */}
      <Dialog open={recoverOpen} onOpenChange={setRecoverOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Recovered</DialogTitle>
            <DialogDescription>
              Confirm that the penalty amount has been recovered from the vendor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-xs">
                Recovered Amount (₹)
              </Label>
              <Input
                id="amount"
                type="number"
                value={recoverAmount}
                onChange={(e) => setRecoverAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecoverOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkRecovered}>
              <CheckCircle className="mr-1.5 h-4 w-4" />
              Confirm Recovery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute dialog */}
      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Disputed</DialogTitle>
            <DialogDescription>
              Record that the vendor has disputed this claim.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="note" className="text-xs">
                Dispute Note
              </Label>
              <Textarea
                id="note"
                value={disputeNote}
                onChange={(e) => setDisputeNote(e.target.value)}
                placeholder="Describe the vendor's dispute reasoning..."
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleMarkDisputed}>
              <XCircle className="mr-1.5 h-4 w-4" />
              Confirm Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Follow-up dialog */}
      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send Follow-up</DialogTitle>
            <DialogDescription>
              Review the follow-up email before sending to the vendor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            <div className="space-y-1.5">
              <Label className="text-xs">Subject</Label>
              <p className="text-sm font-medium">{followUpSubject}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Body</Label>
              <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-xs font-mono leading-relaxed">
                {followUpBody}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowUpOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendFollowUp}>
              <Send className="mr-1.5 h-4 w-4" />
              Send Follow-up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
