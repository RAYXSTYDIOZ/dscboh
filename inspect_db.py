import sqlite3
try:
    conn = sqlite3.connect('bot_memory.db')
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print("Tables:", tables)
    for table_name in [t[0] for t in tables]:
        cursor.execute(f"PRAGMA table_info({table_name});")
        print(f"Schema for {table_name}:", cursor.fetchall())
    conn.close()
except Exception as e:
    print("Error:", e)
