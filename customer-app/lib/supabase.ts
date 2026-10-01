import {
  AppState,
  Platform,
} from 'react-native'

import 'react-native-url-polyfill/auto'

if (
  !process.env.JEST_WORKER_ID &&
  Platform.OS !== 'web' &&
  typeof globalThis.localStorage === 'undefined'
) {
  require('expo-sqlite/localStorage/install')
}

import {
  createClient,
} from '@supabase/supabase-js'

import type {
  Database,
} from '../types/database'

const isTestEnvironment = Boolean(process.env.JEST_WORKER_ID)

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  (isTestEnvironment ? 'https://example.supabase.co' : undefined)

const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  (isTestEnvironment ? 'test-publishable-key' : undefined)

if (!supabaseUrl && !isTestEnvironment) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL',
  )
}

if (!supabasePublishableKey && !isTestEnvironment) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  )
}

const storage =
  typeof localStorage !== 'undefined'
    ? localStorage
    : undefined

export const supabase =
  createClient<Database>(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    },
  )

/*
 * On native platforms, keep Supabase session refresh
 * active while the app is in the foreground and stop
 * it while the app is backgrounded.
 *
 * This listener is intentionally registered once.
 */
if (
  Platform.OS !== 'web' &&
  !process.env.JEST_WORKER_ID
) {
  AppState.addEventListener(
    'change',
    nextAppState => {
      if (
        nextAppState ===
        'active'
      ) {
        supabase.auth.startAutoRefresh()
      } else {
        supabase.auth.stopAutoRefresh()
      }
    },
  )
}