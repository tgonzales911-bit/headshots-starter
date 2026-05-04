import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'
import { Database } from './types/supabase'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient<Database>({ req, res })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const pathname = req.nextUrl.pathname
  const isAdminRoute =
    pathname === '/admin' || pathname.startsWith('/admin/')
  if (isAdminRoute) {
    if (!session?.user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    if (session.user.email !== process.env.ADMIN_EMAIL) {
      return NextResponse.redirect(new URL('/overview', req.url))
    }
  }

  return res
}

export const config = {
  matcher: ['/overview/:path*', '/admin/:path*'],
}