import { delay } from "@/lib/utils/delay"

interface ClassificationResult {
  matchesException: boolean
  clauseId?: string
  clauseText?: string
  reasoning: string
  confidence: number
}

const exceptionKeywords = [
  { keyword: "weather", clauseId: "ex-force-majeure", clauseText: "Force Majeure — Extreme Weather" },
  { keyword: "rainfall", clauseId: "ex-force-majeure", clauseText: "Force Majeure — Extreme Weather" },
  { keyword: "flood", clauseId: "ex-force-majeure", clauseText: "Force Majeure — Extreme Weather" },
  { keyword: "cyclone", clauseId: "ex-force-majeure", clauseText: "Force Majeure — Extreme Weather" },
  { keyword: "unreachable", clauseId: "ex-customer-unreachable", clauseText: "Customer Unreachable Exception" },
  { keyword: "not reachable", clauseId: "ex-customer-unreachable", clauseText: "Customer Unreachable Exception" },
  { keyword: "no response", clauseId: "ex-customer-unreachable", clauseText: "Customer Unreachable Exception" },
  { keyword: "reorganization", clauseId: "ex-address-issue", clauseText: "Address / Pin Code Exception" },
  { keyword: "pin code", clauseId: "ex-address-issue", clauseText: "Address / Pin Code Exception" },
  { keyword: "wrong address", clauseId: "ex-address-issue", clauseText: "Address / Pin Code Exception" },
  { keyword: "rally", clauseId: "ex-civil-disruption", clauseText: "Civil Disruption / Administrative Delay" },
  { keyword: "blockade", clauseId: "ex-civil-disruption", clauseText: "Civil Disruption / Administrative Delay" },
  { keyword: "protest", clauseId: "ex-civil-disruption", clauseText: "Civil Disruption / Administrative Delay" },
  { keyword: "remote", clauseId: "ex-remote-location", clauseText: "Remote Location / Last-Mile Exception" },
  { keyword: "village", clauseId: "ex-remote-location", clauseText: "Remote Location / Last-Mile Exception" },
  { keyword: "holiday", clauseId: "ex-public-holiday", clauseText: "Public Holiday Exception" },
]

export async function classifyVendorResponse(
  responseText: string,
  _clauses: string[]
): Promise<ClassificationResult> {
  console.log("[MOCK AI] classifyVendorResponse")

  await delay(2000)

  const text = responseText.toLowerCase()

  for (const entry of exceptionKeywords) {
    if (text.includes(entry.keyword)) {
      const confidence = Math.min(
        0.98,
        0.72 + (text.match(new RegExp(entry.keyword, "g"))?.length ?? 1) * 0.08
      )
      console.log(`[MOCK AI] → Matched exception: "${entry.keyword}" (confidence: ${confidence.toFixed(2)})`)
      return {
        matchesException: true,
        clauseId: entry.clauseId,
        clauseText: entry.clauseText,
        reasoning: `Vendor response mentions "${entry.keyword}", which aligns with the contract clause "${entry.clauseText}". ` +
          `The context appears valid based on the description of events provided.`,
        confidence: Math.round(confidence * 100) / 100,
      }
    }
  }

  // No keyword match — low-confidence non-match
  console.log("[MOCK AI] → No exception keywords found")
  return {
    matchesException: false,
    reasoning:
      "Vendor response does not clearly reference any recognized exception condition from the contract. " +
      "The description appears to be an operational delay without supporting exception grounds.",
    confidence: 0.31,
  }
}
