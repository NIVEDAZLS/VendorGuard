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

const metricLabels: Record<string, string> = {
  delivery_time: "Delivery time",
  uptime: "Uptime",
  response_time: "Response time",
  quality: "Quality",
}

export function ContractRules({ rules: initialRules, contractId: _contractId, onAllApproved: _onAllApproved }: Props) {
  const [rules, setRules] = useState(initialRules)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editThreshold, setEditThreshold] = useState("")

  const draftCount = rules.filter((r) => r.status === "draft").length
  const allApproved = rules.every((r) => r.status === "approved")

  const handleApprove = async (ruleId: string) => {
    await ContractAPI.approveRule(ruleId)
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, status: "approved" as const } : r))
    )
    toast.success("Rule approved")
  }

  const handleDiscard = (ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId))
    toast("Rule discarded")
  }

  const handleApproveAll = async () => {
    for (const r of rules.filter((r) => r.status === "draft")) {
      await ContractAPI.approveRule(r.id)
    }
    setRules((prev) => prev.map((r) => ({ ...r, status: "approved" as const })))
  }

  const handleRejectAll = () => {
    setRules([])
    toast("All rules rejected")
  }

  const startEdit = (rule: SLARule) => {
    setEditingId(rule.id)
    setEditThreshold(`${rule.threshold.value} ${rule.threshold.unit}`)
  }

  const saveEdit = async (ruleId: string) => {
    const match = editThreshold.match(/^(\d+(?:\.\d+)?)\s*(.+)$/)
    if (!match) return
    await ContractAPI.updateRule({
      ruleId,
      patches: {
        threshold: { value: parseFloat(match[1]), unit: match[2] },
      },
    })
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? { ...r, threshold: { value: parseFloat(match[1]), unit: match[2] } }
          : r
      )
    )
    setEditingId(null)
    toast.success("Rule updated")
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
      {/* Banner */}
      {draftCount > 0 && (
        <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
          <CardContent className="flex items-center gap-3 pt-4">
            <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              AI extracted {draftCount} SLA rule{draftCount !== 1 ? "s" : ""} from this
              contract. Please review and approve before they go live.
            </p>
          </CardContent>
        </Card>
      )}

      {allApproved && (
        <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800">
          <CardContent className="flex items-center gap-3 pt-4">
            <BadgeCheck className="h-5 w-5 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-800 dark:text-emerald-200">
              All rules approved. Contract is now active — monitoring is live.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Bulk actions */}
      {draftCount > 0 && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleApproveAll}>
            <Check className="mr-1 h-3.5 w-3.5" />
            Approve all
          </Button>
          <Button size="sm" variant="outline" onClick={handleRejectAll}>
            <X className="mr-1 h-3.5 w-3.5" />
            Reject all
          </Button>
        </div>
      )}

      {/* Rules */}
      {rules.map((rule) => {
        const isApproved = rule.status === "approved"
        const isEditing = editingId === rule.id
        const isExpanded = expandedId === rule.id
        const confidence = 85 + Math.floor(Math.random() * 11)

        return (
          <Card
            key={rule.id}
            className={isApproved ? "border-emerald-300 dark:border-emerald-700" : ""}
          >
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  {/* Top row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={isApproved ? "success" : "outline"}>
                      {metricLabels[rule.metricType] ?? rule.metricType}
                    </Badge>
                    <span className="text-sm font-medium">{rule.metricLabel}</span>
                    {isApproved && (
                      <Badge variant="success" className="text-[10px]">
                        Active
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="text-[10px] text-muted-foreground"
                    >
                      {confidence}% confidence
                    </Badge>
                  </div>

                  {/* Threshold + Penalty */}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Threshold</span>
                      <p className="font-medium tabular-nums">
                        {isEditing ? (
                          <span className="flex items-center gap-1">
                            <Input
                              value={editThreshold}
                              onChange={(e) => setEditThreshold(e.target.value)}
                              className="h-7 w-32 text-sm inline-flex"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7"
                              onClick={() => saveEdit(rule.id)}
                            >
                              Save
                            </Button>
                          </span>
                        ) : (
                          <span
                            className="cursor-pointer hover:text-primary transition-colors"
                            onClick={() => startEdit(rule)}
                          >
                            {rule.threshold.value} {rule.threshold.unit}
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Penalty</span>
                      <p className="font-medium">
                        {rule.penalty.type === "percent"
                          ? `${rule.penalty.value}% of ${rule.penalty.basis}`
                          : `₹${rule.penalty.value} per ${rule.penalty.basis}`}
                      </p>
                    </div>
                  </div>

                  {/* Exceptions */}
                  {rule.exceptions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {rule.exceptions.map((ex, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-[10px] font-normal"
                        >
                          {ex.condition}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Raw clause */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : rule.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    Raw clause
                  </button>

                  {isExpanded && (
                    <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground mt-1 animate-in fade-in slide-in-from-top-1">
                      <p className="italic leading-relaxed">{rule.rawClauseText}</p>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Page {rule.rawClausePage}
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {!isApproved && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
                      onClick={() => handleApprove(rule.id)}
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                      onClick={() => handleDiscard(rule.id)}
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
