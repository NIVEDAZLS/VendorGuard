"use client"

import { useState, useEffect } from "react"
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
  onUploaded?: () => void
}

const industries = ["Logistics", "SaaS/Tech", "Manufacturing", "BFSI", "Power", "Other"]

export function UploadContractDialog({ open, onOpenChange, onUploaded }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorId, setVendorId] = useState("")
  const [creatingNew, setCreatingNew] = useState(false)

  // new vendor fields
  const [newName, setNewName] = useState("")
  const [newIndustry, setNewIndustry] = useState("")
  const [newContactName, setNewContactName] = useState("")
  const [newContactEmail, setNewContactEmail] = useState("")
  const [newOwner, setNewOwner] = useState("")

  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      VendorAPI.list()
        .then(setVendors)
        .catch(() => setVendors([]))
    }
  }, [open])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: (accepted) => {
      if (accepted.length > 0) setFile(accepted[0])
    },
  })

  const reset = () => {
    setVendorId("")
    setCreatingNew(false)
    setNewName("")
    setNewIndustry("")
    setNewContactName("")
    setNewContactEmail("")
    setNewOwner("")
    setFile(null)
  }

  const handleClose = (o: boolean) => {
    onOpenChange(o)
    if (!o) reset()
  }

  const newVendorValid = newName && newIndustry && newContactName && newContactEmail && newOwner
  const canSubmit = file && (creatingNew ? newVendorValid : vendorId)

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    try {
      let resolvedId = vendorId

      if (creatingNew) {
        const v = await VendorAPI.create({
          name: newName,
          industry: newIndustry,
          contactName: newContactName,
          contactEmail: newContactEmail,
          relationshipOwner: newOwner,
        })
        resolvedId = v.id
      }

      await ContractAPI.upload(resolvedId, file!)
      // Non-blocking: stay on contracts page, auto-refresh will show progress
      toast.success("Contract uploaded — AI extraction running in background. Check the list for progress.", {
        duration: 6000,
      })
      onUploaded?.()
      handleClose(false)
    } catch (err) {
      toast.error("Upload failed. Make sure the backend is running.")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload contract</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Vendor selector */}
          {!creatingNew && (
            <div className="space-y-2">
              <Label>Vendor</Label>
              {vendors.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">
                  No vendors yet.{" "}
                  <button
                    className="underline text-emerald-600"
                    onClick={() => setCreatingNew(true)}
                  >
                    Create one now
                  </button>
                </p>
              ) : (
                <div className="flex gap-2">
                  <Select value={vendorId} onValueChange={setVendorId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                          <span className="ml-2 text-xs text-muted-foreground">{v.industry}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Create new vendor"
                    onClick={() => setCreatingNew(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Inline new vendor form */}
          {creatingNew && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">New vendor details</p>
                {vendors.length > 0 && (
                  <button
                    className="text-xs text-muted-foreground underline"
                    onClick={() => setCreatingNew(false)}
                  >
                    Pick existing instead
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <Label>Vendor name</Label>
                <Input placeholder="e.g. FreshRoute Logistics" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Select value={newIndustry} onValueChange={setNewIndustry}>
                  <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                  <SelectContent>
                    {industries.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Contact name</Label>
                  <Input placeholder="e.g. Ravi Shastri" value={newContactName} onChange={e => setNewContactName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Contact email</Label>
                  <Input type="email" placeholder="ops@vendor.in" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Relationship owner</Label>
                <Input placeholder="e.g. Priya Mehta" value={newOwner} onChange={e => setNewOwner(e.target.value)} />
              </div>
            </div>
          )}

          <Separator />

          {/* PDF drop zone */}
          <div className="space-y-2">
            <Label>Contract file (PDF)</Label>
            <div
              {...getRootProps()}
              className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                isDragActive
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
            >
              <input {...getInputProps()} />
              {file ? (
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-emerald-500" />
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); setFile(null) }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">{isDragActive ? "Drop file here" : "Drag & drop PDF"}</p>
                  <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading || !canSubmit}>
            {loading ? "Uploading…" : creatingNew ? "Create vendor & upload" : "Upload & extract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
