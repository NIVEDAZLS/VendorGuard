"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { FileText, Building2, Calendar } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useDataStore } from "@/lib/store"
import { extractSLAs } from "@/lib/ai"
import { ContractExtraction } from "@/components/shared/ContractExtraction"
import { ContractRules } from "@/components/shared/ContractRules"
import { toast } from "sonner"
import type { SLARule } from "@/lib/types"

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "warning" | "success" }> = {
  uploaded: { label: "Uploaded", variant: "secondary" },
  extracting: { label: "Extracting", variant: "warning" },
  extracted: { label: "Extracted", variant: "outline" },
  approved: { label: "Approved", variant: "success" },
}

export default function ContractDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { contracts, vendors, slaRules: storeRules, updateContract } = useDataStore()

  const contract = contracts.find((c) => c.id === id)
  const vendor = contract ? vendors.find((v) => v.id === contract.vendorId) : undefined
  const [rules, setRules] = useState<SLARule[]>(storeRules.filter((r) => r.contractId === id))
  const [showExtraction, setShowExtraction] = useState(false)
  const [extracting, setExtracting] = useState(false)

  // Trigger extraction if contract is freshly uploaded
  useEffect(() => {
    if (contract?.status === "uploaded" && !extracting) {
      setExtracting(true)
      setShowExtraction(true)
      updateContract(id, { status: "extracting" })
    }
  }, [contract, id, updateContract, extracting])

  const handleExtractionComplete = useCallback(
    async (_extractedRules: SLARule[]) => {
      // Call the AI extraction
      const result = await extractSLAs(id, "")
      updateContract(id, { status: "extracted" })
      // Add extracted rules to store if they don't already exist
      for (const rule of result) {
        const exists = useDataStore.getState().slaRules.find((r) => r.id === rule.id)
        if (!exists) {
          useDataStore.getState().addRule(rule)
        }
      }
      setRules(result)
      setShowExtraction(false)
      toast("Extraction complete — review the rules below")
    },
    [id, updateContract]
  )

  const handleAllApproved = () => {
    updateContract(id, { status: "approved" })
    toast.success("Contract activated. Monitoring now live for this vendor.")
  }

  if (!contract) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
        Contract not found
      </div>
    )
  }

  const status = statusConfig[contract.status] ?? { label: contract.status, variant: "outline" as const }
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{contract.fileName}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {vendor?.name ?? "—"}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(contract.uploadedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Extraction in progress */}
      {showExtraction && (
        <ContractExtraction onComplete={handleExtractionComplete} />
      )}

      {/* Rule review (after extraction) */}
      {!showExtraction && contract.status !== "uploaded" && contract.status !== "extracting" && (
        <ContractRules
          rules={rules}
          contractId={id}
          onAllApproved={handleAllApproved}
        />
      )}

      {/* Empty state for when nothing has happened */}
      {contract.status === "uploaded" && !extracting && (
        <div className="flex flex-col items-center py-16 text-center">
          <FileText className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Preparing extraction...</p>
        </div>
      )}
    </div>
  )
}
