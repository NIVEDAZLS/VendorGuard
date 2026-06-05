"use client"
import { BASE } from "@/lib/api/base"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle, AlertTriangle, Clock, FileText, Send } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"


const EXCEPTION_REASONS = [
  "Force majeure / natural disaster",
  "Government restriction or port strike",
  "Public holiday under Indian labour law",
  "Carrier / third-party delay outside our control",
  "Customer-side delay (incorrect address, unavailable recipient)",
  "System outage affecting order processing",
  "Mutually agreed schedule change",
  "Other (explain below)",
]

interface TokenContext {
  valid: boolean
  token_id: string
  vendor_name: string
  metric_name: string
  order_ref: string
  started_at: string
  threshold_hours: number
  threshold_unit: string
  elapsed_hours: number
  pct_elapsed: number
  contract_section: string
  exception_clauses: string[]
  expires_at: string
}

function ExceptionForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""

  const [ctx, setCtx]           = useState<TokenContext | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)
  const [reason, setReason]     = useState("")
  const [description, setDesc]  = useState("")
  const [submitting, setSub]    = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!token) { setError("No token provided in link."); setLoading(false); return }
    fetch(`${BASE}/exceptions/validate?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.detail) setError(d.detail)
        else setCtx(d)
      })
      .catch(() => setError("Unable to validate link. Please try again later."))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit() {
    if (!reason) return
    setSub(true)
    try {
      const r = await fetch(`${BASE}/exceptions/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason, description }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.detail || "Submission failed."); return }
      setSubmitted(true)
    } catch {
      setError("Submission failed. Please try again.")
    } finally {
      setSub(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-slate-500 text-sm animate-pulse">Validating your link…</div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <Card className="max-w-md w-full border-red-200">
        <CardContent className="pt-6 text-center space-y-3">
          <AlertTriangle className="mx-auto text-red-500" size={40} />
          <p className="font-semibold text-red-700">Link Invalid or Expired</p>
          <p className="text-sm text-slate-500">{error}</p>
        </CardContent>
      </Card>
    </div>
  )

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <Card className="max-w-md w-full border-green-200">
        <CardContent className="pt-6 text-center space-y-3">
          <CheckCircle className="mx-auto text-green-500" size={40} />
          <p className="font-semibold text-green-700">Exception Submitted</p>
          <p className="text-sm text-slate-500">
            Your exception reason has been recorded. The VendorGuard compliance team will
            review it before any breach or penalty is finalised.
          </p>
        </CardContent>
      </Card>
    </div>
  )

  if (!ctx) return null

  const expiresDate = new Date(ctx.expires_at)
  const hoursLeft   = Math.max(0, (expiresDate.getTime() - Date.now()) / 3600000)

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase">VendorGuard</p>
          <h1 className="text-2xl font-bold text-slate-800">Pre-Breach Exception Submission</h1>
          <p className="text-sm text-slate-500">
            Submit a valid exception reason to prevent a formal breach notice and penalty claim.
          </p>
        </div>

        {/* SLA Breach Evidence */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText size={16} /> Breach Evidence
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-400">Vendor</p>
              <p className="font-medium">{ctx.vendor_name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Order / Reference</p>
              <p className="font-medium">{ctx.order_ref || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">SLA Metric</p>
              <p className="font-medium">{ctx.metric_name || ctx.order_ref}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Contract Section</p>
              <p className="font-medium">{ctx.contract_section || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">SLA Threshold</p>
              <p className="font-medium">{ctx.threshold_hours} {ctx.threshold_unit}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Elapsed</p>
              <p className="font-medium">{ctx.elapsed_hours.toFixed(1)}h
                <Badge
                  className="ml-2 text-xs"
                  variant={ctx.pct_elapsed >= 100 ? "destructive" : "secondary"}
                >
                  {ctx.pct_elapsed}%
                </Badge>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Started At</p>
              <p className="font-medium">{new Date(ctx.started_at).toLocaleString("en-IN")}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 flex items-center gap-1"><Clock size={11} /> Link Expires</p>
              <p className={`font-medium ${hoursLeft < 4 ? "text-red-600" : ""}`}>
                {expiresDate.toLocaleString("en-IN")} ({hoursLeft.toFixed(0)}h left)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Applicable Exception Clauses */}
        {ctx.exception_clauses?.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Applicable Exception Clauses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(typeof ctx.exception_clauses === "string"
                ? JSON.parse(ctx.exception_clauses)
                : ctx.exception_clauses
              ).map((clause: string, i: number) => (
                <p key={i} className="text-xs text-slate-600 border-l-2 border-slate-300 pl-3">{clause}</p>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Exception Form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Submit Your Exception</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-2">
                Exception Reason <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {EXCEPTION_REASONS.map(r => (
                  <label key={r} className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      name="reason"
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      className="mt-0.5 accent-slate-700"
                    />
                    <span className="text-sm text-slate-700 group-hover:text-slate-900">{r}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Additional Details / Supporting Evidence
              </label>
              <textarea
                value={description}
                onChange={e => setDesc(e.target.value)}
                rows={4}
                placeholder="Provide any supporting details, reference numbers, or documentation links…"
                className="w-full rounded-md border border-slate-200 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!reason || submitting}
              className="w-full gap-2"
            >
              <Send size={15} />
              {submitting ? "Submitting…" : "Submit Exception"}
            </Button>

            <p className="text-xs text-slate-400 text-center">
              This form is single-use. Once submitted, this link will be invalidated.
              False exceptions may result in escalated penalties under your contract.
            </p>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

export default function ExceptionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 text-sm animate-pulse">Loading…</div>
      </div>
    }>
      <ExceptionForm />
    </Suspense>
  )
}
