import { delay } from "@/lib/utils/delay"
import type { DraftTone } from "@/lib/types"

export async function draftClaimEmail(
  breachContext: {
    breachId: string
    vendorName: string
    contactName: string
    contactEmail: string
    orderValue: number
    penaltyAmount: number
    hoursOverdue: number
    contractClause: string
    externalId: string
    destination: string
    deadlineAt: string
    deliveredAt: string | null
  },
  tone: DraftTone = "firm"
): Promise<{ subject: string; body: string }> {
  console.log("[MOCK AI] draftClaimEmail", { breachContext, tone })

  await delay(3000)

  const deadline = new Date(breachContext.deadlineAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const delivered = breachContext.deliveredAt
    ? new Date(breachContext.deliveredAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not yet delivered"

  const toneIntros: Record<DraftTone, { subjectPrefix: string; greeting: string; closing: string; actionLine: string }> = {
    firm: {
      subjectPrefix: "URGENT: SLA Penalty Claim",
      greeting: "Dear",
      closing: "We look forward to your prompt resolution of this matter.",
      actionLine: `Please remit the penalty amount of ₹${breachContext.penaltyAmount.toLocaleString("en-IN")} within 15 business days from the date of this notice. Payment should be made via bank transfer to the account details below:

  Account Name: VendorGuard Compliance Escrow
  Bank: HDFC Bank Ltd.
  Account: 50200098765432
  IFSC: HDFC0001234
`,
    },
    diplomatic: {
      subjectPrefix: "SLA Breach Notification",
      greeting: "Dear",
      closing: "We value our partnership and trust this matter can be resolved amicably at the earliest.",
      actionLine: `We kindly request that the penalty amount of ₹${breachContext.penaltyAmount.toLocaleString("en-IN")} be remitted within 15 business days. Please find our bank details below for the transfer:

  Account Name: VendorGuard Compliance Escrow
  Bank: HDFC Bank Ltd.
  Account: 50200098765432
  IFSC: HDFC0001234

If there are any extenuating circumstances, we are happy to review supporting documentation and consider an exception on a case-by-case basis.
`,
    },
    urgent: {
      subjectPrefix: "IMMEDIATE ACTION REQUIRED: SLA Penalty Claim",
      greeting: "Dear",
      closing: "Immediate attention to this matter is required to avoid escalation.",
      actionLine: `This penalty amount of ₹${breachContext.penaltyAmount.toLocaleString("en-IN")} must be remitted within 5 business days. Payment should be made immediately via bank transfer:

  Account Name: VendorGuard Compliance Escrow
  Bank: HDFC Bank Ltd.
  Account: 50200098765432
  IFSC: HDFC0001234

Failure to remit within the stipulated timeline will result in escalation to our legal team and potential suspension of services.
`,
    },
  }

  const t = toneIntros[tone]

  const subject = `${t.subjectPrefix} — ${breachContext.vendorName} — ${breachContext.externalId}`

  const body = `${t.greeting} ${breachContext.contactName},

RE: ${t.subjectPrefix}
     Ref: ${breachContext.breachId}
     Order: ${breachContext.externalId}
     Destination: ${breachContext.destination}

This letter serves as formal notification that an SLA breach has been recorded against the above-referenced shipment, in accordance with the terms of our Service Level Agreement.

── Breach Details ────────────────────────

  Order Reference:     ${breachContext.externalId}
  Destination:         ${breachContext.destination}
  Order Value:         ₹${breachContext.orderValue.toLocaleString("en-IN")}
  Scheduled Delivery:  ${deadline}
  Actual Delivery:     ${delivered}
  Hours Overdue:       ${breachContext.hoursOverdue.toFixed(1)}
  Applicable Clause:   ${breachContext.contractClause}
  Penalty Amount:      ₹${breachContext.penaltyAmount.toLocaleString("en-IN")}

── Basis ─────────────────────────────────

Per ${breachContext.contractClause} of our agreement, a penalty of the stated amount is applicable for failure to meet the committed delivery timeline. The calculation is based on the applicable penalty rate applied to the order value for the duration of the delay.

── Required Action ───────────────────────

${t.actionLine}
If you believe this breach qualifies for an exception under the agreement (Force Majeure, Customer Unreachable, or other exempting conditions), please submit a formal exception request with supporting documentation within 5 business days. Upon review, if the exception is granted, this penalty claim will be withdrawn.

── Contact ──────────────────────────────

For any questions regarding this notice, please reach out to your relationship manager or reply to this email.

${t.closing}

Regards,
Vendor Compliance Team
VendorGuard — SLA Management Platform`

  return { subject, body }
}
