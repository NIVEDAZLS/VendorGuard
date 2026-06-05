import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow login page and vendor exception magic-link page to be accessed without auth
  if (pathname.startsWith("/login") || pathname.startsWith("/exception")) {
    return NextResponse.next()
  }

  const authed = request.cookies.get("vg_authed")?.value
  if (!authed) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
}
