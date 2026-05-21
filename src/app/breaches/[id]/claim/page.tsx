"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Sparkles,
  FileText,
  Download,
  RefreshCw,
  Send,
  Save,
  Loader2,
  DollarSign,
  Mail,
  Check,
} from "lucide-react"
import { useDataStore } from "@/lib/store"
import { formatCurrency } from "@/lib/utils/format"
import { downloadEvidenceCSV } from "@/lib/utils/csv"
import { draftClaimEmail } from "@/lib/ai"
import { ClaimAPI } from "@/lib/api"
import { format } from "date-fns"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { DraftTone } from "@/lib/types"

type PageState = "generating" | "review" | "sending"

const toneLabels: Record<DraftTone, string> = {
  firm: "Firm",
  diplomatic: "Diplomatic",
  urgent: "Urgent",
}

const evidenceFields = [
  { key: "externalId", label: "Order Reference" },
  { key: "shippedAt", label: "Shipped At" },
  { key: "deadlineAt", label: "Scheduled Delivery" },
  { key: "deliveredAt", label: "Actual Delivery" },
  { key: "hoursOverdue", label: "Hours Overdue" },
  { key: "contractClause", label: "Contract Clause" },
  { key: "orderValue", label: "Order Value" },
  { key: "penaltyAmount", label: "Penalty Amount" },
]

export default function ClaimGenerationPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { breaches, operationalEvents, vendors, slaRules, claims, updateBreach, addAuditEntry } =
    useDataStore()

  const breach = breaches.find((b) => b.id === id)
  const event = breach
    ? operationalEvents.find((e) => e.id === breach.eventId)
    : undefined
  const vendor = event ? vendors.find((v) => v.id === event.vendorId) : undefined
  const rule = breach ? slaRules.find((r) => r.id === breach.ruleId) : undefined
  const existingClaim = claims.find((c) => c.breachId === id)

  // State machine
  const [state, setState] = useState<PageState>(
    existingClaim ? "review" : "generating"
  )
  const [progress, setProgress] = useState(0)
  const [tone, setTone] = useState<DraftTone>(
    (existingClaim?.draftTone as DraftTone) ?? "firm"
  )

  // Email draft form state
  const [recipient, setRecipient] = useState(
    existingClaim?.recipientEmail ?? vendor?.contactEmail ?? ""
  )
  const [cc, setCc] = useState(existingClaim?.cc ?? "")
  const [subject, setSubject] = useState(existingClaim?.draftSubject ?? "")
  const [body, setBody] = useState(existingClaim?.draftBody ?? "")
  const [showSendDialog, setShowSendDialog] = useState(false)

  // AI draft
  const [aiLoading, setAiLoading] = useState(false)

  const generateDraft = async (t: DraftTone) => {
    if (!breach || !vendor || !event) return
    setAiLoading(true)
    setState("generating")
    setProgress(0)

    // Animate progress
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 8, 90))
    }, 250)

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
        t
      )

      setSubject(result.subject)
      setBody(result.body)
      setRecipient(vendor.contactEmail)
      setProgress(100)
      setTimeout(() => {
        setState("review")
        setAiLoading(false)
      }, 400)
    } catch {
      setAiLoading(false)
      toast.error("Failed to generate draft")
    } finally {
      clearInterval(interval)
    }
  }

  // Start initial draft
  useEffect(() => {
    if (!existingClaim && breach && vendor && event) {
      generateDraft(tone)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Guard
  if (!breach || !event || !vendor) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
        Breach not found
      </div>
    )
  }

  const handleRegenerate = () => {
    generateDraft(tone)
  }

  const handleSaveDraft = async () => {
    try {
      const now = new Date().toISOString()
      if (existingClaim) {
        await ClaimAPI.update(existingClaim.id, {
          recipientEmail: recipient,
          cc,
          draftSubject: subject,
          draftBody: body,
          draftTone: tone,
          status: "draft",
        })
      } else {
        await ClaimAPI.create({
          breachId: breach.id,
          recipientEmail: recipient,
          cc,
          draftSubject: subject,
          draftBody: body,
          draftTone: tone,
          status: "draft",
        })
      }
      updateBreach(breach.id, { status: "claim_drafted" })
      addAuditEntry({
        id: `aud-${Date.now()}`,
        entityType: "breach",
        entityId: breach.id,
        action: "claim.drafted",
        actor: "user",
        payload: { breachId: breach.id },
        timestamp: now,
      })
      toast.success("Draft saved")
      router.push(`/breaches/${breach.id}`)
    } catch {
      toast.error("Failed to save draft")
    }
  }

  const handleSendClaim = async () => {
    setShowSendDialog(false)
    setState("sending")
    try {
      const now = new Date().toISOString()
      let claimId: string
      if (existingClaim) {
        await ClaimAPI.update(existingClaim.id, {
          recipientEmail: recipient,
          cc,
          draftSubject: subject,
          draftBody: body,
          draftTone: tone,
          status: "sent",
          sentAt: now,
        })
        claimId = existingClaim.id
      } else {
        const created = await ClaimAPI.create({
          breachId: breach.id,
          recipientEmail: recipient,
          cc,
          draftSubject: subject,
          draftBody: body,
          draftTone: tone,
          status: "sent",
        })
        claimId = created.id
        await ClaimAPI.send(claimId)
      }
      updateBreach(breach.id, { status: "claim_sent" })
      addAuditEntry({
        id: `aud-${Date.now()}`,
        entityType: "breach",
        entityId: breach.id,
        action: "claim.sent",
        actor: "user",
        payload: { claimId, recipientEmail: recipient },
        timestamp: now,
      })
      toast.success(`Claim sent to ${vendor.name}`)
      router.push(`/breaches/${breach.id}`)
    } catch {
      toast.error("Failed to send claim")
      setState("review")
    }
  }

  // Evidence data for display
  const evidenceData: Record<string, string> = {
    externalId: event.externalId,
    shippedAt: format(new Date(breach.evidence.shippedAt), "MMM dd, yyyy HH:mm"),
    deadlineAt: format(new Date(breach.evidence.deadlineAt), "MMM dd, yyyy HH:mm"),
    deliveredAt: breach.evidence.deliveredAt
      ? format(new Date(breach.evidence.deliveredAt), "MMM dd, yyyy HH:mm")
      : "Not delivered",
    hoursOverdue: `${breach.evidence.hoursOverdue}h`,
    contractClause: breach.evidence.contractClause,
    orderValue: formatCurrency(breach.evidence.orderValue),
    penaltyAmount: formatCurrency(breach.penaltyAmount),
  }

  // ─── Rendering ───────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/breaches/${breach.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to breach
      </Link>

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Generate Claim
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {vendor.name} · {event.externalId} · {event.destination}
        </p>
      </div>

      {/* ── Step 1: AI Generating ──────────────────────────────────── */}
      {state === "generating" && (
        <Card>
          <CardContent className="pt-6 pb-8">
            <div className="flex flex-col items-center text-center max-w-lg mx-auto">
              <div className="relative mb-6">
                <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
                  <Sparkles className="h-7 w-7 text-emerald-600" />
                </div>
              </div>
              <h3 className="text-lg font-medium mb-1">
                AI is drafting your claim...
              </h3>
              <p className="text-sm text-muted-foreground mb-8">
                Gathering breach evidence and composing a professional dispute
                email
              </p>

              {/* Flow diagram */}
              <div className="w-full space-y-3 mb-8">
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                  <FileText className="h-5 w-5 text-blue-500 shrink-0" />
                  <div className="text-left flex-1">
                    <p className="font-medium">Evidence inputs</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {event.externalId} · {breach.evidence.contractClause} ·{" "}
                      {breach.evidence.hoursOverdue}h overdue
                    </p>
                  </div>
                  <Check className={`h-4 w-4 ${progress > 20 ? "text-emerald-500" : "text-muted"}`} />
                </div>

                <div className="flex justify-center">
                  <div className="h-8 w-0.5 bg-border" />
                </div>

                <div className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                  progress > 20 && progress < 80
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
                    : "bg-muted/30"
                }`}>
                  <Loader2 className={`h-5 w-5 shrink-0 ${
                    progress > 20 && progress < 80
                      ? "text-emerald-500 animate-spin"
                      : "text-muted-foreground"
                  }`} />
                  <div className="text-left flex-1">
                    <p className="font-medium">AI Draft Engine</p>
                    <p className="text-xs text-muted-foreground">
                      {progress < 40
                        ? "Analyzing breach evidence..."
                        : progress < 70
                          ? "Applying SLA penalty rules..."
                          : "Composing email draft..."}
                    </p>
                  </div>
                  {progress > 80 && (
                    <Check className="h-4 w-4 text-emerald-500" />
                  )}
                </div>

                <div className="flex justify-center">
                  <div className="h-8 w-0.5 bg-border" />
                </div>

                <div className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                  progress >= 100
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
                    : "bg-muted/30 opacity-50"
                }`}>
                  <Mail className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="text-left flex-1">
                    <p className="font-medium">Draft Output</p>
                    <p className="text-xs text-muted-foreground">
                      {progress >= 100 ? "Ready for review" : "Waiting..."}
                    </p>
                  </div>
                  {progress >= 100 && (
                    <Check className="h-4 w-4 text-emerald-500" />
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-2 mb-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Step 1 of 2 — Generating draft
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Review & Edit ──────────────────────────────────── */}
      {state === "review" && (
        <>
          {/* Header bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium">Review &amp; Edit</h2>
              <Badge variant="outline" className="text-xs">
                Step 2 of 2
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="tone" className="text-xs text-muted-foreground">
                  Tone:
                </Label>
                <Select
                  value={tone}
                  onValueChange={(v) => setTone(v as DraftTone)}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(toneLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={aiLoading}
              >
                <RefreshCw
                  className={`mr-1.5 h-3.5 w-3.5 ${aiLoading ? "animate-spin" : ""}`}
                />
                Regenerate
              </Button>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column — Email draft */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    Email Draft
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="recipient" className="text-xs">
                        To
                      </Label>
                      <Input
                        id="recipient"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cc" className="text-xs">
                        CC
                      </Label>
                      <Input
                        id="cc"
                        value={cc}
                        onChange={(e) => setCc(e.target.value)}
                        className="text-sm"
                        placeholder="cc@example.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="subject" className="text-xs">
                      Subject
                    </Label>
                    <Input
                      id="subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="text-sm font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="body" className="text-xs">
                      Body
                    </Label>
                    <Textarea
                      id="body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="min-h-[350px] text-sm font-mono leading-relaxed"
                    />
                  </div>

                  <Separator />

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
                    <span>
                      Attachment:{" "}
                      <span className="font-mono text-xs">
                        evidence_{event.externalId}.csv
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleSaveDraft}>
                  <Save className="mr-1.5 h-4 w-4" />
                  Save Draft
                </Button>
                <Button onClick={() => setShowSendDialog(true)}>
                  <Send className="mr-1.5 h-4 w-4" />
                  Send Claim
                </Button>
              </div>
            </div>

            {/* Right column — Evidence summary */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Evidence Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  {evidenceFields.map((field) => (
                    <div
                      key={field.key}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          {field.label}
                        </p>
                        <p className="text-sm font-medium truncate">
                          {evidenceData[field.key]}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="ml-2 shrink-0 text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                      >
                        used in email
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Penalty quick view */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    Penalty
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-red-500">
                    {formatCurrency(breach.penaltyAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {rule
                      ? `${rule.penalty.value}% of ${formatCurrency(breach.evidence.orderValue)}`
                      : "Calculated penalty"}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* ── Sending state ──────────────────────────────────────────── */}
      {state === "sending" && (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <Loader2 className="h-8 w-8 text-emerald-500 animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">
              Sending claim to {vendor.name}...
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Send confirmation dialog ───────────────────────────────── */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Claim</DialogTitle>
            <DialogDescription>
              This will send the email to{" "}
              <span className="font-medium">{recipient}</span> and mark the
              breach as claimed. The vendor will receive the penalty notice and
              evidence attachment.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">To:</span> {recipient}
            </p>
            {cc && (
              <p>
                <span className="text-muted-foreground">CC:</span> {cc}
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Subject:</span>{" "}
              {subject}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSendDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSendClaim}>
              <Send className="mr-1.5 h-4 w-4" />
              Confirm Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
