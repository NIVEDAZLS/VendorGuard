"use client"

import { useState } from "react"
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Sparkles,
  ThumbsUp,
  BookOpen,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ContractAPI } from "@/lib/api"
import { toast } from "sonner"
import type { SLARule } from "@/lib/types"

interface Props {
  rules: SLARule[]
  contractId: string
  onAllApproved: () => void
}

const metricTypeColors: Record<string, string> = {
  delivery_time: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  quality:       "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  response_time: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  uptime:        "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
}

function formatThreshold(value: number, unit: string): string {
  if (!value || value === 0) return "—"
  const u = unit.toLowerCase()
  if (u === "percent") return `${value}%`
  if (u === "hours") return `${value}h`
  if (u === "minutes") return `${value} min`
  if (u === "days") return `${value}d`
  if (u === "months") return `${value} month${value !== 1 ? "s" : ""}`
  if (u === "incidents" || u === "occurrences") return `${value} incident${value !== 1 ? "s" : ""}`
  if (u === "pallets") return `${value} pallets`
  if (u === "business_hours") return `${value} business hrs`
  return `${value} ${unit}`
}

function formatPenalty(type: string | undefined, value: number, basis: string): string {
  if (!type || type === "none" || !value) return "See contract"
  if (type === "percent" || type === "percentage") {
    return `${value}% of ${basis}`
  }
  if (type === "per_unit") {
    return `₹${value.toLocaleString("en-IN")} per unit`
  }
  // flat
  return `₹${value.toLocaleString("en-IN")} per event`
}

function getTierInfo(rawClauseText: string): { tier: number | null; note: string } {
  const match = rawClauseText.match(/^Tier\s+(\d+)\s*(?:—\s*)?(.*)$/i)
  if (match) return { tier: Number(match[1]), note: match[2].trim() }
  return { tier: null, note: rawClauseText }
}

export function ContractRules({ rules: initialRules, contractId: _contractId, onAllApproved }: Props) {
  const [rules, setRules] = useState(initialRules)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editThreshold, setEditThreshold] = useState("")
  const [approving, setApproving] = useState<Set<string>>(new Set())

  const draftCount = rules.filter((r) => r.status === "draft").length
  const allApproved = rules.length > 0 && rules.every((r) => r.status === "approved")

  const handleApprove = async (ruleId: string) => {
    setApproving(prev => new Set(prev).add(ruleId))
    try {
      await ContractAPI.approveRule(ruleId)
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, status: "approved" as const } : r))
      toast.success("Rule approved")
      const updated = rules.map(r => r.id === ruleId ? { ...r, status: "approved" as const } : r)
      if (updated.every(r => r.status === "approved")) onAllApproved()
    } catch {
      toast.error("Failed to approve rule")
    } finally {
      setApproving(prev => { const s = new Set(prev); s.delete(ruleId); return s })
    }
  }

  const handleDiscard = (ruleId: string) => {
    setRules(prev => prev.filter(r => r.id !== ruleId))
    toast("Rule removed")
  }

  const handleApproveAll = async () => {
    for (const r of rules.filter(r => r.status === "draft")) {
      await ContractAPI.approveRule(r.id)
    }
    setRules(prev => prev.map(r => ({ ...r, status: "approved" as const })))
    toast.success("All rules approved")
    onAllApproved()
  }

  const handleRejectAll = () => {
    setRules([])
    toast("All rules removed")
  }

  const startEdit = (rule: SLARule) => {
    setEditingId(rule.id)
    setEditThreshold(`${rule.threshold.value} ${rule.threshold.unit}`)
  }

  const saveEdit = async (ruleId: string) => {
    const match = editThreshold.match(/^(\d+(?:\.\d+)?)\s*(.+)$/)
    if (!match) return
    await ContractAPI.updateRule({ ruleId, patches: { threshold: { value: parseFloat(match[1]), unit: match[2] } } })
    setRules(prev => prev.map(r =>
      r.id === ruleId ? { ...r, threshold: { value: parseFloat(match[1]), unit: match[2] } } : r
    ))
    setEditingId(null)
    toast.success("Threshold updated")
  }

  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No SLA rules to review</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* AI banner */}
      {draftCount > 0 && (
        <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200 flex-1">
              AI extracted <span className="font-semibold">{draftCount} SLA rule{draftCount !== 1 ? "s" : ""}</span> from this contract. Review and approve before they go live.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={handleApproveAll}>
                <Check className="mr-1 h-3.5 w-3.5" /> Approve all
              </Button>
              <Button size="sm" variant="outline" onClick={handleRejectAll}>
                <X className="mr-1 h-3.5 w-3.5" /> Reject all
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {allApproved && (
        <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800">
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <BadgeCheck className="h-5 w-5 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-800 dark:text-emerald-200">
              All {rules.length} rules approved — contract is active and monitoring is live.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Rule count summary */}
      <p className="text-xs text-muted-foreground px-1">
        {rules.filter(r => r.status === "approved").length} of {rules.length} rules approved
      </p>

      {/* Rule cards */}
      {rules.map((rule) => {
        const isApproved = rule.status === "approved"
        const isEditing = editingId === rule.id
        const isExpanded = expandedId === rule.id
        const isApprovingThis = approving.has(rule.id)
        const { tier, note } = getTierInfo(rule.rawClauseText)
        const thresholdDisplay = formatThreshold(rule.threshold.value, rule.threshold.unit)
        const penaltyDisplay = formatPenalty(rule.penalty.type, rule.penalty.value, rule.penalty.basis)
        const metricColor = metricTypeColors[rule.metricType] ?? metricTypeColors.delivery_time

        return (
          <Card
            key={rule.id}
            className={`transition-colors ${isApproved
              ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/30 dark:bg-emerald-950/20"
              : ""}`}
          >
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2.5">

                  {/* Top row: section + metric type + label + status badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Section badge */}
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-mono font-medium text-muted-foreground">
                      <BookOpen className="h-3 w-3" />
                      §{rule.rawClausePage || "—"}
                    </span>

                    {/* Metric type chip */}
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${metricColor}`}>
                      {rule.metricType.replace("_", " ")}
                    </span>

                    {/* Tier badge */}
                    {tier !== null && (
                      <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
                        Tier {tier}
                      </span>
                    )}

                    {/* Rule label */}
                    <span className="text-sm font-medium truncate">{rule.metricLabel}</span>

                    {isApproved && (
                      <Badge variant="success" className="text-[10px] shrink-0">Active</Badge>
                    )}
                  </div>

                  {/* Threshold + Penalty row */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Threshold</p>
                      {isEditing ? (
                        <span className="flex items-center gap-1">
                          <Input
                            value={editThreshold}
                            onChange={(e) => setEditThreshold(e.target.value)}
                            className="h-7 w-28 text-sm"
                          />
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => saveEdit(rule.id)}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </span>
                      ) : (
                        <span
                          className={`font-semibold tabular-nums ${!isApproved ? "cursor-pointer hover:text-primary transition-colors" : ""}`}
                          onClick={() => !isApproved && startEdit(rule)}
                          title={!isApproved ? "Click to edit" : undefined}
                        >
                          {thresholdDisplay}
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Penalty</p>
                      <span className={`font-semibold ${penaltyDisplay === "See contract" ? "text-muted-foreground italic font-normal" : ""}`}>
                        {penaltyDisplay}
                      </span>
                    </div>

                    {rule.penalty.value > 0 && rule.penalty.type !== "percent" && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Type</p>
                        <span className="font-medium capitalize">{rule.penalty.type ?? "fixed"}</span>
                      </div>
                    )}
                  </div>

                  {/* Exception clauses */}
                  {rule.exceptions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {rule.exceptions.map((ex, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] font-normal max-w-xs truncate">
                          {ex.condition}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Note / raw clause expander */}
                  {note && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : rule.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {isExpanded ? "Hide note" : "Show note"}
                    </button>
                  )}

                  {isExpanded && note && (
                    <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground animate-in fade-in slide-in-from-top-1">
                      <p className="leading-relaxed">{note}</p>
                    </div>
                  )}
                </div>

                {/* Approve / discard buttons */}
                {!isApproved && (
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                      onClick={() => handleApprove(rule.id)}
                      disabled={isApprovingThis}
                      title="Approve rule"
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={() => handleDiscard(rule.id)}
                      title="Remove rule"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
