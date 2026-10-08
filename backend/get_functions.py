import asyncio
import asyncpg
import json

async def main():
    conn = await asyncpg.connect("postgresql://postgres.gfzlsxlevzezfjoaaghb:8097bcf8807@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres")
    
    query = """
    SELECT 
        n.nspname as schema_name,
        p.proname as function_name,
        pg_get_function_identity_arguments(p.oid) as signature,
        p.prosecdef as is_security_definer,
        pg_get_userbyid(p.proowner) as owner,
        p.proconfig as search_path,
        pg_get_functiondef(p.oid) as function_def
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'graphql', 'graphql_public', 'auth', 'storage', 'realtime', 'pgsodium', 'vault', 'extensions')
      AND p.prosecdef = true;
    """
    rows = await conn.fetch(query)
    
    results = []
    for r in rows:
        results.append(dict(r))
        
    print(json.dumps(results, default=str))
    
    await conn.close()

asyncio.run(main())
