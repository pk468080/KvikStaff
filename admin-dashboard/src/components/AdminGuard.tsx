import * as React from 'react'

import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AdminGuard() {
  const location = useLocation()

  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    let mounted = true

    async function checkAdmin() {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (mounted) {
          setAuthorized(false)
          setLoading(false)
        }

        return
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, role, is_active')
        .eq('id', user.id)
        .maybeSingle()

      const isAdmin =
        !error &&
        profile?.id === user.id &&
        profile.role === 'admin' &&
        profile.is_active === true

      if (mounted) {
        setAuthorized(isAdmin)
        setLoading(false)
      }

      if (!isAdmin) {
        await supabase.auth.signOut()
      }
    }

    void checkAdmin()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === 'SIGNED_OUT' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        void checkAdmin()
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div style={styles.loading}>
        Checking administrator access...
      </div>
    )
  }

  if (!authorized) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  return <Outlet />
}

const styles: Record<string, React.CSSProperties> = {
  loading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, sans-serif',
  },
}