"use client"
import { BASE } from "@/lib/api/base"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { FileText, Building2, Calendar, Loader2, Clock, CheckCircle2, ChevronDown, ChevronRight, ChevronLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ContractRules } from "@/components/shared/ContractRules"
import { ContractAPI, VendorAPI } from "@/lib/api"
import { toast } from "sonner"
import type { Contract, SLARule, Vendor } from "@/lib/types"

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "warning" | "success" }> = {
  uploaded:   { label: "Uploaded",   variant: "secondary" },
  extracting: { label: "Extracting", variant: "warning" },
  extracted:  { label: "Extracted",  variant: "outline" },
  approved:   { label: "Approved",   variant: "success" },
}

export default function ContractDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [contract, setContract] = useState<Contract | null>(null)
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [rules, setRules] = useState<SLARule[]>([])
  const [extractedText, setExtractedText] = useState<string>("")
  const [textExpanded, setTextExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const data = await ContractAPI.getExtractionStatus(id)
      const c: Contract = {
        id,
        vendorId: "",
        fileName: "",
        status: data.status,
        uploadedAt: new Date().toISOString(),
      }

      // getExtractionStatus returns the raw backend shape — pull full contract info
      const raw = await fetch(`${BASE}/contracts/${id}`).then(r => r.json()) as {
        contract: Record<string, unknown>
        sla_rules: Record<string, unknown>[]
      }

      const fullContract: Contract = {
        id,
        vendorId: raw.contract.vendor_id as string,
        fileName: raw.contract.file_name as string,
        status: raw.contract.status as Contract["status"],
        uploadedAt: raw.contract.uploaded_at as string,
      }

      setContract(fullContract)
      setRules(data.rules)
      setExtractedText((raw.contract.extracted_text as string) ?? "")
      setLoading(false)

      // Fetch vendor name
      if (fullContract.vendorId) {
        VendorAPI.getById(fullContract.vendorId).then(v => { if (v) setVendor(v) }).catch(() => {})
      }

      // Stop polling once extraction is done
      if (fullContract.status !== "extracting" && pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
        if (fullContract.status === "extracted" && data.rules.length > 0) {
          toast.success(`Extraction complete — ${data.rules.length} rules ready for review`)
        }
      }
    } catch {
      setNotFound(true)
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Start polling when status is extracting
  useEffect(() => {
    if (!contract) return
    if (contract.status === "extracting" && !pollRef.current) {
      pollRef.current = setInterval(fetchData, 5000)
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [contract?.status, fetchData])

  const handleAllApproved = useCallback(() => {
    setContract(prev => prev ? { ...prev, status: "approved" } : prev)
    toast.success("Contract activated. Monitoring now live for this vendor.")
  }, [])

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading contract…</span>
      </div>
    )
  }

  if (notFound || !contract) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-2">
        <FileText className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Contract not found</p>
      </div>
    )
  }

  const status = statusConfig[contract.status] ?? { label: contract.status, variant: "outline" as const }

  return (
    <div>
      {/* Back navigation */}
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{contract.fileName}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {vendor && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {vendor.name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(contract.uploadedAt).toLocaleDateString("en-IN", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </span>
            </div>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Extracting — background banner, user can navigate away */}
      {contract.status === "extracting" && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-5 py-4 flex items-center gap-4 mb-6">
          <Loader2 className="h-5 w-5 text-amber-500 shrink-0 animate-spin" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              AI extraction running in the background
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              You can navigate freely — this page will update automatically when done.
            </p>
          </div>
        </div>
      )}

      {/* Uploaded — not yet started */}
      {contract.status === "uploaded" && (
        <div className="rounded-xl border border-border bg-muted/30 px-5 py-4 flex items-center gap-4 mb-6">
          <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">
            Contract uploaded. Extraction will start shortly.
          </p>
        </div>
      )}

      {/* Rules — shown once extracted or approved */}
      {(contract.status === "extracted" || contract.status === "approved") && (
        rules.length > 0 ? (
          <ContractRules
            rules={rules}
            contractId={id}
            onAllApproved={handleAllApproved}
          />
        ) : (
          <div className="flex flex-col items-center py-16 text-center gap-2">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Extraction complete but no SLA rules were found in this contract.
            </p>
          </div>
        )
      )}

      {/* Full contract text — collapsible, shown once extracted */}
      {extractedText && (contract.status === "extracted" || contract.status === "approved") && (
        <div className="mt-6 rounded-xl border">
          <button
            onClick={() => setTextExpanded(v => !v)}
            className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Full Contract Text
            </span>
            {textExpanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
          {textExpanded && (
            <div className="border-t px-5 py-4 max-h-[600px] overflow-y-auto">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono">
                {extractedText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
