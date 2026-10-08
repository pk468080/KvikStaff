import json
with open('final_table.json', 'r') as f:
    functions = json.load(f)
for f in functions:
    if f['executable_by_anon'] and f['schema'] == 'public':
        print(f['name'])
