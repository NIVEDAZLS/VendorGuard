"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { IndianRupee, TrendingUp, FileSearch, Eye, EyeOff } from "lucide-react"

const DEMO_EMAIL = "admin@vendorguard.io"
const DEMO_PASSWORD = "vendorguard2026"

const INDUSTRIES = ["Logistics", "Manufacturing", "Pharma", "FMCG", "Construction", "IT Services"]

const IMPACT_STATS = [
  {
    icon: IndianRupee,
    stat: "₹2.4Cr+",
    label: "Penalties recovered on average",
  },
  {
    icon: TrendingUp,
    stat: "3×",
    label: "Faster penalty recovery cycle",
  },
  {
    icon: FileSearch,
    stat: "100%",
    label: "Contract-to-operations traceability",
  },
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    setTimeout(() => {
      if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
        const maxAge = remember ? 604800 : 86400
        document.cookie = `vg_authed=1; path=/; max-age=${maxAge}`
        router.push("/")
      } else {
        setError("Incorrect email or password. Try admin@vendorguard.io")
        setLoading(false)
      }
    }, 400)
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col lg:flex-row">

      {/* ── HERO PANEL ─────────────────────────────────────────────────────── */}
      <div
        className="relative w-full lg:w-[60%] flex flex-col justify-between overflow-hidden text-white"
        style={{
          background: "#1a00d9",
          padding: "clamp(24px, 4vw, 56px)",
        }}
      >
        {/* Grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 0,transparent 48px)," +
              "repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 0,transparent 48px)",
          }}
        />
        {/* Orange bottom-right glow */}
        <div
          className="pointer-events-none absolute bottom-0 right-0 rounded-full blur-3xl opacity-30"
          style={{ width: "360px", height: "360px", background: "#fe6e06", transform: "translate(40%,40%)" }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-xl font-black font-mono text-white"
            style={{ width: 44, height: 44, fontSize: 16, background: "#fe6e06", flexShrink: 0 }}
          >
            VG
          </div>
          <div>
            <p className="font-bold leading-tight" style={{ fontSize: "clamp(15px,2vw,18px)" }}>VendorGuard</p>
            <p className="text-white/60 uppercase tracking-widest" style={{ fontSize: 10 }}>by Ganit</p>
          </div>
        </div>

        {/* Main copy */}
        <div className="relative z-10 space-y-5 py-8 lg:py-0">
          {/* Industry chips */}
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map(ind => (
              <span
                key={ind}
                className="rounded-full font-medium text-white/80"
                style={{
                  fontSize: "clamp(10px,1.2vw,12px)",
                  padding: "4px 12px",
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              >
                {ind}
              </span>
            ))}
          </div>

          <h1
            className="font-extrabold leading-[1.1] tracking-tight text-white"
            style={{ fontSize: "clamp(26px, 3.5vw, 44px)" }}
          >
            Turn vendor SLA<br />
            <span style={{ color: "#fe6e06" }}>breaches into</span><br />
            recovered revenue
          </h1>
        </div>

        {/* Impact stats */}
        <div className="relative z-10 space-y-2">
          {IMPACT_STATS.map(({ icon: Icon, stat, label }, i) => (
            <div
              key={label}
              className="flex items-center gap-4 rounded-xl"
              style={{
                padding: "clamp(10px,1.5vw,14px) clamp(14px,2vw,18px)",
                background: i === 1 ? "rgba(254,110,6,0.18)" : "rgba(255,255,255,0.07)",
                border: i === 1 ? "1px solid rgba(254,110,6,0.45)" : "1px solid rgba(255,255,255,0.10)",
                borderRadius: 12,
              }}
            >
              <div
                className="flex items-center justify-center rounded-xl shrink-0"
                style={{ width: 38, height: 38, background: i === 1 ? "#fe6e06" : "rgba(255,255,255,0.12)" }}
              >
                <Icon size={18} className="text-white" />
              </div>
              <div>
                <p
                  className="font-extrabold tabular-nums leading-none"
                  style={{ fontSize: "clamp(18px,2vw,22px)", color: i === 1 ? "#fe6e06" : "#ffffff" }}
                >
                  {stat}
                </p>
                <p className="text-white/70 mt-0.5" style={{ fontSize: "clamp(10px,1.1vw,12px)" }}>
                  {label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── LOGIN FORM PANEL ───────────────────────────────────────────────── */}
      <div
        className="w-full lg:w-[40%] flex items-center justify-center overflow-hidden"
        style={{ background: "#E8F0F8", padding: "clamp(24px,4vw,48px)" }}
      >
        <div className="w-full flex flex-col items-center" style={{ maxWidth: 420 }}>

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 w-full">
            <div
              className="flex items-center justify-center rounded-xl font-black font-mono text-white"
              style={{ width: 40, height: 40, fontSize: 14, background: "#1a00d9" }}
            >
              VG
            </div>
            <div>
              <p className="font-bold text-slate-900 leading-tight" style={{ fontSize: 16 }}>VendorGuard</p>
              <p className="text-slate-400 uppercase tracking-widest" style={{ fontSize: 10 }}>by Ganit</p>
            </div>
          </div>

          {/* Orange accent bar */}
          <div className="rounded-full mb-6 w-full" style={{ height: 4, maxWidth: 40, background: "#fe6e06" }} />

          {/* Heading */}
          <h2
            className="font-extrabold text-slate-900 leading-tight w-full"
            style={{ fontSize: "clamp(20px,2.5vw,28px)" }}
          >
            Welcome back
          </h2>
          <p className="text-slate-500 mt-1.5 mb-8 w-full" style={{ fontSize: "clamp(13px,1.3vw,15px)" }}>
            Sign in to your VendorGuard workspace
          </p>

          {/* Form card */}
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl w-full"
            style={{
              background: "#ffffff",
              padding: "clamp(20px,3vw,32px)",
              boxShadow: "0 4px 24px rgba(31,71,136,0.10)",
            }}
          >
            {/* Email */}
            <div style={{ marginBottom: 18 }}>
              <label
                className="block font-bold text-slate-700 uppercase tracking-wide mb-1.5"
                style={{ fontSize: "clamp(11px,1.1vw,13px)" }}
              >
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="your.email@company.com"
                className="w-full rounded-lg border border-slate-200 text-slate-900 transition focus:outline-none focus:ring-2"
                style={{
                  height: 44,
                  padding: "0 16px",
                  fontSize: "clamp(13px,1.3vw,15px)",
                  background: "#F8F9FB",
                  "--tw-ring-color": "#1a00d9",
                } as React.CSSProperties}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 6 }}>
              <label
                className="block font-bold text-slate-700 uppercase tracking-wide mb-1.5"
                style={{ fontSize: "clamp(11px,1.1vw,13px)" }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••"
                  className="w-full rounded-lg border border-slate-200 text-slate-900 transition focus:outline-none focus:ring-2"
                  style={{
                    height: 44,
                    padding: "0 44px 0 16px",
                    fontSize: "clamp(13px,1.3vw,15px)",
                    background: "#F8F9FB",
                    "--tw-ring-color": "#1a00d9",
                  } as React.CSSProperties}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  tabIndex={-1}
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div className="text-right mb-4">
              <button
                type="button"
                className="font-medium hover:underline transition"
                style={{ fontSize: "clamp(11px,1.1vw,13px)", color: "#1a00d9" }}
              >
                Forgot password?
              </button>
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2 cursor-pointer mb-5">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="rounded"
                style={{ accentColor: "#1a00d9", width: 15, height: 15 }}
              />
              <span className="text-slate-600 select-none" style={{ fontSize: "clamp(12px,1.2vw,14px)" }}>
                Remember me for 7 days
              </span>
            </label>

            {/* Error */}
            {error && (
              <div
                className="rounded-lg mb-4"
                style={{
                  padding: "10px 14px",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  fontSize: "clamp(11px,1.1vw,13px)",
                  color: "#DC2626",
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full font-bold text-white rounded-lg transition-all hover:opacity-90 disabled:opacity-60"
              style={{
                height: 48,
                fontSize: "clamp(13px,1.3vw,15px)",
                background: loading ? "#1a00d9" : "linear-gradient(90deg, #1a00d9 0%, #fe6e06 100%)",
                boxShadow: "0 4px 14px rgba(31,71,136,0.30)",
                letterSpacing: "0.02em",
              }}
            >
              {loading ? "Signing in…" : "Sign In →"}
            </button>

            {/* Sign up link */}
            <p className="text-center mt-5 text-slate-500" style={{ fontSize: "clamp(12px,1.2vw,14px)" }}>
              Don't have an account?{" "}
              <button
                type="button"
                className="font-semibold hover:underline transition"
                style={{ color: "#1a00d9" }}
              >
                Request access
              </button>
            </p>
          </form>

          {/* Demo hint */}
          <p className="text-center text-slate-400 mt-4 w-full" style={{ fontSize: "clamp(10px,1vw,12px)" }}>
            Demo: <span className="font-mono text-slate-500">{DEMO_EMAIL}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
