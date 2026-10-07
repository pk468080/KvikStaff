import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://gfzlsxlevzezfjoaaghb.supabase.co',
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY
)

const { data, error } = await supabase
  .from('payments')
  .select('*')
  .limit(1)

console.log('DATA:')
console.log(JSON.stringify(data, null, 2))

console.log('ERROR:')
console.log(error)