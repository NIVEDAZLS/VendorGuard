"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Upload,
  Sparkles,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  AlertTriangle,
} from "lucide-react"
import { useDropzone } from "react-dropzone"
import Papa from "papaparse"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useDataStore } from "@/lib/store"
import { DataSourceAPI } from "@/lib/api"
import { suggestFieldMapping } from "@/lib/ai"
import { toast } from "sonner"
import type { OperationalEvent } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const canonicalFields = [
  { key: "externalId", label: "Order ID" },
  { key: "shippedAt", label: "Shipped at" },
  { key: "deliveredAt", label: "Delivered at" },
  { key: "deadlineAt", label: "Deadline" },
  { key: "orderValue", label: "Order value" },
  { key: "destination", label: "Destination" },
]

const fieldSamples: Record<string, string> = {
  externalId: "e.g. BD-10001",
  shippedAt: "e.g. 2026-05-19 14:00",
  deliveredAt: "e.g. 2026-05-21 10:30",
  deadlineAt: "e.g. 2026-05-22 08:00",
  orderValue: "e.g. 45000",
  destination: "e.g. Mumbai, Maharashtra",
}

export function UploadOperationsWizard({ open, onOpenChange }: Props) {
  const router = useRouter()
  const store = useDataStore()
  const vendors = store.vendors
  const dataSources = store.dataSources

  const [step, setStep] = useState(1)
  const [vendorId, setVendorId] = useState("")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvPreview, setCsvPreview] = useState<{
    columns: string[]
    rows: Record<string, string>[]
    fullRows: Record<string, string>[]
  } | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDone, setAiDone] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [ingestResult, setIngestResult] = useState<{
    imported: number
    updated: number
  } | null>(null)

  const reset = () => {
    setStep(1)
    setVendorId("")
    setCsvFile(null)
    setCsvPreview(null)
    setMapping({})
    setAiLoading(false)
    setAiDone(false)
    setIngesting(false)
    setIngestResult(null)
  }

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  // Step 2: CSV drop + parse
  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length === 0) return
    const file = accepted[0]
    setCsvFile(file)
    Papa.parse(file, {
      header: true,
      preview: 5,
      complete: (results) => {
        const columns = results.meta.fields ?? []
        const rows = results.data as Record<string, string>[]
        setCsvPreview({ columns, rows, fullRows: rows })
      },
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
    onDrop,
  })

  // Parse full CSV for mapping
  const parseFullCsv = (): Promise<{ columns: string[]; rows: Record<string, string>[] }> => {
    return new Promise((resolve, reject) => {
      if (!csvFile) return reject("No file")
      Papa.parse(csvFile, {
        header: true,
        complete: (results) => {
          resolve({
            columns: results.meta.fields ?? [],
            rows: results.data as Record<string, string>[],
          })
        },
        error: reject,
      })
    })
  }

  const handleContinueToMapping = async () => {
    setStep(3)
    setAiLoading(true)
    setAiDone(false)
    try {
      const full = await parseFullCsv()
      const suggested = await suggestFieldMapping(full.columns, full.rows.slice(0, 5))
      setMapping(suggested)
      setAiDone(true)
    } catch {
      toast.error("Failed to analyze CSV")
    }
    setAiLoading(false)
  }

  const handleIngest = async () => {
    setIngesting(true)
    try {
      const full = await parseFullCsv()
      const sourceId =
        dataSources.find((ds) => ds.vendorId === vendorId)?.id ?? `ds-${Date.now()}`

      // Build events from CSV rows
      const existingIds = new Set(store.operationalEvents.map((e) => e.externalId))
      let imported = 0
      let updated = 0

      const newEvents = full.rows.map((row) => {
        const externalId = row[mapping.externalId] ?? `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const shippedAt = row[mapping.shippedAt] ?? new Date().toISOString()
        const deliveredAtRaw = mapping.deliveredAt ? row[mapping.deliveredAt] : undefined
        const deadlineRaw = mapping.deadlineAt ? row[mapping.deadlineAt] : undefined
        const orderValue = parseFloat(row[mapping.orderValue] ?? "0")
        const destination = mapping.destination ? row[mapping.destination] : "—"

        // Compute deadline from shipped_at + vendor SLA if not provided
        let deadlineAt: string
        if (deadlineRaw) {
          deadlineAt = new Date(deadlineRaw).toISOString()
        } else {
          // Default to 48h from shipped
          const shipped = new Date(shippedAt)
          deadlineAt = new Date(shipped.getTime() + 48 * 60 * 60 * 1000).toISOString()
        }

        const shippedDate = new Date(shippedAt)
        const deadlineDate = new Date(deadlineAt)
        const now = new Date()

        let deliveredAt: string | null = null
        let status: OperationalEvent["status"] = "in_transit"

        if (deliveredAtRaw && row[deliveredAtRaw]) {
          deliveredAt = new Date(row[deliveredAtRaw]).toISOString()
          const deliveredDate = new Date(deliveredAt)
          if (deliveredDate <= deadlineDate) {
            status = "compliant"
          } else {
            status = "breached"
          }
        } else if (now > deadlineDate) {
          const hoursOverdue =
            (now.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60)
          if (hoursOverdue < 4) status = "at_risk"
          else status = "breached"
        }

        const exists = existingIds.has(externalId)
        if (exists) updated++
        else imported++

        const newEvent: OperationalEvent = {
          id: `evt-imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          vendorId,
          sourceId,
          externalId,
          eventType: "delivery",
          shippedAt: shippedDate.toISOString(),
          deliveredAt,
          deadlineAt: deadlineDate.toISOString(),
          orderValue: isNaN(orderValue) ? 0 : orderValue,
          destination,
          status,
        }
        return newEvent
      })

      // Add to store
      for (const ev of newEvents) {
        store.addEvent(ev)
      }

      // Update data source
      store.updateDataSource(sourceId, { lastIngestedAt: new Date().toISOString() })
      store.addAuditEntry({
        id: `aud-${Date.now()}`,
        entityType: "datasource",
        entityId: sourceId,
        action: "datasource.ingested",
        actor: "system",
        payload: { rowsIngested: imported },
        timestamp: new Date().toISOString(),
      })

      await DataSourceAPI.ingest(sourceId)
      setIngestResult({ imported, updated })
      toast.success(`${imported} events ingested successfully`)
      setStep(4)
    } catch {
      toast.error("Ingestion failed")
    }
    setIngesting(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload operational data</DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center gap-0 mb-6">
          {[
            { step: 1, label: "Vendor" },
            { step: 2, label: "Upload" },
            { step: 3, label: "Mapping" },
            { step: 4, label: "Confirm" },
          ].map((s, i) => {
            const done = step > s.step
            const active = step === s.step
            return (
              <div key={s.step} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                      done
                        ? "bg-emerald-500 text-white"
                        : active
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : s.step}
                  </div>
                  <span
                    className={`text-sm hidden sm:inline ${active ? "font-medium" : "text-muted-foreground"}`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < 3 && (
                  <div
                    className={`flex-1 h-px mx-2 ${
                      done ? "bg-emerald-500" : "bg-border"
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Step 1: Pick vendor */}
        {step === 1 && (
          <div className="space-y-4 py-4">
            <Label>Select vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end pt-2">
              <Button
                disabled={!vendorId}
                onClick={() => setStep(2)}
              >
                Next
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Upload CSV */}
        {step === 2 && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label>Upload operational data (CSV)</Label>
              <a
                href="/sample-operations.csv"
                download
                className="text-xs text-emerald-600 hover:underline"
              >
                Download sample CSV
              </a>
            </div>

            <div
              {...getRootProps()}
              className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                isDragActive
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
            >
              <input {...getInputProps()} />
              {csvFile ? (
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-emerald-500" />
                  <div>
                    <p className="text-sm font-medium">{csvFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(csvFile.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    Loaded
                  </Badge>
                </div>
              ) : (
                <>
                  <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {isDragActive ? "Drop file here" : "Drag & drop CSV"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    or click to browse
                  </p>
                </>
              )}
            </div>

            {/* Preview table */}
            {csvPreview && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Preview — first {csvPreview.rows.length} of{" "}
                  {csvFile ? "full dataset" : "—"} rows
                </p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        {csvPreview.columns.map((col) => (
                          <th key={col} className="text-left font-medium p-2 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.rows.map((row, i) => (
                        <tr key={i} className="border-t">
                          {csvPreview.columns.map((col) => (
                            <td key={col} className="p-2 whitespace-nowrap text-muted-foreground">
                              {row[col] ?? "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
              <Button
                disabled={!csvFile}
                onClick={handleContinueToMapping}
              >
                Continue
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: AI Field Mapping */}
        {step === 3 && (
          <div className="space-y-4 py-4">
            {aiLoading && !aiDone && (
              <div className="flex flex-col items-center py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
                <p className="text-sm font-medium">AI is analyzing your data...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Matching columns to canonical fields
                </p>
              </div>
            )}

            {aiDone && (
              <>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium">
                    Field mapping suggestions
                  </span>
                </div>

                <div className="space-y-3">
                  {canonicalFields.map((field) => {
                    const csvColumns = Object.keys(mapping)
                    const suggested = csvColumns.find(
                      (col) => mapping[col] === field.key
                    )
                    return (
                      <div
                        key={field.key}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        <div className="w-28 shrink-0">
                          <p className="text-sm font-medium">{field.label}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {fieldSamples[field.key]}
                          </p>
                        </div>
                        <div className="flex-1">
                          <Select
                            value={
                              csvColumns.find((c) => mapping[c] === field.key) ?? "__none__"
                            }
                            onValueChange={(col) => {
                              const next = { ...mapping }
                              for (const [k, v] of Object.entries(next)) {
                                if (v === field.key) next[k] = "__none__"
                              }
                              if (col !== "__none__") {
                                next[col] = field.key
                              }
                              setMapping(next)
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select column" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Skip —</SelectItem>
                              {Object.keys(mapping).map((col) => (
                                <SelectItem key={col} value={col}>
                                  {col}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {suggested && (
                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0 gap-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                            AI suggested
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>

                <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                  <CardContent className="flex items-start gap-3 pt-4 text-xs">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-amber-800 dark:text-amber-200">
                      Review the mappings above. Deadlines will be auto-computed from
                      shipped date + SLA threshold where no deadline column is mapped.
                      Undelivered orders past their deadline will be flagged as at-risk
                      or breached.
                    </p>
                  </CardContent>
                </Card>

                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ChevronLeft className="mr-1.5 h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={handleIngest} disabled={ingesting}>
                    {ingesting ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Ingesting...
                      </>
                    ) : (
                      <>
                        Confirm mapping and ingest
                        <ChevronRight className="ml-1.5 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Ingestion result */}
        {step === 4 && ingestResult && (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
              <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-300" />
            </div>
            <h3 className="text-lg font-semibold">Ingestion complete</h3>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p>{ingestResult.imported} new events ingested</p>
              {ingestResult.updated > 0 && (
                <p>{ingestResult.updated} existing events updated</p>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={handleClose}>
                Done
              </Button>
              <Button onClick={() => {
                handleClose()
                router.push("/operations")
              }}>
                View events
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

