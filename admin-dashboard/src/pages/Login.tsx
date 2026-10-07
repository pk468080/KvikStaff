import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()

    setLoading(true)
    setError('')

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

      if (loginError) {
        throw loginError
      }

      if (!data.user) {
        throw new Error('Unable to sign in.')
      }

      // Check the user's profile.
      const { data: profile, error: profileError } =
        await supabase
          .from('profiles')
          .select('id, role, is_active')
          .eq('id', data.user.id)
          .maybeSingle()

      if (profileError) {
        throw profileError
      }

      if (!profile) {
        await supabase.auth.signOut()
        throw new Error(
          'No profile was found for this account.'
        )
      }

      if (profile.is_active !== true) {
        await supabase.auth.signOut()
        throw new Error(
          'This account is inactive.'
        )
      }

      if (profile.role !== 'admin') {
        await supabase.auth.signOut()
        throw new Error(
          'Access denied. This account is not an administrator.'
        )
      }

      navigate('/dashboard', {
        replace: true,
      })
    } catch (err) {
      console.error(
        '[Admin Login] Login failed:',
        err
      )

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to sign in.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <form
        onSubmit={handleLogin}
        style={styles.card}
      >
        <h1 style={styles.title}>
          TempStaff Admin
        </h1>

        <p style={styles.subtitle}>
          Administration Dashboard
        </p>

        {error && (
          <div style={styles.error}>
            {error}
          </div>
        )}

        <label style={styles.label}>
          Email
        </label>

        <input
          style={styles.input}
          type="email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
          placeholder="Admin email"
          autoComplete="email"
          required
        />

        <label style={styles.label}>
          Password
        </label>

        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          placeholder="Password"
          autoComplete="current-password"
          required
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            ...styles.button,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading
            ? 'Signing in...'
            : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

const styles: Record<
  string,
  React.CSSProperties
> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f7fb',
    padding: 20,
  },

  card: {
    width: 400,
    maxWidth: '100%',
    padding: 32,
    background: '#ffffff',
    borderRadius: 12,
    boxShadow:
      '0 10px 30px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },

  title: {
    margin: 0,
  },

  subtitle: {
    color: '#666',
    marginTop: 0,
    marginBottom: 15,
  },

  label: {
    fontWeight: 600,
    marginTop: 5,
  },

  input: {
    padding: 12,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 15,
  },

  button: {
    marginTop: 10,
    padding: 12,
    border: 'none',
    borderRadius: 6,
    background: '#111827',
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },

  error: {
    padding: 10,
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 6,
  },
}