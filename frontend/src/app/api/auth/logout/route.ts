// frontend/src/app/api/auth/logout/route.ts
// AutoPilot Template — Simple logout

import { NextResponse } from 'next/server'

export async function GET() {
  // Just redirect to home — no external session to invalidate
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:8080'
  return NextResponse.redirect(baseUrl)
}
