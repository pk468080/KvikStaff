import { supabase } from './supabase'

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL

if (!API_BASE_URL) {
  throw new Error(
    'Missing EXPO_PUBLIC_API_BASE_URL.',
  )
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  if (!session?.access_token) {
    throw new Error(
      'A customer authentication session is required.',
    )
  }

  return session.access_token
}

function getErrorMessage(
  payload: unknown,
  status: number,
): string {
  if (
    typeof payload === 'object' &&
    payload !== null
  ) {
    const body =
      payload as Record<string, unknown>

    if (
      typeof body.detail === 'string' &&
      body.detail.trim()
    ) {
      return body.detail
    }

    const error =
      body.error

    if (
      typeof error === 'object' &&
      error !== null
    ) {
      const errorBody =
        error as Record<string, unknown>

      if (
        typeof errorBody.message === 'string' &&
        errorBody.message.trim()
      ) {
        return errorBody.message
      }
    }
  }

  return `Request failed with status ${status}.`
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  requiresAuth: boolean,
): Promise<T> {
  const baseUrl =
    API_BASE_URL.replace(/\/+$/, '')

  const normalizedPath =
    path.startsWith('/')
      ? path
      : `/${path}`

  const headers = new Headers(
    options.headers,
  )

  if (requiresAuth) {
    const token =
      await getAccessToken()

    headers.set(
      'Authorization',
      `Bearer ${token}`,
    )
  }

  if (
    options.body &&
    !headers.has('Content-Type')
  ) {
    headers.set(
      'Content-Type',
      'application/json',
    )
  }

  const response = await fetch(
    `${baseUrl}${normalizedPath}`,
    {
      ...options,
      headers,
    },
  )

  const responseText =
    await response.text()

  let payload: unknown = null

  if (responseText.trim()) {
    try {
      payload = JSON.parse(
        responseText,
      )
    } catch {
      payload = responseText
    }
  }

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        payload,
        response.status,
      ),
    )
  }

  return payload as T
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return request<T>(
    path,
    options,
    true,
  )
}

export async function publicApiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return request<T>(
    path,
    options,
    false,
  )
}
