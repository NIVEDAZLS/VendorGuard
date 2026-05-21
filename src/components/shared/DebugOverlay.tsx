"use client"

import { useState, useEffect } from "react"
import { useDataStore } from "@/lib/store"
import { useDemoStore } from "@/lib/store/useDemoStore"
import { X } from "lucide-react"

export function DebugOverlay() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let buffer = ""
    const handler = (e: KeyboardEvent) => {
      if (!e.key) return
      buffer += e.key.toLowerCase()
      buffer = buffer.slice(-8)
      if (buffer === "vg:debug") {
        setVisible((v) => !v)
        buffer = ""
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  if (!visible) return null

  const dataStore = useDataStore.getState()
  const demoStore = useDemoStore.getState()

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Debug Overlay</h2>
          <button
            onClick={() => setVisible(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 text-xs font-mono">
          <section>
            <h3 className="text-sm font-semibold mb-2">Demo Store</h3>
            <pre className="bg-muted p-3 rounded overflow-x-auto">
              {JSON.stringify(
                {
                  accelerationEnabled: demoStore.accelerationEnabled,
                  now: new Date(demoStore.now()).toISOString(),
                },
                null,
                2
              )}
            </pre>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">Data Store Summary</h3>
            <pre className="bg-muted p-3 rounded overflow-x-auto">
              {JSON.stringify(
                {
                  vendors: dataStore.vendors.length,
                  contracts: dataStore.contracts.length,
                  slaRules: dataStore.slaRules.length,
                  dataSources: dataStore.dataSources.length,
                  operationalEvents: dataStore.operationalEvents.length,
                  atRiskItems: dataStore.atRiskItems.length,
                  vendorResponses: dataStore.vendorResponses.length,
                  breaches: dataStore.breaches.length,
                  claims: dataStore.claims.length,
                  auditEntries: dataStore.auditEntries.length,
                },
                null,
                2
              )}
            </pre>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">Breaches</h3>
            <pre className="bg-muted p-3 rounded overflow-x-auto">
              {JSON.stringify(dataStore.breaches.slice(0, 10), null, 2)}
            </pre>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">At-Risk Items</h3>
            <pre className="bg-muted p-3 rounded overflow-x-auto">
              {JSON.stringify(dataStore.atRiskItems.slice(0, 10), null, 2)}
            </pre>
          </section>
        </div>
      </div>
    </div>
  )
}
