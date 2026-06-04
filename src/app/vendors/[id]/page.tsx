"use client"

import { useState, useEffect, useCallback } from "react"
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
  ArrowLeft,
  AlertTriangle,
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
import { ContractAPI } from "@/lib/api"
import { toast } from "sonner"

const BASE = "http://localhost:8000/api"

interface Vendor {
  id: string
  name: string
  industry: string
  contact_email: string
  contact_name: string
  relationship_owner: string
  created_at: string
}

interface Contract {
  id: string
  vendor_id: string
  file_name: string
  status: string
  uploaded_at: string
  rule_count: number
}

interface SlaRule {
  id: string
  metric_name: string
  threshold_hours: number | null
  threshold_unit: string
  penalty_type: string | null
  penalty_value: number | null
  status: string
  contract_section: string | null
}

interface Breach {
  id: string
  metric_name: string
  delay_hours: number
  penalty_amount: number
  dispute_status: string
  breached_at: string
}

interface AuditEntry {
  id: string
  status: string
  reasoning: string
  created_at: string
  metric_name: string | null
}

export default function VendorDetailPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [slaRules, setSlaRules] = useState<SlaRule[]>([])
  const [breaches, setBreaches] = useState<Breach[]>([])
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState("")
  const [editContact, setEditContact] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editOwner, setEditOwner] = useState("")
  const [contractFile, setContractFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: (accepted) => {
      if (accepted.length > 0) setContractFile(accepted[0])
    },
  })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const vRes = await fetch(`${BASE}/vendors/${id}`)
      if (vRes.status === 404) { setNotFound(true); return }
      if (!vRes.ok) throw new Error("Failed to load vendor")
      const v: Vendor = await vRes.json()
      setVendor(v)
      setEditName(v.name)
      setEditContact(v.contact_name)
      setEditEmail(v.contact_email)
      setEditOwner(v.relationship_owner)

      const [cRes, bRes, aRes] = await Promise.all([
        fetch(`${BASE}/contracts/?vendor_id=${id}`),
        fetch(`${BASE}/breaches/?vendor_id=${id}&days=90`),
        fetch(`${BASE}/audit/?vendor_id=${id}&days=90`),
      ])

      if (cRes.ok) setContracts(await cRes.json())
      if (bRes.ok) setBreaches(await bRes.json())
      if (aRes.ok) {
        const aData = await aRes.json()
        setAuditEntries(aData.entries ?? [])
      }

      // Collect SLA rules from all contracts
      const contractData: Contract[] = cRes.ok ? await cRes.clone().json().catch(() => contracts) : []
      if (contractData.length > 0) {
        const rulesRes = await Promise.all(
          contractData.map((c) => fetch(`${BASE}/contracts/${c.id}`))
        )
        const allRules: SlaRule[] = []
        for (const r of rulesRes) {
          if (r.ok) {
            const d = await r.json()
            allRules.push(...(d.sla_rules ?? []))
          }
        }
        setSlaRules(allRules)
      }
    } catch (e) {
      toast.error("Failed to load vendor data")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleSave = async () => {
    setSaving(true)
    try {
      const patchRes = await fetch(`${BASE}/vendors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          contact_name: editContact,
          contact_email: editEmail,
          relationship_owner: editOwner,
        }),
      })
      if (!patchRes.ok) throw new Error("Update failed")

      if (contractFile) {
        const contract = await ContractAPI.upload(id, contractFile)
        setContractFile(null)
        setEditOpen(false)
        toast.success("Vendor updated with new contract")
        router.push(`/contracts/${contract.id}`)
      } else {
        toast.success("Vendor updated")
        setEditOpen(false)
        fetchAll()
      }
    } catch {
      toast.error("Failed to save changes")
    } finally {
      setSaving(false)
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      uploaded:   { label: "Uploaded",   className: "bg-slate-100 text-slate-700" },
      extracting: { label: "Extracting", className: "bg-amber-100 text-amber-700" },
      extracted:  { label: "Extracted",  className: "bg-blue-100 text-blue-700" },
      approved:   { label: "Approved",   className: "bg-emerald-100 text-emerald-700" },
    }
    const s = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" }
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>
  }

  const disputeBadge = (status: string) => {
    const map: Record<string, string> = {
      open: "bg-red-50 text-red-700",
      pending_review: "bg-amber-50 text-amber-700",
      sent: "bg-blue-50 text-blue-700",
      paid: "bg-emerald-50 text-emerald-700",
    }
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>{status}</span>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (notFound || !vendor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-muted-foreground">
        <AlertTriangle className="h-8 w-8" />
        <p>Vendor not found</p>
        <Button variant="outline" onClick={() => router.back()}>Go back</Button>
      </div>
    )
  }

  return (
    <div>
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-1 text-muted-foreground hover:text-foreground"
        onClick={() => router.back()}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Portfolio
      </Button>

      <PageHeader
        title={vendor.name}
        description={vendor.industry}
        actions={
          <Sheet open={editOpen} onOpenChange={setEditOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">Edit</Button>
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
                  <Label>Vendor contact email</Label>
                  <Input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="vendor@example.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Used for dispute notices and pre-breach warnings
                  </p>
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
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-muted-foreground/25 hover:border-muted-foreground/50"
                    }`}
                  >
                    <input {...getInputProps()} />
                    {contractFile ? (
                      <div className="flex items-center gap-3">
                        <FileText className="h-7 w-7 text-emerald-500" />
                        <div>
                          <p className="text-sm font-medium">{contractFile.name}</p>
                          <p className="text-xs text-muted-foreground">{(contractFile.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); setContractFile(null) }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Upload className="mb-2 h-5 w-5 text-muted-foreground" />
                        <p className="text-sm font-medium">{isDragActive ? "Drop file here" : "Drag & drop PDF"}</p>
                        <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                      </>
                    )}
                  </div>
                </div>

                <Button onClick={handleSave} className="w-full" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
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
              <p className="text-sm font-medium">{vendor.contact_name || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Mail className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium truncate">{vendor.contact_email || <span className="text-amber-600 text-xs">No email on file</span>}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Relationship owner</p>
              <p className="text-sm font-medium">{vendor.relationship_owner || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Partner since</p>
              <p className="text-sm font-medium">
                {new Date(vendor.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="contracts">
        <TabsList>
          <TabsTrigger value="contracts">Contracts ({contracts.length})</TabsTrigger>
          <TabsTrigger value="rules">SLA rules ({slaRules.filter(r => r.status === "approved").length})</TabsTrigger>
          <TabsTrigger value="breaches">Breaches ({breaches.length})</TabsTrigger>
          <TabsTrigger value="activity">Audit ({auditEntries.length})</TabsTrigger>
        </TabsList>

        {/* Contracts tab */}
        <TabsContent value="contracts" className="space-y-3 mt-4">
          {contracts.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No contracts yet</p>
          )}
          {contracts.map((c) => (
            <a
              key={c.id}
              href={`/contracts/${c.id}`}
              className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{c.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.rule_count} rule{c.rule_count !== 1 ? "s" : ""} · {new Date(c.uploaded_at).toLocaleDateString("en-IN")}
                  </p>
                </div>
              </div>
              {statusBadge(c.status)}
            </a>
          ))}
        </TabsContent>

        {/* SLA Rules tab */}
        <TabsContent value="rules" className="mt-4 space-y-3">
          {slaRules.filter((r) => r.status === "approved").length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No approved SLA rules yet</p>
          )}
          {slaRules
            .filter((r) => r.status === "approved")
            .map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between pt-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium">{r.metric_name}</span>
                      {r.contract_section && (
                        <Badge variant="outline" className="text-[10px]">§{r.contract_section}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Threshold: {r.threshold_hours ?? "—"} {r.threshold_unit}
                      {r.penalty_type && ` · Penalty: ${r.penalty_type} ${r.penalty_value ?? ""}`}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-0">Active</Badge>
                </CardContent>
              </Card>
            ))}
        </TabsContent>

        {/* Breaches tab */}
        <TabsContent value="breaches" className="mt-4 space-y-3">
          {breaches.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No breaches in last 90 days</p>
          )}
          {breaches.map((b) => (
            <a
              key={b.id}
              href={`/breaches/${b.id}`}
              className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div>
                <p className="text-sm font-medium">{b.metric_name || "SLA Breach"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(b.breached_at).toLocaleDateString("en-IN")} · Delay: {b.delay_hours?.toFixed(1)}h
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">₹{Number(b.penalty_amount).toLocaleString("en-IN")}</span>
                {disputeBadge(b.dispute_status)}
              </div>
            </a>
          ))}
        </TabsContent>

        {/* Audit tab */}
        <TabsContent value="activity" className="mt-4 space-y-3">
          {auditEntries.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No recent activity</p>
          )}
          {auditEntries.slice(0, 15).map((e) => (
            <div key={e.id} className="flex items-start gap-3 rounded-lg border p-3">
              <Activity className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{e.reasoning || e.status}</p>
                <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("en-IN")}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
