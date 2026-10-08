import json

with open('final_table.json', 'r') as f:
    results = json.load(f)

# Sort by risk (Critical, High, Medium, Low/Info)
risk_order = {"Critical": 0, "High": 1, "Medium": 2, "Low/Info": 3}
results.sort(key=lambda x: (risk_order.get(x['risk'], 4), x['name']))

print("| Function | Signature | Caller | Auth check | Ownership check | Mutates data | Risk | Recommendation |")
print("|---|---|---|---|---|---|---|---|")
for r in results:
    print(f"| {r['name']} | `{r['signature']}` | {r['callers']} | {r['auth_check']} | {r['ownership_check']} | {r['mutates_data']} | {r['risk']} | {r['recommendation']} |")
