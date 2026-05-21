import { useDemoStore } from "@/lib/store/useDemoStore"
import { useDataStore } from "@/lib/store"
import { composeVendorAlert } from "@/lib/ai"
import type { AtRiskItem, Breach, OperationalEvent } from "@/lib/types"

export async function tick() {
  const now = useDemoStore.getState().now()
  const store = useDataStore.getState()
  const {
    operationalEvents,
    atRiskItems,
    breaches,
    slaRules,
    contracts,
    vendors,
    addAtRiskItem,
    addBreach,
    addAuditEntry,
    updateEvent,
    updateAtRiskItem,
  } = store

  for (const event of operationalEvents) {
    if (event.status !== "in_transit" && event.status !== "at_risk") continue

    const deadline = new Date(event.deadlineAt).getTime()
    const hoursRemaining = (deadline - now) / (1000 * 60 * 60)

    const existingAtRisk = atRiskItems.find(
      (a: AtRiskItem) => a.eventId === event.id && a.status === "pending"
    )
    const existingBreach = breaches.find(
      (b: Breach) => b.eventId === event.id
    )

    // Threshold 1: <= 12 hours remaining → at-risk
    if (
      hoursRemaining <= 12 &&
      hoursRemaining > 0 &&
      !existingAtRisk &&
      !existingBreach &&
      event.status === "in_transit"
    ) {
      const rulePool = slaRules.filter(
        (r) =>
          r.contractId ===
          contracts.find((c) => c.vendorId === event.vendorId)?.id
      )
      const rule = rulePool.length > 0 ? rulePool[0] : slaRules[0]

      const atRiskItem: AtRiskItem = {
        id: `ari-${String(atRiskItems.length + 1).padStart(3, "0")}`,
        ruleId: rule.id,
        eventId: event.id,
        riskScore: Math.min(95, Math.round((1 - hoursRemaining / 12) * 100)),
        hoursRemaining: Math.max(0, hoursRemaining),
        alertSentAt: new Date(now).toISOString(),
        vendorResponseId: null,
        status: "pending",
      }

      addAtRiskItem(atRiskItem)
      updateEvent(event.id, { status: "at_risk" as OperationalEvent["status"] })

      // Fire vendor alert
      const vendor = vendors.find((v) => v.id === event.vendorId)
      composeVendorAlert({
        vendorName: vendor?.name ?? "Unknown",
        externalId: event.externalId,
        destination: event.destination,
        deadlineAt: event.deadlineAt,
        orderValue: event.orderValue,
      }).then(() => {
        addAuditEntry({
          id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          entityType: "event",
          entityId: event.id,
          action: "alert.sent",
          actor: "ai",
          payload: { atRiskItemId: atRiskItem.id, hoursRemaining },
          timestamp: new Date(now).toISOString(),
        })
      })
    }

    // Threshold 2: <= 0 hours remaining → breach
    if (hoursRemaining <= 0 && !existingBreach) {
      const previousAtRisk = atRiskItems.find(
        (a: AtRiskItem) => a.eventId === event.id
      )
      if (previousAtRisk) {
        updateAtRiskItem(previousAtRisk.id, { status: "breached" })
      }

      const deliveredAt = event.deliveredAt ?? new Date(now).toISOString()
      const hoursOverdue = Math.round(
        (new Date(deliveredAt).getTime() - deadline) / (1000 * 60 * 60)
      )
      const penaltyAmount = Math.round(
        event.orderValue * 0.05 * Math.max(1, Math.ceil(hoursOverdue / 24))
      )

      const breach: Breach = {
        id: `br-${String(breaches.length + 1).padStart(3, "0")}`,
        ruleId: previousAtRisk?.ruleId ?? slaRules[0].id,
        eventId: event.id,
        breachedAt: new Date(deadline).toISOString(),
        penaltyAmount,
        evidence: {
          shippedAt: event.shippedAt,
          deadlineAt: event.deadlineAt,
          deliveredAt: event.deliveredAt,
          hoursOverdue,
          contractClause: `Clause ${(breaches.length % 4) + 2}.1 — Delivery Timeline`,
          orderValue: event.orderValue,
        },
        status: "open",
      }

      addBreach(breach)
      updateEvent(event.id, { status: "breached" as OperationalEvent["status"] })

      addAuditEntry({
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        entityType: "event",
        entityId: event.id,
        action: "breach.detected",
        actor: "system",
        payload: { breachId: breach.id, hoursOverdue, penaltyAmount },
        timestamp: new Date(now).toISOString(),
      })
    }
  }
}
