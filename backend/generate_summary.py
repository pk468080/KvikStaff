import json
with open('final_table.json', 'r') as f:
    functions = json.load(f)

total = len(functions)
anon = len([f for f in functions if f['executable_by_anon'] and f['schema'] == 'public'])
auth = len([f for f in functions if f['executable_by_auth'] and f['schema'] == 'public'])

print(f"Total: {total}")
print(f"Anon: {anon}")
print(f"Auth: {auth}")
