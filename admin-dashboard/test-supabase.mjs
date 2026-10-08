import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gfzlsxlevzezfjoaaghb.supabase.co'
const supabaseKey = 'sb_publishable_j4T7RyebRjwG9C882LE7Og_YqvXCDHN'

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase.from('worker_presence').select('*').limit(1)
  console.log("worker_presence:", error || data)

  const { data: bData, error: bErr } = await supabase.from('bookings').select('*, address:addresses(latitude, longitude)').limit(1)
  console.log("bookings:", bErr || bData)
}

test()
