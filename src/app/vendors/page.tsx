"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Building2, FileText, AlertTriangle, IndianRupee, Upload } from "lucide-react"
import { PageHeader } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatINR } from "@/lib/utils/format"
import { AddVendorDialog } from "@/components/shared/AddVendorDialog"
import { VendorAPI, BreachAPI } from "@/lib/api"
import type { Vendor, Contract, Breach } from "@/lib/types"

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "warning" | "success" }> = {
  uploaded: { label: "Uploaded", variant: "secondary" },
  extracting: { label: "Extracting", variant: "warning" },
  extracted: { label: "Extracted", variant: "outline" },
  approved: { label: "Approved", variant: "success" },
}

export default function VendorsPage() {
  const [onboardOpen, setOnboardOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("vendors")
  const [vendorFilter, setVendorFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")

  const [vendors, setVendors] = useState<Vendor[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  // raw breach rows keep vendor_id for per-vendor stats
  const [rawBreaches, setRawBreaches] = useState<Array<Breach & { vendorId: string }>>([])
  const [ruleCountMap, setRuleCountMap] = useState<Record<string, number>>({})

  const loadData = useCallback(async () => {
    const [vs, cs, bs] = await Promise.all([
      VendorAPI.list(),
      fetch("http://localhost:8000/api/contracts/").then(r => r.json()),
      fetch("http://localhost:8000/api/breaches/").then(r => r.json()),
    ])
    setVendors(vs)

    const contractList: Contract[] = (cs as Record<string, unknown>[]).map(r => ({
      id: r.id as string,
      vendorId: r.vendor_id as string,
      fileName: r.file_name as string,
      status: r.status as Contract["status"],
      uploadedAt: r.uploaded_at as string,
    }))
    setContracts(contractList)

    const rcMap: Record<string, number> = {}
    for (const r of cs as Record<string, unknown>[]) {
      rcMap[r.id as string] = Number(r.rule_count ?? 0)
    }
    setRuleCountMap(rcMap)

    // keep vendor_id from raw response for per-vendor breach stats
    setRawBreaches((bs as Record<string, unknown>[]).map(r => ({
      id: r.id as string,
      ruleId: (r.rule_id ?? "") as string,
      eventId: (r.log_id ?? "") as string,
      vendorId: (r.vendor_id ?? "") as string,
      breachedAt: (r.breached_at ?? "") as string,
      penaltyAmount: Number(r.penalty_amount ?? 0),
      status: (r.dispute_status ?? "open") as Breach["status"],
      evidence: { shippedAt: "", deadlineAt: "", deliveredAt: null, hoursOverdue: 0, contractClause: "", orderValue: 0 },
    })))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const vendorMap = new Map(vendors.map((v) => [v.id, v]))

  const vendorStats = vendors.map((v) => {
    const activeContracts = contracts.filter(
      (c) => c.vendorId === v.id && c.status === "approved"
    ).length
    const vendorBreaches = rawBreaches.filter((b) => b.vendorId === v.id)
    const openBreaches = vendorBreaches.filter((b) => b.status === "open").length
    const totalPenalty = vendorBreaches
      .filter((b) => b.status === "recovered")
      .reduce((sum, b) => sum + b.penaltyAmount, 0)
    return { ...v, activeContracts, openBreaches, totalPenalty }
  })

  const filteredContracts = contracts.filter((c) => {
    if (vendorFilter !== "all" && c.vendorId !== vendorFilter) return false
    if (statusFilter !== "all" && c.status !== statusFilter) return false
    return true
  })

  const totalSLARules = Object.values(ruleCountMap).reduce((s, n) => s + n, 0)
  const totalBreaches = rawBreaches.length

  return (
    <div>
      <PageHeader
        title="Contract Manager"
        description={
          activeTab === "vendors"
            ? "Manage your vendor relationships and contracts"
            : "Upload and manage SLA contracts"
        }
        actions={null}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
        </TabsList>

        <TabsContent value="vendors">
          {/* Upload zone + extraction stats */}
          <div className="flex gap-4 mb-6 items-stretch">
            <button
              onClick={() => setOnboardOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-semibold">Onboard Vendor</p>
              <p className="text-xs text-muted-foreground">Add vendor details + upload contract PDF · Agent 1 extracts SLA rules automatically</p>
              <span className="mt-1 inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Get Started</span>
            </button>
            <div className="flex-[2] rounded-xl border bg-card p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-semibold">Extraction Status</p>
              <p className="text-xs text-muted-foreground mb-4">Agent 1 (Legal Architect) — last ran on contract upload</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{contracts.filter((c) => c.status === "approved").length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Contracts Loaded</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{totalSLARules}</p>
                  <p className="text-xs text-muted-foreground mt-1">SLA Rules Extracted</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{totalBreaches}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total Breaches Found</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vendorStats.map((v) => (
              <Link key={v.id} href={`/vendors/${v.id}`}>
                <Card className="h-full transition-all hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800 cursor-pointer">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
                          <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-semibold">{v.name}</CardTitle>
                          <p className="text-xs text-muted-foreground">{v.industry}</p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        <span>{v.activeContracts} active contract{v.activeContracts !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>{v.openBreaches} open breach{v.openBreaches !== 1 ? "es" : ""}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <IndianRupee className="h-3.5 w-3.5" />
                        <span>{v.totalPenalty > 0 ? `${formatINR(v.totalPenalty)} recovered` : "No penalties"}</span>
                      </div>
                      <div className="pt-1">
                        <span className="text-muted-foreground">Contact: </span>
                        <span>{v.contactName}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="contracts">
          {/* Extraction stat mini-bar */}
          <div className="flex gap-3 mb-5 p-4 rounded-xl border bg-muted/30">
            <div className="flex-1 text-center">
              <p className="text-xl font-bold text-emerald-600">{contracts.filter((c) => c.status === "approved").length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Contracts Loaded</p>
            </div>
            <div className="w-px bg-border" />
            <div className="flex-1 text-center">
              <p className="text-xl font-bold text-blue-600">{totalSLARules}</p>
              <p className="text-xs text-muted-foreground mt-0.5">SLA Rules Extracted</p>
            </div>
            <div className="w-px bg-border" />
            <div className="flex-1 text-center">
              <p className="text-xl font-bold text-amber-600">{totalBreaches}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Breaches Found</p>
            </div>
          </div>
          {/* Filters */}
          <div className="mb-4 flex items-center gap-3">
            <div className="w-56">
              <Select value={vendorFilter} onValueChange={setVendorFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All vendors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vendors</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="uploaded">Uploaded</SelectItem>
                  <SelectItem value="extracting">Extracting</SelectItem>
                  <SelectItem value="extracted">Extracted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium p-3 pl-4">File</th>
                  <th className="text-left font-medium p-3">Vendor</th>
                  <th className="text-left font-medium p-3">Status</th>
                  <th className="text-left font-medium p-3">Rules</th>
                  <th className="text-left font-medium p-3">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((c) => {
                  const v = vendorMap.get(c.vendorId)
                  const initials = v?.name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2) ?? "??"
                  const ruleCount = ruleCountMap[c.id] ?? 0
                  const s = statusLabels[c.status] ?? { label: c.status, variant: "outline" as const }
                  return (
                    <tr
                      key={c.id}
                      className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="p-3 pl-4">
                        <Link href={`/contracts/${c.id}`} className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{c.fileName}</span>
                        </Link>
                      </td>
                      <td className="p-3">
                        <Link href={`/contracts/${c.id}`} className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[10px]" suppressHydrationWarning>{initials}</AvatarFallback>
                          </Avatar>
                          <span>{v?.name ?? "—"}</span>
                        </Link>
                      </td>
                      <td className="p-3">
                        <Link href={`/contracts/${c.id}`} className="block">
                          <Badge variant={s.variant}>{s.label}</Badge>
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        <Link href={`/contracts/${c.id}`} className="block">{ruleCount}</Link>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        <Link href={`/contracts/${c.id}`} className="block">
                          {new Date(c.uploadedAt).toLocaleDateString("en-IN")}
                        </Link>
                      </td>
                    </tr>
                  )
                })}
                {filteredContracts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                      No contracts found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <AddVendorDialog open={onboardOpen} onOpenChange={setOnboardOpen} />
    </div>
  )
}
