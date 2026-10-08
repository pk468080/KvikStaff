import json
import re

with open('analysis_output.json', 'r') as f:
    functions = json.load(f)

functions.sort(key=lambda x: x['function_name'])

def assess_function(f):
    def_code = f.get('function_def', '').lower()
    schema = f.get('schema_name', '')
    name = f.get('function_name', '')
    callers = f.get('callers', [])
    
    if 'returns trigger' in def_code or 'returns event_trigger' in def_code:
        return None
        
    has_auth_uid = 'auth.uid()' in def_code
    has_auth_role = 'auth.role()' in def_code
    has_auth_jwt = 'auth.jwt()' in def_code
    is_admin_check = 'public.is_admin()' in def_code
    
    # Catch coalesce(auth.role(), '') or similar
    is_service_role = False
    if "auth.role()='service_role'" in def_code.replace(" ", "") or \
       "auth.role() <> 'service_role'" in def_code or \
       "jwt()->>'role'='service_role'" in def_code.replace(" ", "") or \
       "role'='service_role'" in def_code.replace(" ", "") or \
       "'service_role'" in def_code and ('auth.role()' in def_code or 'auth.jwt()' in def_code):
        is_service_role = True
        
    has_secret_check = 'vault.decrypted_secrets' in def_code or 'verify_refund_processor_secret' in def_code or 'verify_edge_function_secret' in def_code
    
    auth_check = has_auth_uid or has_auth_role or has_auth_jwt or is_admin_check or has_secret_check or is_service_role
    
    ownership_check = False
    if re.search(r'where\s+(?:b\.)?(?:worker_id|customer_id|id|user_id)\s*=\s*auth\.uid\(\)', def_code):
        ownership_check = True
    if re.search(r'(?:worker_id|customer_id|user_id)\s*=\s*\(select\s+auth\.uid\(\)\)', def_code):
        ownership_check = True
    if bool(re.search(r'v_(?:worker|customer|user)_id\s*(?:uuid)?\s*[:=]+\s*(?:\(\s*select\s+)?auth\.uid\(\)\)?', def_code)):
        if bool(re.search(r'(?:worker_id|customer_id|user_id|requested_by|id)\s*=\s*v_(?:worker|customer|user)_id', def_code)):
            ownership_check = True
            
    if is_admin_check or is_service_role or has_secret_check:
        ownership_check = True
        
    if name == 'admin_review_worker_booking_change_request':
        auth_check = True
        ownership_check = True
        is_admin_check = True
        
    # Check if a function just delegates to another that does checking
    if 'public.admin_execute_' in def_code:
        auth_check = True
        ownership_check = True
        is_admin_check = True

    mutates_data = 'insert into' in def_code or 'update ' in def_code or 'delete from' in def_code or 'perform ' in def_code
    
    executable_by_anon = not auth_check and not is_admin_check and not is_service_role and not has_secret_check
    executable_by_auth = not is_admin_check and not is_service_role and not has_secret_check
    
    if name.startswith('admin_'):
        executable_by_anon = False
        executable_by_auth = False
    
    risk = "Low/Info"
    recommendation = "Safe/Intentionally exposed"
    
    if executable_by_anon:
        risk = "Critical"
        recommendation = "Missing authentication check. Callable by anon."
    elif mutates_data and executable_by_auth and not ownership_check:
        risk = "High"
        recommendation = "Missing ownership check. Potential IDOR."
    elif executable_by_auth and 'refund' in name and not ownership_check:
        risk = "High"
        recommendation = "Missing ownership check on refund function."
    elif 'admin_' not in name and ('status' in def_code and mutates_data) and not ownership_check:
        risk = "Medium"
        recommendation = "State transition might lack strict authorization."
        
    if 'tempstaff_worker_notification_push' in name:
        executable_by_anon = False
        risk = "Low/Info"
        recommendation = "Trigger function, safe."
        
    if 'pgbouncer' in schema:
        return None
        
    caller_str = ", ".join(callers) if callers else "Unknown"
    
    if 'backend' in name.lower() or is_service_role or has_secret_check:
        if not is_admin_check and risk == "Low/Info":
            recommendation = "Safe but should eventually become backend/Edge-only"

    if 'transition_booking_state' in name:
        risk = "High"
        recommendation = "Critical state transition exposed directly via RPC. Needs strict checking."

    return {
        'name': name,
        'schema': schema,
        'signature': f.get('signature', ''),
        'callers': caller_str,
        'auth_check': 'Yes' if auth_check else 'No',
        'ownership_check': 'Yes' if ownership_check else 'No/Unclear',
        'mutates_data': 'Yes' if mutates_data else 'No',
        'risk': risk,
        'recommendation': recommendation,
        'executable_by_anon': executable_by_anon,
        'executable_by_auth': executable_by_auth,
        'is_admin_check': is_admin_check,
        'is_service_role': is_service_role,
        'has_secret_check': has_secret_check
    }

results = []
for f in functions:
    res = assess_function(f)
    if res:
        results.append(res)

with open('final_table.json', 'w') as f:
    json.dump(results, f, indent=2)

