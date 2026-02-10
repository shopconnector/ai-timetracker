import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/sync/activities
 * Receives activities from the desktop agent and stores them
 * For now, this is a simple pass-through that logs the data
 * In production, this would store to a database
 */

interface SyncedActivity {
  id: string
  app: string
  title: string
  totalSeconds: number
  firstSeen: string
  lastSeen: string
  category: string
  eventCount: number
}

interface SyncRequest {
  date: string
  activities: SyncedActivity[]
}

// In-memory store for demo (in production, use database)
const activityStore = new Map<string, SyncedActivity[]>()

export async function POST(request: NextRequest) {
  try {
    const body: SyncRequest = await request.json()

    if (!body.date || !body.activities) {
      return NextResponse.json(
        { error: 'Missing date or activities' },
        { status: 400 }
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Store activities (merge with existing)
    const existing = activityStore.get(body.date) || []
    const existingIds = new Set(existing.map((a) => a.id))

    const newActivities = body.activities.filter((a) => !existingIds.has(a.id))
    const updatedActivities = [...existing]

    // Update existing activities with new data
    for (const activity of body.activities) {
      const existingIndex = updatedActivities.findIndex((a) => a.id === activity.id)
      if (existingIndex >= 0) {
        updatedActivities[existingIndex] = activity
      } else {
        updatedActivities.push(activity)
      }
    }

    activityStore.set(body.date, updatedActivities)

    console.log(`[Sync] Received ${body.activities.length} activities for ${body.date}`)
    console.log(`[Sync] New: ${newActivities.length}, Updated: ${body.activities.length - newActivities.length}`)

    return NextResponse.json({
      success: true,
      message: `Synced ${body.activities.length} activities`,
      stats: {
        date: body.date,
        total: updatedActivities.length,
        new: newActivities.length,
        updated: body.activities.length - newActivities.length
      }
    })
  } catch (error) {
    console.error('[Sync] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  if (!date) {
    return NextResponse.json(
      { error: 'Missing date parameter' },
      { status: 400 }
    )
  }

  const activities = activityStore.get(date) || []

  return NextResponse.json({
    date,
    activities,
    totalSeconds: activities.reduce((sum, a) => sum + a.totalSeconds, 0)
  })
}
