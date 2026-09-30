import {
  AppState,
  Platform,
} from 'react-native'

import 'react-native-url-polyfill/auto'
import 'expo-sqlite/localStorage/install'

import {
  createClient,
} from '@supabase/supabase-js'

import type {
  Database,
} from '../types/database'

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL

const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL',
  )
}

if (!supabasePublishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  )
}

export const supabase =
  createClient<Database>(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: {
        storage: localStorage,
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
if (Platform.OS !== 'web') {
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