"use client"

import { useState } from "react"
import { Sparkles, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { classifyVendorResponse } from "@/lib/ai"
import { toast } from "sonner"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  ruleExceptions: string[]
  onResult: (result: {
    matchesException: boolean
    clauseId?: string
    clauseText?: string
    reasoning: string
    confidence: number
    responseText: string
  }) => void
}

export function SimulateResponseDialog({
  open,
  onOpenChange,
  ruleExceptions,
  onResult,
}: Props) {
  const [text, setText] = useState("")
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<{
    matchesException: boolean
    clauseId?: string
    clauseText?: string
    reasoning: string
    confidence: number
  } | null>(null)

  const handleSubmit = async () => {
    if (!text.trim()) return
    setAnalyzing(true)
    setResult(null)
    const classification = await classifyVendorResponse(text, ruleExceptions)
    setResult(classification)
    setAnalyzing(false)
  }

  const handleAccept = () => {
    if (!result) return
    onResult({ ...result, responseText: text })
    toast.success("Exception accepted — vendor exempted")
    onOpenChange(false)
    setText("")
    setResult(null)
  }

  const handleReject = () => {
    onResult({
      matchesException: false,
      reasoning: "Exception rejected by user",
      confidence: 1,
      responseText: text,
    })
    toast("Exception rejected — proceeding with breach")
    onOpenChange(false)
    setText("")
    setResult(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Simulate vendor response</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Vendor response text</Label>
            <Textarea
              placeholder='e.g. "Customer was not available for delivery due to a family emergency. We attempted delivery 3 times."'
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Try: &quot;weather&quot;, &quot;unreachable&quot;, &quot;rally&quot;, or &quot;remote&quot; to trigger
              exception matching
            </p>
          </div>

          <Button onClick={handleSubmit} disabled={analyzing || !text.trim()}>
            {analyzing ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                AI is analyzing the vendor&apos;s response against your contract...
              </>
            ) : (
              "Submit for AI analysis"
            )}
          </Button>

          {/* Loading state */}
          {analyzing && (
            <div className="flex flex-col items-center py-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
              <p className="text-sm font-medium">Classifying vendor response</p>
              <p className="text-xs text-muted-foreground mt-1">
                Checking against {ruleExceptions.length} exception clause
                {ruleExceptions.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}

          {/* Result */}
          {result && !analyzing && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-3">
              <Card
                className={
                  result.matchesException
                    ? "border-emerald-200 dark:border-emerald-800"
                    : "border-red-200 dark:border-red-800"
                }
              >
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium">AI Classification</span>
                    </div>
                    <Badge
                      variant={result.matchesException ? "success" : "destructive"}
                    >
                      {result.matchesException
                        ? "Exception matched"
                        : "No match"}
                    </Badge>
                  </div>

                  {result.clauseText && (
                    <div className="rounded-md bg-muted p-3 text-xs">
                      <span className="font-medium">Matched clause: </span>
                      {result.clauseText}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Reasoning: </span>
                    {result.reasoning}
                  </div>

                  <div className="text-xs">
                    <span className="text-muted-foreground">Confidence: </span>
                    <span className="font-medium tabular-nums">
                      {Math.round(result.confidence * 100)}%
                    </span>
                  </div>
                </CardContent>
              </Card>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={handleReject}>
                  Reject and proceed
                </Button>
                <Button onClick={handleAccept}>Accept exception</Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
