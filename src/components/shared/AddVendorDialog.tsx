"use client"

import { useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { VendorAPI } from "@/lib/api"
import { toast } from "sonner"

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
  const [name, setName] = useState("")
  const [industry, setIndustry] = useState("")
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [owner, setOwner] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!name || !industry || !contactName || !contactEmail || !owner) return
    setLoading(true)
    await VendorAPI.create({
      name,
      industry,
      contactName,
      contactEmail,
      relationshipOwner: owner,
    })
    toast.success(`${name} added as a vendor`)
    setLoading(false)
    onOpenChange(false)
    setName("")
    setIndustry("")
    setContactName("")
    setContactEmail("")
    setOwner("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add vendor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !name || !industry}>
            {loading ? "Adding..." : "Add vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
