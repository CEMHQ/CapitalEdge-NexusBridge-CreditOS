import 'server-only'

export interface OfacScreeningResult {
  status: 'clear' | 'match' | 'error'
  score: number   // 0–100 match score
  matchDetails: string | null
  rawResult: unknown
}

interface OfacMatch {
  score: number
  name: string
  sdnType: string
}

interface OfacApiResponse {
  appResponse?: {
    matches?: OfacMatch[]
  }
}

// Screens a name (and optional DOB) against the OFAC SDN list using the public
// OFAC sanctions search API. No API key is required.
// Returns 'match' if any result has score >= 85, 'clear' otherwise, 'error' on failure.
export async function screenOfacSdn(opts: {
  name: string
  dob?: string    // YYYY-MM-DD optional
  entityType?: 'individual' | 'entity'
}): Promise<OfacScreeningResult> {
  try {
    const searchEntry: Record<string, string> = { name: opts.name }
    if (opts.dob) searchEntry.dob = opts.dob

    const response = await fetch('https://sanctionssearch.ofac.treas.gov/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        apiKey: null,
        minScore: 85,
        type: opts.entityType ?? 'individual',
        searchList: [searchEntry],
      }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown error')
      return {
        status: 'error',
        score: 0,
        matchDetails: `OFAC API error ${response.status}: ${text}`,
        rawResult: null,
      }
    }

    const json = await response.json() as OfacApiResponse
    const matches = json.appResponse?.matches ?? []

    if (matches.length === 0) {
      return {
        status: 'clear',
        score: 0,
        matchDetails: null,
        rawResult: json,
      }
    }

    // Find highest-scoring match
    const topMatch = matches.reduce<OfacMatch>(
      (best, m) => (m.score > best.score ? m : best),
      matches[0]
    )

    if (topMatch.score >= 85) {
      return {
        status: 'match',
        score: topMatch.score,
        matchDetails: `"${topMatch.name}" (SDN type: ${topMatch.sdnType}, score: ${topMatch.score})`,
        rawResult: json,
      }
    }

    return {
      status: 'clear',
      score: topMatch.score,
      matchDetails: null,
      rawResult: json,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      status: 'error',
      score: 0,
      matchDetails: message,
      rawResult: null,
    }
  }
}
