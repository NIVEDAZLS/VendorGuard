"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Zap,
  Plus,
  MessageSquare,
  RotateCcw,
  Timer,
} from "lucide-react"
import { useDemoStore } from "@/lib/store/useDemoStore"
import { useDataStore } from "@/lib/store"
import { tick } from "@/lib/engine/rulesEngine"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { SimulateResponseDialog } from "@/components/shared/SimulateResponseDialog"

export function DemoControlsSheet() {
  const accelerationEnabled = useDemoStore((s) => s.accelerationEnabled)
  const setAcceleration = useDemoStore((s) => s.setAcceleration)
  const resetDemo = useDemoStore((s) => s.reset)
  const [simTime, setSimTime] = useState("")
  const [realTime, setRealTime] = useState("")
  const [ticking, setTicking] = useState(false)

  // Inject event form
  const [injectOpen, setInjectOpen] = useState(false)
  const [injectVendor, setInjectVendor] = useState("")
  const [injectDeadlineHrs, setInjectDeadlineHrs] = useState("48")

  // Trigger vendor response
  const [responseOpen, setResponseOpen] = useState(false)
  const [selectedAtRisk, setSelectedAtRisk] = useState("")

  // Reset confirmation
  const [resetOpen, setResetOpen] = useState(false)

  const atRiskItems = useDataStore((s) => s.atRiskItems.filter((a) => a.status === "pending"))
  const vendors = useDataStore((s) => s.vendors)
  const dataSources = useDataStore((s) => s.dataSources)
  const addEvent = useDataStore((s) => s.addEvent)
  const operationalEvents = useDataStore((s) => s.operationalEvents)

  // Update simulated time display
  useEffect(() => {
    const interval = setInterval(() => {
      const now = useDemoStore.getState().now()
      setSimTime(new Date(now).toLocaleTimeString("en-IN"))
      setRealTime(new Date().toLocaleTimeString("en-IN"))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Auto tick when acceleration is on
  useEffect(() => {
    if (!accelerationEnabled) {
      setTicking(false)
      return
    }
    setTicking(true)
    const interval = setInterval(async () => {
      await tick()
    }, 5000)
    return () => {
      clearInterval(interval)
      setTicking(false)
    }
  }, [accelerationEnabled])

  const handleManualTick = useCallback(async () => {
    setTicking(true)
    await tick()
    toast.success("Rules engine evaluated")
    setTimeout(() => setTicking(false), 1000)
  }, [])

  const handleInjectEvent = () => {
    if (!injectVendor) {
      toast.error("Select a vendor")
      return
    }
    const hours = Number(injectDeadlineHrs) || 48
    const now = new Date(useDemoStore.getState().now())
    const shippedAt = now.toISOString()
    const deadlineAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString()
    const source = dataSources.find((ds) => ds.vendorId === injectVendor)
    const vendorPrefix =
      vendors.find((v) => v.id === injectVendor)?.name.slice(0, 2).toUpperCase() ?? "XX"

    const newEvent = {
      id: `evt-${String(operationalEvents.length + 1).padStart(4, "0")}`,
      vendorId: injectVendor,
      sourceId: source?.id ?? "ds-001",
      externalId: `${vendorPrefix}-${String(10000 + Math.floor(Math.random() * 90000))}`,
      eventType: "delivery",
      shippedAt,
      deliveredAt: null,
      deadlineAt,
      orderValue: Math.round(20000 + Math.random() * 280000),
      destination: ["Mumbai, Maharashtra", "Delhi, Delhi", "Bengaluru, Karnataka", "Chennai, Tamil Nadu", "Pune, Maharashtra"][Math.floor(Math.random() * 5)],
      status: "in_transit" as const,
    }

    addEvent(newEvent)
    toast.success(`Order ${newEvent.externalId} created — ${hours}h deadline`)
    setInjectOpen(false)
    setInjectVendor("")
    setInjectDeadlineHrs("48")
  }

  const handleReset = () => {
    useDataStore.getState().reset()
    resetDemo()
    toast.success("Demo data reset")
    setResetOpen(false)
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          Demo Controls
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Demo Controls</SheetTitle>
          <SheetDescription>
            Simulate time, inject events, and trigger system behavior for live
            demonstrations.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Time display */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Simulated time</span>
              <span className="font-mono font-medium">{simTime || "—"}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Real time</span>
              <span className="font-mono font-medium">{realTime || "—"}</span>
            </div>
          </div>

          {/* Time acceleration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="accel" className="text-sm font-medium">
                  Time acceleration
                </Label>
              </div>
              <Switch
                id="accel"
                checked={accelerationEnabled}
                onCheckedChange={setAcceleration}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, 1 second = 1 hour. At-risk and breach detection run
              automatically every 5 seconds.
            </p>
          </div>

          <Separator />

          {/* Manual tick */}
          <div className="space-y-2">
            <Button
              className="w-full"
              size="sm"
              variant="secondary"
              onClick={handleManualTick}
              disabled={ticking}
            >
              <Zap className={`mr-1.5 h-4 w-4 ${ticking ? "animate-pulse" : ""}`} />
              {ticking ? "Evaluating..." : "Simulate background tick"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Manually evaluate all in-transit events. Creates at-risk items and
              breaches based on current simulated time.
            </p>
          </div>

          <Separator />

          {/* Inject new event */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Inject new event</h3>
            </div>
            <Dialog open={injectOpen} onOpenChange={setInjectOpen}>
              <DialogTrigger asChild>
                <Button className="w-full" size="sm" variant="outline">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New fake order
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Inject new order</DialogTitle>
                  <DialogDescription>
                    Create a new order that enters the in-transit pipeline and
                    will be evaluated by the rules engine.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Vendor</Label>
                    <Select value={injectVendor} onValueChange={setInjectVendor}>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Deadline (hours from now)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={168}
                      value={injectDeadlineHrs}
                      onChange={(e) => setInjectDeadlineHrs(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setInjectOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleInjectEvent}>Create Order</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <p className="text-xs text-muted-foreground">
              Creates a shipment with shipped_at = now and configurable deadline
              to trigger a fresh at-risk → breach lifecycle.
            </p>
          </div>

          <Separator />

          {/* Trigger vendor response */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Trigger vendor response</h3>
            </div>
            {atRiskItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No pending at-risk items available.
              </p>
            ) : (
              <div className="space-y-2">
                <Select value={selectedAtRisk} onValueChange={setSelectedAtRisk}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select at-risk item" />
                  </SelectTrigger>
                  <SelectContent>
                    {atRiskItems.map((a) => {
                      const event = useDataStore
                        .getState()
                        .operationalEvents.find((e) => e.id === a.eventId)
                      return (
                        <SelectItem key={a.id} value={a.id}>
                          {event?.externalId ?? a.id} — {Math.round(a.hoursRemaining)}h left
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <Dialog open={responseOpen} onOpenChange={setResponseOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full" size="sm" variant="outline" disabled={!selectedAtRisk}>
                      <MessageSquare className="mr-1.5 h-4 w-4" />
                      Simulate response
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Simulate Vendor Response</DialogTitle>
                      <DialogDescription>
                        Trigger a vendor response for the selected at-risk item.
                      </DialogDescription>
                    </DialogHeader>
                    <SimulateInline
                      atRiskId={selectedAtRisk}
                      onDone={() => setResponseOpen(false)}
                    />
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>

          <Separator />

          {/* Reset */}
          <div className="space-y-2">
            <Dialog open={resetOpen} onOpenChange={setResetOpen}>
              <DialogTrigger asChild>
                <Button className="w-full" size="sm" variant="destructive">
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Reset demo data
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset all demo data?</DialogTitle>
                  <DialogDescription>
                    This will wipe localStorage, reload seed data, and reset all
                    progress. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setResetOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleReset}>
                    Reset Everything
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <p className="text-xs text-muted-foreground">
              Wipes all data and restores the initial seed state.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Inline simulate response for dialog
function SimulateInline({
  atRiskId,
  onDone,
}: {
  atRiskId: string
  onDone: () => void
}) {
  const atRiskItem = useDataStore((s) => s.atRiskItems.find((a) => a.id === atRiskId))
  const slaRules = useDataStore((s) => s.slaRules)
  const rule = atRiskItem ? slaRules.find((r) => r.id === atRiskItem.ruleId) : undefined

  const handleResult = (result: {
    matchesException: boolean
    clauseId?: string
    clauseText?: string
    reasoning: string
    confidence: number
    responseText: string
  }) => {
    const store = useDataStore.getState()
    store.updateAtRiskItem(atRiskId, {
      status: result.matchesException ? "exempted" : "breached",
    })
    store.addAuditEntry({
      id: `aud-${Date.now()}`,
      entityType: "response",
      entityId: atRiskId,
      action: "response.classified",
      actor: "ai",
      payload: { matchesException: result.matchesException, confidence: result.confidence },
      timestamp: new Date().toISOString(),
    })
    toast.success(
      result.matchesException
        ? "Exception accepted — vendor exempted"
        : "No exception — breach confirmed"
    )
    onDone()
  }

  if (!atRiskItem) {
    return <p className="text-sm text-muted-foreground">Item not found.</p>
  }

  return (
    <SimulateResponseDialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onDone()
      }}
      ruleExceptions={rule?.exceptions.map((e) => e.condition) ?? []}
      onResult={handleResult}
    />
  )
}

function Separator() {
  return <div className="h-px bg-border" />
}
