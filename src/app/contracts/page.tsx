"use client"

import { useState } from "react"
import Link from "next/link"
import { Upload, FileText } from "lucide-react"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDataStore } from "@/lib/store"
import { UploadContractDialog } from "@/components/shared/UploadContractDialog"

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "warning" | "success" }> = {
  uploaded: { label: "Uploaded", variant: "secondary" },
  extracting: { label: "Extracting", variant: "warning" },
  extracted: { label: "Extracted", variant: "outline" },
  approved: { label: "Approved", variant: "success" },
}

export default function ContractsPage() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [vendorFilter, setVendorFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const { contracts, vendors, slaRules } = useDataStore()

  const vendorMap = new Map(vendors.map((v) => [v.id, v]))

  const filtered = contracts.filter((c) => {
    if (vendorFilter !== "all" && c.vendorId !== vendorFilter) return false
    if (statusFilter !== "all" && c.status !== statusFilter) return false
    return true
  })

  return (
    <div>
      <PageHeader
        title="Contracts"
        description="Upload and manage SLA contracts"
        actions={
          <Button onClick={() => setUploadOpen(true)} size="sm">
            <Upload className="mr-1.5 h-4 w-4" />
            Upload contract
          </Button>
        }
      />

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
            {filtered.map((c) => {
              const v = vendorMap.get(c.vendorId)
              const initials = v?.name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2) ?? "??"
              const ruleCount = slaRules.filter((r) => r.contractId === c.id).length
              const s = statusLabels[c.status] ?? { label: c.status, variant: "outline" }
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                  No contracts found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <UploadContractDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  )
}
