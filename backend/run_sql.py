import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def main():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL").replace("+asyncpg", ""))
    print("Connected!")
    
    # Try fetching worker_presence structure
    res = await conn.fetch("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'worker_presence';")
    for r in res:
        print(dict(r))

    # And bookings
    res = await conn.fetch("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bookings';")
    print("Bookings columns:", [r['column_name'] for r in res])
    
    await conn.close()

asyncio.run(main())
