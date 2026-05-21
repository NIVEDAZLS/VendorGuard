import { delay } from "@/lib/utils/delay"
import { useDataStore } from "@/lib/store"
import type { SLARule } from "@/lib/types"

export async function extractSLAs(
  contractId: string,
  _contractText: string
): Promise<SLARule[]> {
  console.log("[MOCK AI] extractSLAs", { contractId })

  // Simulate 2.5s extraction time
  await delay(2500)

  const store = useDataStore.getState()
  const contract = store.contracts.find((c) => c.id === contractId)
  if (!contract) return []

  // Return realistic extracted rules based on vendor
  const vendor = store.vendors.find((v) => v.id === contract.vendorId)
  const rules: SLARule[] = []

  if (vendor?.name.toLowerCase().includes("bluedart")) {
    rules.push({
      id: `r-ext-${Date.now()}-1`,
      contractId,
      metricType: "delivery_time",
      metricLabel: "Standard Parcel Delivery",
      threshold: { value: 48, unit: "hours" },
      penalty: { type: "percent", value: 5, basis: "order_value" },
      exceptions: [
        {
          condition: "Extreme weather conditions",
          modifiedThreshold: { value: 72, unit: "hours" },
        },
      ],
      rawClauseText:
        "Bluedart shall deliver all standard parcels within 48 hours of pickup...",
      rawClausePage: 3,
      status: "draft",
    })
    rules.push({
      id: `r-ext-${Date.now()}-2`,
      contractId,
      metricType: "delivery_time",
      metricLabel: "Express Delivery",
      threshold: { value: 24, unit: "hours" },
      penalty: { type: "percent", value: 8, basis: "order_value" },
      exceptions: [],
      rawClauseText:
        "Express deliveries must be completed within 24 hours. Penalty 8% per day.",
      rawClausePage: 4,
      status: "draft",
    })
  } else if (vendor?.name.toLowerCase().includes("delhivery")) {
    rules.push({
      id: `r-ext-${Date.now()}-1`,
      contractId,
      metricType: "delivery_time",
      metricLabel: "Standard Delivery",
      threshold: { value: 48, unit: "hours" },
      penalty: { type: "percent", value: 4, basis: "order_value" },
      exceptions: [
        {
          condition: "High-value orders >₹2L",
          modifiedThreshold: { value: 72, unit: "hours" },
        },
      ],
      rawClauseText:
        "Delhivery commits to standard delivery within 48 hours...",
      rawClausePage: 2,
      status: "draft",
    })
    rules.push({
      id: `r-ext-${Date.now()}-2`,
      contractId,
      metricType: "response_time",
      metricLabel: "Query Response Time",
      threshold: { value: 4, unit: "hours" },
      penalty: { type: "flat", value: 1000, basis: "per_query" },
      exceptions: [],
      rawClauseText:
        "All logistics queries shall be responded to within 4 business hours.",
      rawClausePage: 6,
      status: "draft",
    })
  } else {
    // Generic extracted rules for other vendors
    rules.push({
      id: `r-ext-${Date.now()}-1`,
      contractId,
      metricType: "delivery_time",
      metricLabel: "Standard Delivery",
      threshold: { value: 48, unit: "hours" },
      penalty: { type: "percent", value: 5, basis: "order_value" },
      exceptions: [],
      rawClauseText: "Standard delivery within 48 hours.",
      rawClausePage: 1,
      status: "draft",
    })
  }

  // Update contract status
  store.updateContract(contractId, { status: "extracted" })

  store.addAuditEntry({
    id: `aud-${Date.now()}`,
    entityType: "contract",
    entityId: contractId,
    action: "contract.extracted",
    actor: "ai",
    payload: { rulesFound: rules.length },
    timestamp: new Date().toISOString(),
  })

  return rules
}
