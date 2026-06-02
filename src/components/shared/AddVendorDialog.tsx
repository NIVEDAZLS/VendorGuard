"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Upload, FileText, X, Plus } from "lucide-react"
import { useDropzone } from "react-dropzone"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { VendorAPI, ContractAPI } from "@/lib/api"
import { toast } from "sonner"
import type { Vendor } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const industries = [
  "Logistics",
  "SaaS/Tech",
  "Manufacturing",
  "BFSI",
  "Power",
  "Other",
]

export function AddVendorDialog({ open, onOpenChange }: Props) {
  const router = useRouter()

  // mode: "existing" = pick a vendor and upload contract only
  //       "new"      = create vendor + upload contract
  const [mode, setMode] = useState<"existing" | "new">("existing")

  // existing vendor flow
  const [existingVendors, setExistingVendors] = useState<Vendor[]>([])
  const [selectedVendorId, setSelectedVendorId] = useState("")

  // new vendor flow
  const [name, setName] = useState("")
  const [industry, setIndustry] = useState("")
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [owner, setOwner] = useState("")

  const [contractFile, setContractFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      VendorAPI.list().then(setExistingVendors).catch(() => setExistingVendors([]))
    }
  }, [open])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: (accepted) => {
      if (accepted.length > 0) setContractFile(accepted[0])
    },
  })

  const reset = () => {
    setMode("existing")
    setSelectedVendorId("")
    setName("")
    setIndustry("")
    setContactName("")
    setContactEmail("")
    setOwner("")
    setContractFile(null)
  }

  const handleClose = (o: boolean) => {
    onOpenChange(o)
    if (!o) reset()
  }

  const canSubmit = () => {
    if (!contractFile) return false
    if (mode === "existing") return !!selectedVendorId
    return !!(name && industry && contactName && contactEmail && owner)
  }

  const handleSubmit = async () => {
    if (!canSubmit()) return
    setLoading(true)
    try {
      let vendorId: string

      if (mode === "existing") {
        vendorId = selectedVendorId
      } else {
        const vendor = await VendorAPI.create({
          name,
          industry,
          contactName,
          contactEmail,
          relationshipOwner: owner,
        })
        vendorId = vendor.id
      }

      const contract = await ContractAPI.upload(vendorId, contractFile!)
      const vendorName = mode === "existing"
        ? (existingVendors.find(v => v.id === vendorId)?.name ?? "Vendor")
        : name
      toast.success(`Contract uploaded for ${vendorName}`)
      handleClose(false)
      router.push(`/contracts/${contract.id}`)
    } catch (err) {
      toast.error("Something went wrong. Check the backend is running.")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload contract</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg border overflow-hidden">
            <button
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === "existing"
                  ? "bg-emerald-600 text-white"
                  : "bg-background text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setMode("existing")}
            >
              Existing vendor
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === "new"
                  ? "bg-emerald-600 text-white"
                  : "bg-background text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setMode("new")}
            >
              <Plus className="inline h-3.5 w-3.5 mr-1" />
              New vendor
            </button>
          </div>

          {/* Existing vendor: just pick from dropdown */}
          {mode === "existing" && (
            <div className="space-y-2">
              <Label>Select vendor</Label>
              {existingVendors.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No vendors yet —{" "}
                  <button
                    className="underline text-emerald-600"
                    onClick={() => setMode("new")}
                  >
                    create one first
                  </button>
                </p>
              ) : (
                <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a vendor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingVendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                        <span className="ml-2 text-xs text-muted-foreground">{v.industry}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* New vendor: full form */}
          {mode === "new" && (
            <>
              <div className="space-y-2">
                <Label>Vendor name</Label>
                <Input
                  placeholder="e.g. Bluedart Express"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {industries.map((ind) => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Contact name</Label>
                <Input
                  placeholder="e.g. Ravi Shastri"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact email</Label>
                <Input
                  type="email"
                  placeholder="e.g. ops@example.in"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Relationship owner</Label>
                <Input
                  placeholder="e.g. Priya Mehta"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                />
              </div>
            </>
          )}

          <Separator />

          {/* PDF drop zone — always shown */}
          <div className="space-y-2">
            <Label>
              Contract PDF <span className="text-destructive">*</span>
            </Label>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !canSubmit()}>
            {loading
              ? "Uploading…"
              : mode === "existing"
              ? "Upload contract"
              : "Create vendor & upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
