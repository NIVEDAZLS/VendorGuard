"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const steps = [
  {
    target: "KPI cards",
    description:
      "These cards show real-time metrics on vendor compliance, breach penalties, and active risks. Values update as the demo runs.",
  },
  {
    target: "Demo Controls",
    description:
      'Open the Demo Controls panel to accelerate time, inject new orders, or trigger vendor responses — essential for live demos.',
  },
  {
    target: "at-risk section",
    description:
      "Items approaching their SLA deadline appear here. Use time acceleration to watch them transition from at-risk to breached in real time.",
  },
  {
    target: "activity stream",
    description:
      "Every system action is logged here — contract uploads, breach detections, AI classifications, and claim actions.",
  },
]

const TOUR_KEY = "vendorguard-tour-dismissed"

export function FirstTimeTour() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(TOUR_KEY)
    if (!dismissed) {
      const timer = setTimeout(() => setVisible(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(TOUR_KEY, "true")
    setVisible(false)
  }

  const next = () => {
    if (step < steps.length - 1) {
      setStep(step + 1)
    } else {
      dismiss()
    }
  }

  if (!visible) return null

  const current = steps[step]

  return (
    <div className="fixed bottom-6 right-6 z-40 max-w-sm">
      <Card className="border-emerald-200 dark:border-emerald-800 shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                First time here? ({step + 1}/{steps.length})
              </p>
              <h3 className="text-sm font-semibold mt-0.5">{current.target}</h3>
            </div>
            <button
              onClick={dismiss}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {current.description}
          </p>
          <div className="flex items-center justify-between mt-3">
            <div className="flex gap-1">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-6 rounded-full transition-colors ${
                    i === step
                      ? "bg-emerald-500"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {step > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </Button>
              )}
              <Button size="sm" className="text-xs h-7" onClick={next}>
                {step < steps.length - 1 ? "Next" : "Got it"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
