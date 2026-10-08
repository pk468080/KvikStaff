import json

with open('final_table.json', 'r') as f:
    functions = json.load(f)

risk_order = {"Critical": 0, "High": 1, "Medium": 2, "Low/Info": 3}
functions.sort(key=lambda x: (risk_order.get(x['risk'], 4), x['name']))

print("| Function | Signature | Caller | Auth check | Ownership check | Mutates data | Risk | Recommendation |")
print("|---|---|---|---|---|---|---|---|")
for f in functions:
    if f['name'] == 'st_estimatedextent': continue
    if f['schema'] != 'public': continue
    print(f"| {f['name']} | `{f['signature']}` | {f['callers']} | {f['auth_check']} | {f['ownership_check']} | {f['mutates_data']} | {f['risk']} | {f['recommendation']} |")
