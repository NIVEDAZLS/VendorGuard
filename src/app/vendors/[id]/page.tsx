"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Building2,
  Mail,
  User,
  Calendar,
  FileText,
  BadgeCheck,
  Activity,
  Upload,
  X,
} from "lucide-react"
import { useDropzone } from "react-dropzone"
import { PageHeader } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useDataStore } from "@/lib/store"
import { timeAgo } from "@/lib/utils/format"
import { VendorAPI, ContractAPI } from "@/lib/api"
import { toast } from "sonner"

export default function VendorDetailPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const { vendors, contracts, slaRules, operationalEvents, auditEntries } =
    useDataStore()

  const vendor = vendors.find((v) => v.id === id)
  const vendorContracts = contracts.filter((c) => c.vendorId === id)
  const vendorEventIds = operationalEvents
    .filter((e) => e.vendorId === id)
    .map((e) => e.id)
  const contractIds = vendorContracts.map((c) => c.id)
  const vendorRules = slaRules.filter((r) => contractIds.includes(r.contractId))
  const vendorAudit = auditEntries.filter(
    (e) =>
      e.entityType === "vendor" ||
      (e.entityType === "contract" &&
        vendorContracts.some((c) => c.id === e.entityId)) ||
      (e.entityType === "event" && vendorEventIds.includes(e.entityId))
  )

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState(vendor?.name ?? "")
  const [editContact, setEditContact] = useState(vendor?.contactName ?? "")
  const [editEmail, setEditEmail] = useState(vendor?.contactEmail ?? "")
  const [editOwner, setEditOwner] = useState(vendor?.relationshipOwner ?? "")
  const [contractFile, setContractFile] = useState<File | null>(null)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: (accepted) => {
      if (accepted.length > 0) setContractFile(accepted[0])
    },
  })

  if (!vendor) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
        Vendor not found
      </div>
    )
  }

  const handleSave = async () => {
    await VendorAPI.update(id, {
      name: editName,
      contactName: editContact,
      contactEmail: editEmail,
      relationshipOwner: editOwner,
    })

    if (contractFile) {
      const contract = await ContractAPI.upload(id, contractFile)
      setContractFile(null)
      setEditOpen(false)
      toast.success("Vendor updated with new contract")
      router.push(`/contracts/${contract.id}`)
    } else {
      toast.success("Vendor updated")
      setEditOpen(false)
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "warning" | "success" }> = {
      uploaded: { label: "Uploaded", variant: "secondary" },
      extracting: { label: "Extracting", variant: "warning" },
      extracted: { label: "Extracted", variant: "outline" },
      approved: { label: "Approved", variant: "success" },
    }
    const s = map[status] ?? { label: status, variant: "outline" }
    return <Badge variant={s.variant}>{s.label}</Badge>
  }

  return (
    <div>
      <PageHeader
        title={vendor.name}
        description={vendor.industry}
        actions={
          <Sheet open={editOpen} onOpenChange={setEditOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                Edit
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Edit vendor</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Vendor name</Label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Contact name</Label>
                  <Input value={editContact} onChange={(e) => setEditContact(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Contact email</Label>
                  <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Relationship owner</Label>
                  <Input value={editOwner} onChange={(e) => setEditOwner(e.target.value)} />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Upload new contract (optional)</Label>
                  <div
                    {...getRootProps()}
                    className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
                      isDragActive
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                        : "border-muted-foreground/25 hover:border-muted-foreground/50"
                    }`}
                  >
                    <input {...getInputProps()} />
                    {contractFile ? (
                      <div className="flex items-center gap-3">
                        <FileText className="h-7 w-7 text-emerald-500" />
                        <div>
                          <p className="text-sm font-medium">{contractFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(contractFile.size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            setContractFile(null)
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Upload className="mb-2 h-5 w-5 text-muted-foreground" />
                        <p className="text-sm font-medium">
                          {isDragActive ? "Drop file here" : "Drag & drop PDF"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                      </>
                    )}
                  </div>
                </div>

                <Button onClick={handleSave} className="w-full">
                  Save changes
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        }
      />

      {/* Info card */}
      <Card className="mb-6">
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contact</p>
              <p className="text-sm font-medium">{vendor.contactName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Mail className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium truncate">{vendor.contactEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Relationship owner</p>
              <p className="text-sm font-medium">{vendor.relationshipOwner}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Partner since</p>
              <p className="text-sm font-medium">
                {new Date(vendor.createdAt).toLocaleDateString("en-IN", {
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="contracts">
        <TabsList>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="rules">SLA rules</TabsTrigger>
          <TabsTrigger value="activity">Recent activity</TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="space-y-3 mt-4">
          {vendorContracts.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No contracts yet
            </p>
          )}
          {vendorContracts.map((c) => {
            const ruleCount = slaRules.filter((r) => r.contractId === c.id).length
            return (
              <a
                key={c.id}
                href={`/contracts/${c.id}`}
                className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{c.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {ruleCount} rule{ruleCount !== 1 ? "s" : ""} ·{" "}
                      {new Date(c.uploadedAt).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                </div>
                {statusBadge(c.status)}
              </a>
            )
          })}
        </TabsContent>

        <TabsContent value="rules" className="mt-4 space-y-3">
          {vendorRules
            .filter((r) => r.status === "approved")
            .map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between pt-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium">{r.metricLabel}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {r.metricType.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Threshold: {r.threshold.value} {r.threshold.unit} ·{" "}
                      Penalty: {r.penalty.value}% of {r.penalty.basis}
                    </p>
                  </div>
                  <Badge variant="success">Active</Badge>
                </CardContent>
              </Card>
            ))}
          {vendorRules.filter((r) => r.status === "approved").length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No approved SLA rules yet
            </p>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-3">
          {vendorAudit.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No recent activity
            </p>
          )}
          {vendorAudit
            .sort(
              (a, b) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            )
            .slice(0, 10)
            .map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg border p-3">
                <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{e.action}</p>
                  <p className="text-xs text-muted-foreground">{timeAgo(e.timestamp)}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {e.actor}
                </Badge>
              </div>
            ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
