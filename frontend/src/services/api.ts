/**
 * API Client Configuration
 *
 * ⚠️ DO NOT MODIFY THIS FILE - It is a protected boilerplate file.
 *
 * To add API endpoints, create a NEW file like `src/services/myApi.ts`:
 *
 *   import { api, PaginatedResponse } from './api'
 *
 *   // Django REST Framework returns paginated responses by default
 *   export const myApi = {
 *     // Option 1: Extract just the results array (simple usage)
 *     list: async () => {
 *       const response = await api.get<PaginatedResponse<Item>>('/api/items/')
 *       return response.data.results
 *     },
 *
 *     // Option 2: Return full pagination (when you need count/next/previous)
 *     listPaginated: async (page?: number) => {
 *       const response = await api.get<PaginatedResponse<Item>>('/api/items/', { params: { page } })
 *       return response.data
 *     },
 *   }
 *
 * ❌ NEVER define your own API_BASE_URL - import from here if needed:
 *   import { API_BASE_URL } from './api'
 *
 * Uses relative URLs by default (works with Vite proxy).
 * Set VITE_API_URL in .env only if you need a full URL.
 */
import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'

// Use env variable if set, otherwise use relative URLs (proxy handles routing)
// Export for services that need the base URL (rare - prefer using the api instance)
export const API_BASE_URL = import.meta.env.VITE_API_URL || ''

/**
 * Django REST Framework paginated response shape.
 * All list endpoints return this format by default.
 */
export interface PaginatedResponse<T> {
  count: number          // Total number of items across all pages
  next: string | null    // URL to next page, or null if last page
  previous: string | null // URL to previous page, or null if first page
  results: T[]           // Items for current page
}

/**
 * Billing denial reasons returned in 402 Payment Required responses.
 * Maps to backend BillingDenialReason enum.
 */
export const BillingDenialReason = {
  INSUFFICIENT_CREDITS: 'insufficient_credits',
  SUBSCRIPTION_REQUIRED: 'subscription_required',
} as const

export type BillingDenialReason = (typeof BillingDenialReason)[keyof typeof BillingDenialReason]

/**
 * Entity responsible for billing failure in 402 responses.
 * Maps to backend BillingEntity enum.
 */
export const BillingEntity = {
  OWNER: 'owner',       // App owner (org) lacks credits
  END_USER: 'end_user', // UGA end-user lacks credits/subscription
} as const

export type BillingEntity = (typeof BillingEntity)[keyof typeof BillingEntity]

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

/**
 * Read a cookie value by name.
 * Used to read Django's non-HttpOnly csrftoken cookie.
 */
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

// Request interceptor: attach CSRF token for state-changing requests
api.interceptors.request.use((config) => {
  if (config.method && !['get', 'head', 'options'].includes(config.method.toLowerCase())) {
    const csrfToken = getCookie('csrftoken')
    if (csrfToken) {
      config.headers['X-CSRFToken'] = csrfToken
    }
  }
  return config
})

// Token refresh state — shared across all concurrent requests
let isRefreshing = false
let refreshQueue: Array<{ resolve: () => void; reject: (err: unknown) => void }> = []

function processQueue(success: boolean, error?: unknown) {
  refreshQueue.forEach(({ resolve, reject }) => (success ? resolve() : reject(error)))
  refreshQueue = []
}

// Response interceptor: handle 402 billing errors and auto-refresh access token on 401
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    // Handle 402 Payment Required — redirect to pricing page for subscription-based apps
    if (axios.isAxiosError(error) && error.response?.status === 402) {
      const reason = error.response.data?.reason as BillingDenialReason | undefined
      if (reason === BillingDenialReason.SUBSCRIPTION_REQUIRED) {
        window.location.href = '/api/hosted/pricing/'
      }
      return Promise.reject(error)
    }

    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      return Promise.reject(error)
    }

    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    // Don't attempt refresh for auth endpoints (avoid loops) or missing config
    if (
      !originalRequest ||
      originalRequest._retry ||
      originalRequest.url?.startsWith('/api/accounts/auth/')
    ) {
      return Promise.reject(error)
    }

    // If a refresh is already in progress, queue this request
    if (isRefreshing) {
      return new Promise<void>((resolve, reject) => {
        refreshQueue.push({ resolve, reject })
      }).then(() => api(originalRequest))
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      await api.post('/api/accounts/auth/refresh')
      processQueue(true)
      return api(originalRequest)
    } catch (refreshError) {
      processQueue(false, refreshError)
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

/**
 * Extract error message from various error formats
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    // DRF error format
    const data = error.response?.data
    if (typeof data === 'string') return data
    if (data?.detail) return data.detail
    if (data?.message) return data.message
    if (data?.non_field_errors) return data.non_field_errors[0]
    // Field errors
    if (typeof data === 'object') {
      const firstKey = Object.keys(data)[0]
      if (firstKey && Array.isArray(data[firstKey])) {
        return `${firstKey}: ${data[firstKey][0]}`
      }
    }
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred'
}

/**
 * Fetch all pages from a paginated endpoint.
 * Use sparingly - prefer pagination UI for large datasets.
 *
 * @example
 * const allItems = await fetchAllPages<Item>('/api/items/')
 */
export async function fetchAllPages<T>(url: string): Promise<T[]> {
  const allResults: T[] = []
  let nextUrl: string | null = url

  while (nextUrl !== null) {
    const response: { data: PaginatedResponse<T> } = await api.get<PaginatedResponse<T>>(nextUrl)
    allResults.push(...response.data.results)
    nextUrl = response.data.next
  }

  return allResults
}

