"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Building2, FileText, AlertTriangle, IndianRupee } from "lucide-react"
import { PageHeader } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useDataStore } from "@/lib/store"
import { formatINR } from "@/lib/utils/format"
import { AddVendorDialog } from "@/components/shared/AddVendorDialog"

export default function VendorsPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { vendors, contracts, breaches, operationalEvents } = useDataStore()

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

  return (
    <div>
      <PageHeader
        title="Vendors"
        description="Manage your vendor relationships"
        actions={
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Add vendor
          </Button>
        }
      />

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

      <AddVendorDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
