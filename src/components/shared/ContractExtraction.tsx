"use client"

import { useEffect, useState } from "react"
import { Sparkles, Check, Loader2, FileText } from "lucide-react"
import { Card } from "@/components/ui/card"
import type { SLARule } from "@/lib/types"

interface Step {
  label: string
  delay: number
}

const steps: Step[] = [
  { label: "Parsing document structure", delay: 500 },
  { label: "Identifying SLA clauses", delay: 1200 },
  { label: "Extracting penalty terms", delay: 1800 },
  { label: "Structuring into rules", delay: 2400 },
]

export function ContractExtraction({
  onComplete,
}: {
  onComplete: (rules: SLARule[]) => void
}) {
  const [progress, setProgress] = useState(0)
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    steps.forEach((s) => {
      setTimeout(() => {
        setProgress((p) => Math.max(p, steps.indexOf(s) + 1))
      }, s.delay)
    })
    setTimeout(() => setShowRules(true), 3000)
  }, [])

  useEffect(() => {
    if (showRules) {
      const timer = setTimeout(() => {
        onComplete([])
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [showRules, onComplete])

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Faux PDF viewer */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          <span>Contract preview</span>
        </div>
        <div className="space-y-3 p-6">
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded"
              style={{
                width: `${40 + Math.random() * 55}%`,
                backgroundColor: "hsl(var(--muted))",
                animationDelay: `${i * 100}ms`,
              }}
            />
          ))}
        </div>
      </Card>

      {/* Extraction progress */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-medium">AI extraction in progress</span>
        </div>

        <div className="space-y-1">
          {steps.map((step, i) => {
            const done = progress > i
            const active = progress === i + 1
            return (
              <div
                key={step.label}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-all duration-500 ${
                  done
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
                    : active
                      ? "border-muted-foreground/30 bg-muted/30"
                      : "opacity-40"
                }`}
              >
                {done ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <span
                  className={`text-sm ${done ? "text-emerald-700 dark:text-emerald-300" : ""}`}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Fade-in rules preview */}
        {showRules && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
            <Card className="bg-emerald-50/50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800">
              <div className="p-4 text-center">
                <Sparkles className="mx-auto mb-1 h-5 w-5 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  Extraction complete
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  AI has identified SLA clauses from the contract
                </p>
              </div>
            </Card>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          <span>Powered by AI extraction</span>
        </div>
      </div>
    </div>
  )
}
