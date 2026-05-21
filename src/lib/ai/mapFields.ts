import { delay } from "@/lib/utils/delay"

const knownMappings: Record<string, string> = {
  tracking_id: "externalId",
  awb_no: "externalId",
  shipment_id: "externalId",
  order_ref: "externalId",
  dispatch_time: "shippedAt",
  pickup_ts: "shippedAt",
  pickupdate: "shippedAt",
  collection_ts: "shippedAt",
  delivery_time: "deliveredAt",
  deliverydate: "deliveredAt",
  delivered_ts: "deliveredAt",
  promise_date: "deadlineAt",
  expected_delivery: "deadlineAt",
  deadline: "deadlineAt",
  sla_deadline: "deadlineAt",
  order_amt: "orderValue",
  invoice_value: "orderValue",
  cod_amount: "orderValue",
  billed_amt: "orderValue",
  destination_city: "destination",
  city: "destination",
  dest_city: "destination",
  delivery_city: "destination",
}

export async function suggestFieldMapping(
  columns: string[],
  _sample: Record<string, string>[]
): Promise<Record<string, string>> {
  console.log("[MOCK AI] suggestFieldMapping", { columns })

  await delay(1500)

  const mapping: Record<string, string> = {}
  for (const col of columns) {
    const lower = col.toLowerCase().replace(/[^a-z0-9_]/g, "")
    mapping[col] = knownMappings[lower] ?? ""
  }

  console.log("[MOCK AI] suggestFieldMapping →", mapping)
  return mapping
}
