// ICS Calendar Parser

export interface ICSEvent {
  id: string
  title: string
  description?: string
  location?: string
  start: Date
  end?: Date
  isOfficial: true
}

export async function fetchOfficialEvents(icsUrl: string): Promise<ICSEvent[]> {
  try {
    const response = await fetch(icsUrl, { cache: 'no-store' }) // Always fetch fresh data
    const icsText = await response.text()
    const events = parseICS(icsText)
    console.log('ICS Parser: Fetched', events.length, 'events')
    if (events.length > 0) {
      console.log('ICS Parser: First event:', events[0].title, 'start:', events[0].start.toISOString())
    }
    return events
  } catch (error) {
    console.error('Failed to fetch ICS:', error)
    return []
  }
}

export function parseICS(icsText: string): ICSEvent[] {
  const events: ICSEvent[] = []
  const lines = icsText.replace(/\r\n /g, '').split(/\r\n|\n|\r/)

  let currentEvent: Partial<ICSEvent> | null = null
  let eventId = 0

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      currentEvent = { isOfficial: true }
      eventId++
    } else if (line === 'END:VEVENT' && currentEvent) {
      if (currentEvent.title && currentEvent.start) {
        events.push({
          id: `official-${eventId}`,
          title: currentEvent.title,
          description: currentEvent.description,
          location: currentEvent.location,
          start: currentEvent.start,
          end: currentEvent.end,
          isOfficial: true
        })
      }
      currentEvent = null
    } else if (currentEvent) {
      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) continue

      const key = line.substring(0, colonIndex)
      const value = line.substring(colonIndex + 1)

      if (key.startsWith('DTSTART')) {
        // Pass full key to extract TZID if present
        currentEvent.start = parseICSDate(value, key)
      } else if (key.startsWith('DTEND')) {
        currentEvent.end = parseICSDate(value, key)
      } else if (key === 'SUMMARY') {
        currentEvent.title = unescapeICS(value)
      } else if (key === 'LOCATION') {
        currentEvent.location = unescapeICS(value)
      } else if (key === 'DESCRIPTION') {
        currentEvent.description = unescapeICS(value)
      } else if (key === 'UID') {
        currentEvent.id = `official-${value}`
      }
    }
  }

  return events
}

function parseICSDate(dateStr: string, key?: string): Date {
  // Extract the date/time value
  const valueMatch = dateStr.match(/(\d{8}T?\d{0,6})/)
  if (!valueMatch) return new Date(dateStr)

  const value = valueMatch[1].replace('T', '')

  if (value.length === 8) {
    // Date only: YYYYMMDD - treat as local date
    const year = parseInt(value.substring(0, 4))
    const month = parseInt(value.substring(4, 6)) - 1
    const day = parseInt(value.substring(6, 8))
    return new Date(year, month, day)
  } else if (value.length >= 14) {
    // Date + time: YYYYMMDDHHMMSS
    // All MyVMK events are in Eastern time - just parse as local time
    // (no timezone conversion needed since we display in Eastern too)
    const year = parseInt(value.substring(0, 4))
    const month = parseInt(value.substring(4, 6)) - 1
    const day = parseInt(value.substring(6, 8))
    const hour = parseInt(value.substring(8, 10))
    const min = parseInt(value.substring(10, 12))
    const sec = parseInt(value.substring(12, 14)) || 0

    // Create as local time (treating Eastern time as local)
    return new Date(year, month, day, hour, min, sec)
  }

  return new Date(dateStr)
}

function unescapeICS(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}
