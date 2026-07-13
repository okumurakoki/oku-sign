import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public paths
  const publicPaths = ['/login', '/sign', '/api/trpc']
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Dev bypass
  if (process.env.DEV_BYPASS_AUTH === '1') {
    return NextResponse.next()
  }

  // TODO: Supabase session check
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
