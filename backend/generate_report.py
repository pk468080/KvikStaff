import json
import re

with open('analysis_output.json', 'r') as f:
    functions = json.load(f)

# Sort functions by name
functions.sort(key=lambda x: x['function_name'])

def assess_function(f):
    def_code = f.get('function_def', '').lower()
    
    # Auth check
    auth_check = 'auth.uid() is null' in def_code or 'auth.role()' in def_code or 'auth.jwt()' in def_code or 'public.is_admin()' in def_code
    
    # Ownership check
    ownership_check = 'where worker_id = auth.uid()' in def_code.replace(' ', '') or \
                      'where customer_id = auth.uid()' in def_code.replace(' ', '') or \
                      'where id = auth.uid()' in def_code.replace(' ', '') or \
                      'v_worker_id = auth.uid()' in def_code or \
                      'v_customer_id = auth.uid()' in def_code or \
                      'worker_id = (select auth.uid())' in def_code or \
                      'customer_id = (select auth.uid())' in def_code or \
                      'where b.customer_id = v_customer_id' in def_code or \
                      'where r.worker_id = v_worker_id' in def_code
    
    # Explicit checks inside the function body
    if 'v_worker_id uuid := (select auth.uid());' in def_code or 'v_customer_id uuid:=auth.uid();' in def_code or 'v_worker_id uuid:=auth.uid()' in def_code:
        # And if there's a where clause using it, it's ownership check
        pass # we'll see if we catch it via regex

    ownership_check = ownership_check or bool(re.search(r'worker_id\s*=\s*v_worker_id', def_code))
    ownership_check = ownership_check or bool(re.search(r'customer_id\s*=\s*v_customer_id', def_code))
    ownership_check = ownership_check or bool(re.search(r'user_id\s*=\s*(?:v_customer_id|v_worker_id|auth\.uid\(\))', def_code))
    
    # Mutates data
    mutates_data = 'insert into' in def_code or 'update ' in def_code or 'delete from' in def_code or 'perform ' in def_code
    
    # Is it service-role only or admin only?
    is_admin_only = 'public.is_admin()' in def_code or 'service_role' in def_code or 'vault.decrypted_secrets' in def_code
    
    # Risk assessment
    risk = "Low/Info"
    recommendation = "Safe/Intentionally exposed"
    
    if not auth_check and not is_admin_only and 'pgbouncer' not in f['schema_name']:
        risk = "Critical"
        recommendation = "Missing authentication check. Anyone can call this."
    elif mutates_data and not ownership_check and not is_admin_only:
        risk = "High"
        recommendation = "Missing ownership authorization. Potential IDOR."
    elif is_admin_only and f['callers'] == ['Unknown']:
        # If it's admin only but no one calls it, maybe it's just backend only.
        pass
        
    return {
        'auth_check': 'Yes' if auth_check else 'No',
        'ownership_check': 'Yes' if ownership_check or is_admin_only else 'No/Unclear',
        'mutates_data': 'Yes' if mutates_data else 'No',
        'risk': risk,
        'recommendation': recommendation,
        'is_admin': is_admin_only
    }

report = []
for f in functions:
    if f['schema_name'] == 'pgbouncer': continue
    a = assess_function(f)
    
    callers = ", ".join(f.get('callers', []))
    
    report.append(f"| {f['function_name']} | `{f['signature']}` | {callers} | {a['auth_check']} | {a['ownership_check']} | {a['mutates_data']} | {a['risk']} | {a['recommendation']} |")

print("\n".join(report))

