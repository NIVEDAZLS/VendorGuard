import { subDays, subHours } from "date-fns"
import type {
  Vendor,
  Contract,
  SLARule,
  DataSource,
  OperationalEvent,
  AtRiskItem,
  VendorResponse,
  Breach,
  Claim,
  AuditEntry,
} from "@/lib/types"

const now = new Date()

function iso(d: Date) {
  return d.toISOString()
}

// ── Vendors ──────────────────────────────────────────────────────────────

export const vendors: Vendor[] = [
  {
    id: "v-001",
    name: "Bluedart Express",
    industry: "Logistics & Courier",
    contactEmail: "ops@bluedartexpress.in",
    contactName: "Ravi Shastri",
    relationshipOwner: "Priya Mehta",
    createdAt: iso(subDays(now, 180)),
  },
  {
    id: "v-002",
    name: "Delhivery Logistics",
    industry: "Third-party Logistics (3PL)",
    contactEmail: "logistics@delhivery.in",
    contactName: "Anika Verma",
    relationshipOwner: "Amit Khurana",
    createdAt: iso(subDays(now, 240)),
  },
  {
    id: "v-003",
    name: "Ecom Express",
    industry: "E-commerce Logistics",
    contactEmail: "support@ecomexpress.in",
    contactName: "Vikram Joshi",
    relationshipOwner: "Sneha Patel",
    createdAt: iso(subDays(now, 150)),
  },
  {
    id: "v-004",
    name: "FastTrack Couriers",
    industry: "Express Delivery",
    contactEmail: "info@fasttrackcouriers.in",
    contactName: "Deepak Nair",
    relationshipOwner: "Rahul Singh",
    createdAt: iso(subDays(now, 90)),
  },
]

// ── Contracts ────────────────────────────────────────────────────────────

export const contracts: Contract[] = [
  {
    id: "c-001",
    vendorId: "v-001",
    fileName: "Bluedart_SLA_Agreement_2026.pdf",
    status: "approved",
    uploadedAt: iso(subDays(now, 120)),
  },
  {
    id: "c-002",
    vendorId: "v-002",
    fileName: "Delhivery_Service_Level_Contract_2026.pdf",
    status: "approved",
    uploadedAt: iso(subDays(now, 200)),
  },
  {
    id: "c-003",
    vendorId: "v-003",
    fileName: "EcomExpress_Transport_Agreement_v3.pdf",
    status: "extracted",
    uploadedAt: iso(subDays(now, 60)),
  },
  {
    id: "c-004",
    vendorId: "v-004",
    fileName: "FastTrack_Courier_SLA_2026.pdf",
    status: "approved",
    uploadedAt: iso(subDays(now, 30)),
  },
]

// ── SLA Rules ────────────────────────────────────────────────────────────

export const slaRules: SLARule[] = [
  {
    id: "r-001",
    contractId: "c-001",
    metricType: "delivery_time",
    metricLabel: "Standard Delivery (≤500g)",
    threshold: { value: 48, unit: "hours" },
    penalty: { type: "percent", value: 5, basis: "order_value" },
    exceptions: [
      {
        condition: "Force majeure or extreme weather",
        modifiedThreshold: { value: 72, unit: "hours" },
      },
      {
        condition: "Customer-requested delayed delivery",
        modifiedThreshold: { value: 96, unit: "hours" },
      },
    ],
    rawClauseText:
      "Bluedart Express shall deliver all Standard parcels (≤500g) within 48 hours of pickup, subject to a penalty of 5% of order value for each day of delay beyond the agreed threshold.",
    rawClausePage: 3,
    status: "approved",
  },
  {
    id: "r-002",
    contractId: "c-001",
    metricType: "delivery_time",
    metricLabel: "Express Delivery (>500g)",
    threshold: { value: 24, unit: "hours" },
    penalty: { type: "percent", value: 8, basis: "order_value" },
    exceptions: [
      {
        condition: "Remote pin code delivery",
        modifiedThreshold: { value: 48, unit: "hours" },
      },
    ],
    rawClauseText:
      "Express packages exceeding 500g must be delivered within 24 hours of pickup. Penalty shall be 8% of order value per day overdue.",
    rawClausePage: 4,
    status: "approved",
  },
  {
    id: "r-003",
    contractId: "c-001",
    metricType: "quality",
    metricLabel: "Order Processing SLA",
    threshold: { value: 2, unit: "hours" },
    penalty: { type: "flat", value: 500, basis: "per_event" },
    exceptions: [],
    rawClauseText:
      "All orders must be processed and dispatched within 2 hours of manifest generation.",
    rawClausePage: 5,
    status: "approved",
  },
  {
    id: "r-004",
    contractId: "c-002",
    metricType: "delivery_time",
    metricLabel: "Standard Delivery",
    threshold: { value: 48, unit: "hours" },
    penalty: { type: "percent", value: 4, basis: "order_value" },
    exceptions: [
      {
        condition: "High-value orders (>₹2,00,000) require additional verification",
        modifiedThreshold: { value: 72, unit: "hours" },
      },
    ],
    rawClauseText:
      "Delhivery commits to standard delivery within 48 hours. For orders exceeding ₹2,00,000 in value, the delivery window extends to 72 hours to accommodate additional verification protocols.",
    rawClausePage: 2,
    status: "approved",
  },
  {
    id: "r-005",
    contractId: "c-002",
    metricType: "delivery_time",
    metricLabel: "High-Value Delivery (≥₹2L)",
    threshold: { value: 72, unit: "hours" },
    penalty: { type: "percent", value: 6, basis: "order_value" },
    exceptions: [
      {
        condition: "Customer unreachable after 3 attempts",
        modifiedThreshold: { value: 120, unit: "hours" },
      },
    ],
    rawClauseText:
      "High-value shipments (≥₹2,00,000) shall be delivered within 72 hours. Failure attracts a 6% penalty per day of delay. If customer is unreachable after 3 delivery attempts, the timeline extends to 120 hours.",
    rawClausePage: 3,
    status: "approved",
  },
  {
    id: "r-006",
    contractId: "c-002",
    metricType: "response_time",
    metricLabel: "Customer Query Response",
    threshold: { value: 4, unit: "hours" },
    penalty: { type: "flat", value: 1000, basis: "per_query" },
    exceptions: [
      {
        condition: "Public holiday or weekend",
        modifiedThreshold: { value: 12, unit: "hours" },
      },
    ],
    rawClauseText:
      "Delhivery shall respond to all logistics-related queries within 4 business hours. Penalty of ₹1,000 per query for each 4-hour block of delay.",
    rawClausePage: 6,
    status: "approved",
  },
  {
    id: "r-007",
    contractId: "c-003",
    metricType: "delivery_time",
    metricLabel: "Metro City Delivery",
    threshold: { value: 24, unit: "hours" },
    penalty: { type: "percent", value: 10, basis: "order_value" },
    exceptions: [
      {
        condition: "Government-declared holiday",
        modifiedThreshold: { value: 48, unit: "hours" },
      },
    ],
    rawClauseText:
      "Ecom Express guarantees 24-hour delivery within major metro cities. 10% penalty of order value per day overdue applies.",
    rawClausePage: 2,
    status: "draft",
  },
  {
    id: "r-008",
    contractId: "c-003",
    metricType: "delivery_time",
    metricLabel: "Non-Metro Delivery",
    threshold: { value: 72, unit: "hours" },
    penalty: { type: "percent", value: 7, basis: "order_value" },
    exceptions: [],
    rawClauseText:
      "Non-metro deliveries shall be completed within 72 hours. Penalty of 7% of order value per day of delay.",
    rawClausePage: 3,
    status: "draft",
  },
  {
    id: "r-009",
    contractId: "c-004",
    metricType: "delivery_time",
    metricLabel: "Same-Day Delivery",
    threshold: { value: 12, unit: "hours" },
    penalty: { type: "percent", value: 15, basis: "order_value" },
    exceptions: [
      {
        condition: "Order placed after 2 PM local time",
        modifiedThreshold: { value: 24, unit: "hours" },
      },
    ],
    rawClauseText:
      "FastTrack Couriers offers same-day delivery within 12 hours for orders placed before 2 PM. Delayed deliveries incur a 15% penalty per day.",
    rawClausePage: 2,
    status: "approved",
  },
  {
    id: "r-010",
    contractId: "c-004",
    metricType: "uptime",
    metricLabel: "Tracking System Uptime",
    threshold: { value: 99.5, unit: "percent" },
    penalty: { type: "percent", value: 5, basis: "monthly_fee" },
    exceptions: [
      {
        condition: "Planned maintenance with 48h notice",
        modifiedThreshold: { value: 97, unit: "percent" },
      },
    ],
    rawClauseText:
      "FastTrack shall maintain a real-time tracking system with at least 99.5% uptime. Failure results in a 5% penalty on the monthly service fee.",
    rawClausePage: 7,
    status: "approved",
  },
]

// ── Data Sources ─────────────────────────────────────────────────────────

export const dataSources: DataSource[] = [
  {
    id: "ds-001",
    vendorId: "v-001",
    type: "csv",
    name: "Bluedart_Operations_Feed",
    fieldMapping: {
      tracking_id: "externalId",
      dispatch_time: "shippedAt",
      delivery_time: "deliveredAt",
      promise_date: "deadlineAt",
      order_amt: "orderValue",
      destination_city: "destination",
    },
    lastIngestedAt: iso(subHours(now, 2)),
  },
  {
    id: "ds-002",
    vendorId: "v-002",
    type: "csv",
    name: "Delhivery_Daily_Log",
    fieldMapping: {
      awb_no: "externalId",
      pickup_ts: "shippedAt",
      delivered_ts: "deliveredAt",
      expected_delivery: "deadlineAt",
      invoice_value: "orderValue",
      city: "destination",
    },
    lastIngestedAt: iso(subHours(now, 6)),
  },
  {
    id: "ds-003",
    vendorId: "v-003",
    type: "csv",
    name: "EcomExpress_Shipments",
    fieldMapping: {
      shipment_id: "externalId",
      pickupdate: "shippedAt",
      deliverydate: "deliveredAt",
      deadline: "deadlineAt",
      cod_amount: "orderValue",
      dest_city: "destination",
    },
    lastIngestedAt: iso(subDays(now, 1)),
  },
  {
    id: "ds-004",
    vendorId: "v-004",
    type: "csv",
    name: "FastTrack_Orders",
    fieldMapping: {
      order_ref: "externalId",
      collection_ts: "shippedAt",
      delivered_ts: "deliveredAt",
      sla_deadline: "deadlineAt",
      billed_amt: "orderValue",
      delivery_city: "destination",
    },
    lastIngestedAt: iso(subHours(now, 4)),
  },
]

// ── Indian Cities Pool ───────────────────────────────────────────────────

const cities = [
  "Mumbai, Maharashtra",
  "Delhi, Delhi",
  "Bengaluru, Karnataka",
  "Hyderabad, Telangana",
  "Ahmedabad, Gujarat",
  "Chennai, Tamil Nadu",
  "Kolkata, West Bengal",
  "Pune, Maharashtra",
  "Jaipur, Rajasthan",
  "Lucknow, Uttar Pradesh",
  "Chandigarh, Punjab",
  "Bhopal, Madhya Pradesh",
  "Patna, Bihar",
  "Indore, Madhya Pradesh",
  "Vadodara, Gujarat",
  "Nagpur, Maharashtra",
  "Thiruvananthapuram, Kerala",
  "Guwahati, Assam",
  "Bhubaneswar, Odisha",
  "Ranchi, Jharkhand",
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// ── Generate Operational Events ──────────────────────────────────────────

interface EventSeed {
  vendorId: string
  sourceId: string
  prefix: string
  orderValueRange: [number, number]
}

const eventSeeds: EventSeed[] = [
  { vendorId: "v-001", sourceId: "ds-001", prefix: "BD", orderValueRange: [15000, 350000] },
  { vendorId: "v-002", sourceId: "ds-002", prefix: "DH", orderValueRange: [25000, 450000] },
  { vendorId: "v-003", sourceId: "ds-003", prefix: "EC", orderValueRange: [18000, 280000] },
  { vendorId: "v-004", sourceId: "ds-004", prefix: "FT", orderValueRange: [12000, 150000] },
]

function buildEvents(): OperationalEvent[] {
  const events: OperationalEvent[] = []

  // Rough distribution: 65% compliant, 15% in_transit, 12% breached, 8% exempted
  // Let's build ~150 total

  const statusDistribution = (
    count: number,
    _seed: EventSeed,
    _start: number
  ): Array<{
    status: OperationalEvent["status"]
    shippedOffsetDays: number
    deliveredHours?: number
    deadlineHours: number
  }> => {
    const result: Array<{
      status: OperationalEvent["status"]
      shippedOffsetDays: number
      deliveredHours?: number
      deadlineHours: number
    }> = []

    const compliants = Math.round(count * 0.65)
    const inTransits = Math.round(count * 0.15)
    const breacheds = Math.round(count * 0.12)
    const exempteds = count - compliants - inTransits - breacheds

    // Compliant — delivered before deadline
    for (let i = 0; i < compliants; i++) {
      const shippedOffset = randInRange(3, 60)
      const deadlineHours = pick([24, 48, 72])
      const deliveredHours = deadlineHours - randInRange(1, Math.min(deadlineHours - 1, 10))
      result.push({
        status: "compliant",
        shippedOffsetDays: shippedOffset,
        deliveredHours,
        deadlineHours,
      })
    }

    // In-transit — shipped recently, no deliveredAt
    for (let i = 0; i < inTransits; i++) {
      const shippedOffset = randInRange(0, 2)
      const deadlineHours = pick([24, 48, 72])
      result.push({
        status: "in_transit",
        shippedOffsetDays: shippedOffset,
        deadlineHours,
      })
    }

    // Breached — delivered after deadline
    for (let i = 0; i < breacheds; i++) {
      const shippedOffset = randInRange(5, 45)
      const deadlineHours = pick([24, 48, 72])
      const deliveredHours = deadlineHours + randInRange(4, 72)
      result.push({
        status: "breached",
        shippedOffsetDays: shippedOffset,
        deliveredHours,
        deadlineHours,
      })
    }

    // Exempted
    for (let i = 0; i < exempteds; i++) {
      const shippedOffset = randInRange(4, 30)
      const deadlineHours = pick([24, 48, 72])
      const deliveredHours = deadlineHours + randInRange(2, 48)
      result.push({
        status: "exempted",
        shippedOffsetDays: shippedOffset,
        deliveredHours,
        deadlineHours,
      })
    }

    // Shuffle
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }

    return result
  }

  let eventIndex = 0

  for (const seed of eventSeeds) {
    // ~37-38 events per vendor
    const count = seed.vendorId === "v-004" ? 36 : 38
    const specs = statusDistribution(count, seed, eventIndex)

    for (const spec of specs) {
      eventIndex++
      const id = `evt-${String(eventIndex).padStart(4, "0")}`
      const shippedAt = subDays(now, spec.shippedOffsetDays)
      // Set deadline as hours after shipped
      const deadlineDate = new Date(shippedAt.getTime() + spec.deadlineHours * 60 * 60 * 1000)

      let deliveredAt: Date | null = null
      let eventStatus = spec.status

      if (spec.deliveredHours !== undefined) {
        deliveredAt = new Date(shippedAt.getTime() + spec.deliveredHours * 60 * 60 * 1000)
        if (deliveredAt > deadlineDate) {
          // It's breached or exempted based on spec
        }
      }

      // For in_transit, we also set some as "at_risk" if they're close to deadline
      if (eventStatus === "in_transit") {
        const nowMs = now.getTime()
        const deadlineMs = deadlineDate.getTime()
        const hoursLeft = (deadlineMs - nowMs) / (1000 * 60 * 60)
        if (hoursLeft < 6 && hoursLeft > 0) {
          eventStatus = "at_risk"
        }
      }

      events.push({
        id,
        vendorId: seed.vendorId,
        sourceId: seed.sourceId,
        externalId: `${seed.prefix}-${String(randInRange(10000, 99999))}`,
        eventType: "delivery",
        shippedAt: shippedAt.toISOString(),
        deliveredAt: deliveredAt?.toISOString() ?? null,
        deadlineAt: deadlineDate.toISOString(),
        orderValue: randInRange(seed.orderValueRange[0], seed.orderValueRange[1]),
        destination: pick(cities),
        status: eventStatus,
      })
    }
  }

  return events
}

// Build once at module level so IDs are stable
export const operationalEvents: OperationalEvent[] = buildEvents()

// ── At-Risk Items ────────────────────────────────────────────────────────

export const atRiskItems: AtRiskItem[] = operationalEvents
  .filter((e) => e.status === "at_risk" || e.status === "exempted" || e.status === "breached")
  .map((e, i) => {
    const rulePool = slaRules.filter((r) => r.contractId === contracts.find((c) => c.vendorId === e.vendorId)?.id)
    const rule = rulePool.length > 0 ? rulePool[0] : slaRules[0]
    const shippedDate = new Date(e.shippedAt)
    const deadlineDate = new Date(e.deadlineAt)
    const totalWindow = (deadlineDate.getTime() - shippedDate.getTime()) / (1000 * 60 * 60)
    const elapsed = (now.getTime() - shippedDate.getTime()) / (1000 * 60 * 60)
    const hoursRemaining = Math.max(0, totalWindow - elapsed)
    const riskScore = e.status === "breached" ? 95 : e.status === "at_risk" ? randInRange(60, 85) : randInRange(30, 55)

    return {
      id: `ari-${String(i + 1).padStart(3, "0")}`,
      ruleId: rule.id,
      eventId: e.id,
      riskScore,
      hoursRemaining,
      alertSentAt: iso(subHours(now, randInRange(1, 24))),
      vendorResponseId: e.status === "exempted" ? `vr-${String(i + 1).padStart(3, "0")}` : null,
      status: e.status === "breached" ? "breached" : e.status === "exempted" ? "exempted" : "pending",
    } as AtRiskItem
  })

// ── Vendor Responses ─────────────────────────────────────────────────────

export const vendorResponses: VendorResponse[] = operationalEvents
  .filter((e) => e.status === "exempted")
  .map((e, i) => {
    const deliveredDate = e.deliveredAt ? new Date(e.deliveredAt) : new Date(e.deadlineAt)

    const responseTexts = [
      `Due to unprecedented heavy rainfall in ${e.destination.split(",")[0]}, our delivery routes were severely impacted. The local meteorological department issued a red alert on the date of scheduled delivery. We request an exemption under the force majeure clause. Supporting weather advisory PDF attached.`,
      `The customer at ${e.destination} was unreachable across 5 attempts on separate occasions. We called the registered mobile number and also attempted alternate contacts provided at the time of order booking. Delivery was finally completed after the customer called back. Kindly exempt per the customer-unreachable exception clause.`,
      `The shipment required address verification due to a recent pin code reorganization in ${e.destination}. Our team spent additional time with the local post office to confirm the correct delivery location. This was outside our control and falls under the address discrepancy exception.`,
      `Severe traffic disruption due to a political rally in ${e.destination.split(",")[0]} caused a 14-hour delay. The local administration had blocked all commercial vehicle movement for the day. Documentary evidence from the traffic police department is available for verification.`,
      `The delivery location was a remote village 40 km from the nearest hub. Our standard route optimization did not account for the last-mile road conditions. As per the remote pin code exception clause, we request this delivery to be exempted from the standard penalty calculation.`,
    ]

    const responseText = responseTexts[i % responseTexts.length]
    const hasExceptionKeywords =
      responseText.includes("rainfall") ||
      responseText.includes("unreachable") ||
      responseText.includes("reorganization") ||
      responseText.includes("rally") ||
      responseText.includes("remote")

    return {
      id: `vr-${String(i + 1).padStart(3, "0")}`,
      atRiskItemId: `ari-${String(i + 1).padStart(3, "0")}`,
      responseText,
      receivedAt: iso(subHours(deliveredDate, randInRange(1, 12))),
      aiClassification: hasExceptionKeywords
        ? {
            matchesException: true,
            clauseId: "ex-001",
            clauseText: "Force majeure / Customer unreachable / Remote delivery exceptions",
            reasoning: `The vendor's response cites conditions (${responseText.includes("rainfall") ? "extreme weather" : responseText.includes("unreachable") ? "customer unreachable" : "operational exception"}) that match the contract's exception clauses. Confidence is high due to keyword alignment with clause conditions.`,
            confidence: parseFloat((0.78 + Math.random() * 0.18).toFixed(2)),
          }
        : null,
      finalDecision: hasExceptionKeywords ? "exempt" : undefined,
    }
  })

// ── Breaches ─────────────────────────────────────────────────────────────

export const breaches: Breach[] = operationalEvents
  .filter((e) => e.status === "breached")
  .map((e, i) => {
    const deadlineDate = new Date(e.deadlineAt)
    const deliveredDate = e.deliveredAt ? new Date(e.deliveredAt) : now
    const hoursOverdue = Math.round(
      (deliveredDate.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60)
    )
    const penaltyAmount = Math.round(e.orderValue * 0.05 * Math.ceil(hoursOverdue / 24))

    return {
      id: `br-${String(i + 1).padStart(3, "0")}`,
      ruleId:
        slaRules.find(
          (r) =>
            r.contractId ===
            contracts.find((c) => c.vendorId === e.vendorId)?.id
        )?.id ?? slaRules[0].id,
      eventId: e.id,
      breachedAt: deadlineDate.toISOString(),
      penaltyAmount,
      evidence: {
        shippedAt: e.shippedAt,
        deadlineAt: e.deadlineAt,
        deliveredAt: e.deliveredAt,
        hoursOverdue,
        contractClause: `Clause ${(i % 4) + 2}.${(i % 3) + 1} — Delivery Timeline`,
        orderValue: e.orderValue,
      },
      status: i === 0 ? "claim_sent" : i === 1 ? "claim_drafted" : "open",
    }
  })

// ── Claims ───────────────────────────────────────────────────────────────

export const claims: Claim[] = breaches
  .filter((b) => b.status === "claim_drafted" || b.status === "claim_sent")
  .map((b, i) => {
    const breachDate = new Date(b.breachedAt)
    const event = operationalEvents.find((e) => e.id === b.eventId)
    const vendor = vendors.find((v) => v.id === event?.vendorId)

    return {
      id: `cl-${String(i + 1).padStart(3, "0")}`,
      breachId: b.id,
      recipientEmail: vendor?.contactEmail ?? "vendor@example.com",
      cc: "",
      draftSubject: `SLA Penalty Claim — Breach Ref ${b.id} — Order ${event?.externalId ?? "Unknown"}`,
      draftBody: `Dear Vendor Partner,\n\nThis is to formally notify you of an SLA breach identified under our service agreement.\n\n` +
        `Breach Reference: ${b.id}\n` +
        `Order Number: ${event?.externalId ?? "N/A"}\n` +
        `Destination: ${event?.destination ?? "N/A"}\n` +
        `Order Value: ₹${b.evidence.orderValue.toLocaleString("en-IN")}\n` +
        `Scheduled Delivery: ${new Date(b.evidence.deadlineAt).toLocaleDateString("en-IN")}\n` +
        `Actual Delivery: ${b.evidence.deliveredAt ? new Date(b.evidence.deliveredAt).toLocaleDateString("en-IN") : "Not delivered"}\n` +
        `Hours Overdue: ${b.evidence.hoursOverdue}\n` +
        `Penalty Amount: ₹${b.penaltyAmount.toLocaleString("en-IN")}\n\n` +
        `Applicable Clause: ${b.evidence.contractClause}\n\n` +
        `Please remit the penalty amount within 15 business days. If you believe this breach qualifies for an exception under the contract, please submit supporting documentation within 5 business days.\n\nRegards,\nVendor Compliance Team\nVendorGuard`,
      draftTone: "firm",
      status: i === 0 ? "sent" : "draft",
      createdAt: iso(subDays(breachDate, -2)),
      updatedAt: iso(subDays(breachDate, -2)),
      sentAt: i === 0 ? iso(subDays(breachDate, randInRange(1, 3))) : null,
    }
  })

// ── Audit Entries ────────────────────────────────────────────────────────

export const auditEntries: AuditEntry[] = [
  {
    id: "aud-001",
    entityType: "contract",
    entityId: "c-001",
    action: "contract.uploaded",
    actor: "user",
    payload: { fileName: "Bluedart_SLA_Agreement_2026.pdf" },
    timestamp: iso(subDays(now, 120)),
  },
  {
    id: "aud-002",
    entityType: "contract",
    entityId: "c-001",
    action: "contract.extracted",
    actor: "ai",
    payload: { rulesFound: 3 },
    timestamp: iso(subDays(now, 119)),
  },
  {
    id: "aud-003",
    entityType: "contract",
    entityId: "c-001",
    action: "contract.approved",
    actor: "user",
    payload: { approvedBy: "Priya Mehta" },
    timestamp: iso(subDays(now, 118)),
  },
  {
    id: "aud-004",
    entityType: "vendor",
    entityId: "v-002",
    action: "datasource.ingested",
    actor: "system",
    payload: { sourceId: "ds-002", rowsIngested: 2450 },
    timestamp: iso(subHours(now, 6)),
  },
  {
    id: "aud-005",
    entityType: "event",
    entityId: "evt-0060",
    action: "breach.detected",
    actor: "system",
    payload: { breachId: "br-001", hoursOverdue: 14 },
    timestamp: iso(subDays(now, 5)),
  },
  {
    id: "aud-006",
    entityType: "breach",
    entityId: "br-001",
    action: "claim.drafted",
    actor: "ai",
    payload: { claimId: "cl-001" },
    timestamp: iso(subDays(now, 4)),
  },
  {
    id: "aud-007",
    entityType: "breach",
    entityId: "br-003",
    action: "breach.opened",
    actor: "system",
    payload: { hoursOverdue: 28, penaltyAmount: 8750 },
    timestamp: iso(subDays(now, 2)),
  },
  {
    id: "aud-008",
    entityType: "response",
    entityId: "vr-001",
    action: "response.classified",
    actor: "ai",
    payload: { matchesException: true, confidence: 0.92 },
    timestamp: iso(subDays(now, 10)),
  },
  {
    id: "aud-009",
    entityType: "claim",
    entityId: "cl-001",
    action: "claim.sent",
    actor: "user",
    payload: { recipientEmail: "ops@bluedartexpress.in" },
    timestamp: iso(subDays(now, 3)),
  },
  {
    id: "aud-010",
    entityType: "contract",
    entityId: "c-004",
    action: "contract.uploaded",
    actor: "user",
    payload: { fileName: "FastTrack_Courier_SLA_2026.pdf" },
    timestamp: iso(subDays(now, 30)),
  },
  {
    id: "aud-011",
    entityType: "datasource",
    entityId: "ds-004",
    action: "datasource.field_mapping_updated",
    actor: "user",
    payload: { previousMapping: {}, newMapping: { order_ref: "externalId" } },
    timestamp: iso(subDays(now, 25)),
  },
  {
    id: "aud-012",
    entityType: "event",
    entityId: "evt-0100",
    action: "event.exempted",
    actor: "user",
    payload: { atRiskItemId: "ari-010", reason: "Vendor response accepted" },
    timestamp: iso(subDays(now, 6)),
  },
]

// ── All-in-one seed function ─────────────────────────────────────────────

export interface SeedData {
  vendors: Vendor[]
  contracts: Contract[]
  slaRules: SLARule[]
  dataSources: DataSource[]
  operationalEvents: OperationalEvent[]
  atRiskItems: AtRiskItem[]
  vendorResponses: VendorResponse[]
  breaches: Breach[]
  claims: Claim[]
  auditEntries: AuditEntry[]
}

export function getSeedData(): SeedData {
  return {
    vendors,
    contracts,
    slaRules,
    dataSources,
    operationalEvents,
    atRiskItems,
    vendorResponses,
    breaches,
    claims,
    auditEntries,
  }
}
