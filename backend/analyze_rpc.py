import os
import re
import json

def find_rpc_calls():
    # Regex to find rpc("something") or adminAction("something")
    # Matches .rpc('function_name' or .rpc("function_name" or adminAction('function_name' etc.
    pattern = re.compile(r'(?:\.rpc|adminAction)\s*\(\s*[\'"]([a-zA-Z0-9_]+)[\'"]')
    
    callers = {}
    
    for root, dirs, files in os.walk('..'):
        if 'node_modules' in root or '.venv' in root or '.expo' in root or '.git' in root:
            continue
        for file in files:
            if file.endswith(('.ts', '.tsx', '.js', '.py')):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                        matches = pattern.findall(content)
                        for match in matches:
                            if match not in callers:
                                callers[match] = set()
                            
                            # Categorize caller
                            if 'customer-app' in filepath:
                                callers[match].add('Customer App')
                            elif 'worker-app' in filepath:
                                callers[match].add('Worker App')
                            elif 'admin-dashboard' in filepath:
                                callers[match].add('Admin Dashboard')
                            elif 'backend' in filepath:
                                callers[match].add('FastAPI backend')
                            elif 'supabase/functions' in filepath:
                                callers[match].add('Supabase Edge Function')
                            else:
                                callers[match].add(f'Other ({filepath})')
                except Exception as e:
                    pass
    
    return {k: list(v) for k, v in callers.items()}

callers = find_rpc_calls()

# Read functions.json
with open('functions.json', 'r') as f:
    functions = json.load(f)

# Combine
for func in functions:
    func_name = func['function_name']
    func['callers'] = callers.get(func_name, ['Unknown'])

with open('analysis_output.json', 'w') as f:
    json.dump(functions, f, indent=2)

print("Done generating analysis_output.json")
