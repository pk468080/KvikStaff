import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return response({ error: 'Method not allowed.' }, 405)
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return response({ error: 'Supabase environment variables are missing.' }, 500)
    const authorization = req.headers.get('Authorization')
    if (!authorization) return response({ error: 'Authorization header is required.' }, 401)

    const supabase = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authorization } } })
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return response({ error: 'Unauthorized.' }, 401)

    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const bookingId = body?.bookingId ? String(body.bookingId).trim() : ''
    const occurrenceId = body?.occurrenceId ? String(body.occurrenceId).trim() : ''
    const otp = body?.otp ? String(body.otp).trim() : ''
    const otpType = body?.otpType ? String(body.otpType).trim().toLowerCase() : ''
    if (!bookingId || !otp || !otpType) return response({ error: 'bookingId, otp and otpType are required.' }, 400)
    if (otpType !== 'start' && otpType !== 'end') return response({ error: 'otpType must be "start" or "end".' }, 400)
    if (!/^\d{6}$/.test(otp)) return response({ error: 'OTP must be a 6-digit number.' }, 400)

    const otpHash = await sha256(otp)
    const rpc = occurrenceId ? 'verify_booking_occurrence_otp_atomic' : 'verify_booking_otp_atomic'
    const params = occurrenceId
      ? { p_occurrence_id: occurrenceId, p_otp_type: otpType, p_otp_hash: otpHash }
      : { p_booking_id: bookingId, p_otp_type: otpType, p_otp_hash: otpHash }
    const { data: result, error: rpcError } = await supabase.rpc(rpc, params)
    if (rpcError) {
      console.error('[verify-booking-otp] RPC error:', rpcError.message)
      return response({ error: 'Unable to verify OTP.' }, 500)
    }
    if (!result || result.success !== true) return response({ error: result?.error || 'OTP verification failed.' }, 400)
    return response({
      success: true, booking_id: bookingId, occurrence_id: occurrenceId || result.occurrence_id || null,
      otp_type: otpType, status: result.status, booking_completed: result.booking_completed === true,
    })
  } catch (error) {
    console.error('[verify-booking-otp]', error)
    return response({ error: error instanceof Error ? error.message : 'Internal server error.' }, 500)
  }
})