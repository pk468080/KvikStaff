import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def main():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL").replace("+asyncpg", ""))
    
    res = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%worker%';")
    print("Tables:", [r['table_name'] for r in res])
    
    res = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_name = 'worker_locations';")
    print("worker_locations cols:", [r['column_name'] for r in res])
    
    await conn.close()

asyncio.run(main())
