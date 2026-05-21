import { delay } from "@/lib/utils/delay"

export async function composeVendorAlert(eventContext: {
  vendorName: string
  externalId: string
  destination: string
  deadlineAt: string
  orderValue: number
}): Promise<string> {
  console.log("[MOCK AI] composeVendorAlert", { eventContext })

  await delay(1500)

  const deadline = new Date(eventContext.deadlineAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })

  const body = `⚠️ SLA Alert — At-Risk Shipment

Vendor: ${eventContext.vendorName}
Order Ref: ${eventContext.externalId}
Destination: ${eventContext.destination}
Order Value: ₹${eventContext.orderValue.toLocaleString("en-IN")}
SLA Deadline: ${deadline}

This shipment is approaching its SLA deadline and is at risk of breaching the agreed delivery timeline. Please take immediate action to ensure on-time delivery.

If you anticipate a delay, please submit an exception request with supporting documentation at the earliest.

— VendorGuard AI Monitoring`

  return body
}
