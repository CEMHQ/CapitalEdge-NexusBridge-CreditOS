import { NextResponse } from 'next/server'
import { z } from 'zod'

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse }

// Parses and validates a request body against a Zod schema.
// Returns the typed data on success, or a ready-to-return 400 response on failure.
// Call this first in every API route handler — before auth, before DB access.
export async function validateBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<ValidationResult<T>> {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      ),
    }
  }

  const result = schema.safeParse(body)

  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Validation failed',
          issues: result.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      ),
    }
  }

  return { success: true, data: result.data }
}
