"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Upload, FileText, X } from "lucide-react"
import { useDropzone } from "react-dropzone"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { useDataStore } from "@/lib/store"
import { ContractAPI } from "@/lib/api"
import { toast } from "sonner"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UploadContractDialog({ open, onOpenChange }: Props) {
  const router = useRouter()
  const vendors = useDataStore((s) => s.vendors)
  const [vendorId, setVendorId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: (accepted) => {
      if (accepted.length > 0) setFile(accepted[0])
    },
  })

  const handleSubmit = async () => {
    if (!vendorId || !file) return
    setLoading(true)
    const contract = await ContractAPI.upload(vendorId, file)
    toast.success("Contract uploaded. Extracting SLAs...")
    setLoading(false)
    onOpenChange(false)
    setFile(null)
    setVendorId("")
    router.push(`/contracts/${contract.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload contract</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Step 1: Select vendor */}
          <div className="space-y-2">
            <Label>Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger>
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step 2: Drop zone */}
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
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFile(null)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {isDragActive ? "Drop file here" : "Drag & drop PDF"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    or click to browse
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !vendorId || !file}>
            {loading ? "Uploading..." : "Upload & extract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
