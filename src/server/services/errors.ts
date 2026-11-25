import { ZodError } from "zod"

import { SplitValidationError } from "@/domain/split"

export class ServiceError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message)
    this.name = "ServiceError"
    this.status = status
    this.code = code
    this.details = details
  }
}

export function jsonNoStore(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

function isAuthHttpError(
  error: unknown
): error is Error & { toResponse: () => Response } {
  return (
    error instanceof Error &&
    error.name === "AuthHttpError" &&
    typeof (error as { toResponse?: unknown }).toResponse === "function"
  )
}

export function toServiceErrorResponse(error: unknown): Response {
  if (isAuthHttpError(error)) {
    return error.toResponse()
  }

  if (error instanceof ServiceError) {
    return jsonNoStore(
      {
        error: error.message,
        code: error.code,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
      error.status
    )
  }

  if (error instanceof SplitValidationError) {
    return jsonNoStore(
      {
        error: error.message,
        code: "SPLIT_VALIDATION_FAILED",
        issues: error.issues,
      },
      400
    )
  }

  if (error instanceof ZodError) {
    return jsonNoStore(
      {
        error: "Invalid request payload.",
        code: "VALIDATION_ERROR",
        issues: error.issues,
      },
      400
    )
  }

  console.error("[tabquest-api] unhandled error:", error)
  return jsonNoStore(
    {
      error: "Internal server error.",
      code: "INTERNAL_ERROR",
    },
    500
  )
}
