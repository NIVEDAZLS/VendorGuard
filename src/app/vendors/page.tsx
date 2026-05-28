"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Building2, FileText, AlertTriangle, IndianRupee, Upload } from "lucide-react"
import { PageHeader } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { useDataStore } from "@/lib/store"
import { formatINR } from "@/lib/utils/format"
import { AddVendorDialog } from "@/components/shared/AddVendorDialog"
import { UploadContractDialog } from "@/components/shared/UploadContractDialog"

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "warning" | "success" }> = {
  uploaded: { label: "Uploaded", variant: "secondary" },
  extracting: { label: "Extracting", variant: "warning" },
  extracted: { label: "Extracted", variant: "outline" },
  approved: { label: "Approved", variant: "success" },
}

export default function VendorsPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("vendors")
  const [vendorFilter, setVendorFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const { vendors, contracts, breaches, operationalEvents, slaRules } = useDataStore()

  const vendorMap = new Map(vendors.map((v) => [v.id, v]))

  const vendorStats = vendors.map((v) => {
    const activeContracts = contracts.filter(
      (c) => c.vendorId === v.id && c.status === "approved"
    ).length

    const vendorEventIds = operationalEvents
      .filter((e) => e.vendorId === v.id)
      .map((e) => e.id)

    const vendorBreaches = breaches.filter((b) =>
      vendorEventIds.includes(b.eventId)
    )
    const openBreaches = vendorBreaches.filter(
      (b) => b.status === "open" || b.status === "claim_drafted"
    ).length

    const totalPenalty = vendorBreaches
      .filter((b) => b.status === "claim_sent" || b.status === "recovered")
      .reduce((sum, b) => sum + b.penaltyAmount, 0)

    return { ...v, activeContracts, openBreaches, totalPenalty }
  })

  const filteredContracts = contracts.filter((c) => {
    if (vendorFilter !== "all" && c.vendorId !== vendorFilter) return false
    if (statusFilter !== "all" && c.status !== statusFilter) return false
    return true
  })

  return (
    <div>
      <PageHeader
        title="Vendors & Contracts"
        description={
          activeTab === "vendors"
            ? "Manage your vendor relationships"
            : "Upload and manage SLA contracts"
        }
        actions={
          activeTab === "vendors" ? (
            <Button onClick={() => setDialogOpen(true)} size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Add vendor
            </Button>
          ) : (
            <Button onClick={() => setUploadOpen(true)} size="sm">
              <Upload className="mr-1.5 h-4 w-4" />
              Upload contract
            </Button>
          )
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
        </TabsList>

        <TabsContent value="vendors">
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
                  const ruleCount = slaRules.filter((r) => r.contractId === c.id).length
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

      <AddVendorDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <UploadContractDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  )
}
