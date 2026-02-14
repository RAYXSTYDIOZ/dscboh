from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import httpx
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import logging
import psutil
import time
from datetime import datetime

# Fix imports for database and brain since they are in the parent directory
BASE_DIR = Path(__file__).parent
sys.path.append(str(BASE_DIR.parent))

from database import db_manager
import brain

load_dotenv()

# Track start time for uptime
START_TIME = time.time()

# Discord Configuration
CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", "http://localhost:8000/callback")
SESSION_SECRET = os.getenv("SESSION_SECRET", "super-secret-prime-key")

app = FastAPI(title="Prime AI Dashboard API")

# Middleware
app.add_middleware(
    SessionMiddleware, 
    secret_key=SESSION_SECRET,
    session_cookie="prime_session",
    same_site="lax",
    https_only=False
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dashboard_server")

@app.get("/")
async def root():
    return FileResponse(BASE_DIR / "index.html")

@app.get("/index.html")
async def index():
    return FileResponse(BASE_DIR / "index.html")

@app.get("/terms.html")
async def terms():
    return FileResponse(BASE_DIR / "terms.html")

@app.get("/privacy.html")
async def privacy():
    return FileResponse(BASE_DIR / "privacy.html")

@app.get("/landing.css")
async def landing_css():
    return FileResponse(BASE_DIR / "landing.css")

@app.get("/logo.png")
async def logo_png():
    return FileResponse(BASE_DIR / "logo.png")

@app.get("/status.html")
async def status_page():
    return FileResponse(BASE_DIR / "status.html")

@app.get("/playground.html")
async def playground_page():
    return FileResponse(BASE_DIR / "playground.html")

@app.get("/dmca.html")
async def dmca_page():
    return FileResponse(BASE_DIR / "dmca.html")

@app.get("/support.html")
async def support_page():
    return FileResponse(BASE_DIR / "support.html")

@app.get("/roadmap.html")
async def roadmap_page():
    return FileResponse(BASE_DIR / "roadmap.html")

@app.get("/coming-soon.html")
async def coming_soon_page():
    return FileResponse(BASE_DIR / "coming-soon.html")

@app.get("/sitemap.html")
async def sitemap_page():
    return FileResponse(BASE_DIR / "sitemap.html")

@app.get("/bmr.html")
async def bmr_page():
    return FileResponse(BASE_DIR / "bmr.html")

@app.get("/login")
async def login(request: Request):
    # Dashboard not ready - return simulated classic server error as requested
    return JSONResponse(
        status_code=422,
        content={
            "detail": [
                {
                    "type": "connection_error",
                    "loc": ["query", "code"],
                    "msg": "cant connected to server",
                    "input": None
                }
            ]
        }
    )

@app.get("/callback")
async def callback(request: Request, code: str):
    if not code:
        raise HTTPException(status_code=400, detail="Missing code")

    async with httpx.AsyncClient() as client:
        # Exchange code for token
        data = {
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        
        response = await client.post("https://discord.com/api/oauth2/token", data=data, headers=headers)
        if response.status_code != 200:
            logger.error(f"Failed to exchange code: {response.text}")
            return JSONResponse({"error": "Failed to login with Discord"}, status_code=response.status_code)
        
        token_data = response.json()
        access_token = token_data.get("access_token")

        # Get user info
        user_headers = {"Authorization": f"Bearer {access_token}"}
        user_response = await client.get("https://discord.com/api/users/@me", headers=user_headers)
        
        if user_response.status_code != 200:
            return JSONResponse({"error": "Failed to fetch user info"}, status_code=user_response.status_code)
        
        user_info = user_response.json()

        # Get user guilds
        guilds_response = await client.get("https://discord.com/api/users/@me/guilds", headers=user_headers)
        guilds = guilds_response.json() if guilds_response.status_code == 200 else []
        
        # Store in session
        request.session["user"] = user_info
        request.session["guilds"] = guilds
        
        # Redirect back to the original page or dashboard
        next_url = request.session.pop("next_url", "/")
        return RedirectResponse(url=next_url)

@app.get("/api/me")
async def get_me(request: Request):
    user = request.session.get("user")
    logger.info(f"Checking auth for session: {user.get('username') if user else 'No user detected'}")
    
    if not user:
        return JSONResponse({"authenticated": False}, status_code=401)
    
    user_id = int(user["id"])
    guilds = request.session.get("guilds", [])
    
    # Enrich with database info
    memory = db_manager.get_user_memory(user_id)
    levels = db_manager.get_levels().get(user_id, {"xp": 0, "level": 0})
    notes = db_manager.get_notes(user_id)
    
    return {
        "authenticated": True,
        "discord": user,
        "guilds": guilds,
        "internal": {
            "memory": memory,
            "levels": levels,
            "notes_count": len(notes)
        }
    }
    
def format_time_ago(dt):
    if not dt: return "unknown"
    if isinstance(dt, str):
        try:
            # Handle standard SQLite/Postgres formats
            clean_dt = dt.split('.')[0] if '.' in dt else dt
            dt = datetime.strptime(clean_dt, "%Y-%m-%d %H:%M:%S")
        except:
            return "just now"
    
    now = datetime.now()
    diff = now - dt
    
    if diff.days > 0:
        return f"{diff.days}d ago"
    hours = diff.seconds // 3600
    if hours > 0:
        return f"{hours}h ago"
    minutes = (diff.seconds % 3600) // 60
    if minutes > 0:
        return f"{minutes}m ago"
    return "just now"

@app.get("/api/stats")
async def get_stats():
    # Real system stats
    process = psutil.Process(os.getpid())
    
    # Calculate uptime
    uptime_seconds = int(time.time() - START_TIME)
    
    # System stats
    cpu_usage = psutil.cpu_percent()
    ram_usage = psutil.virtual_memory().percent
    
    # DB stats
    total_users = 0
    total_commands = 0
    ai_reflections = 0
    vibe_distribution = {}
    activities = []
    
    try:
        with db_manager.get_connection() as conn:
            with db_manager.get_cursor(conn) as cursor:
                # Total users
                cursor.execute('SELECT COUNT(*) FROM user_levels')
                total_users = cursor.fetchone()[0]
                
                # Total commands
                cursor.execute("SELECT COUNT(*) FROM conversation_history WHERE role = 'user' AND content LIKE '!%'")
                total_commands = cursor.fetchone()[0]

                # AI Reflections
                cursor.execute("SELECT COUNT(*) FROM conversation_history WHERE role = 'model'")
                ai_reflections = cursor.fetchone()[0]
                
                # Vibe distribution
                cursor.execute('SELECT vibe, COUNT(*) FROM user_memory GROUP BY vibe')
                vibe_distribution = {str(row[0]): row[1] for row in cursor.fetchall()}

                # LATEST ACTIVITIES
                # 1. Latest AI Vibe Updates
                cursor.execute('SELECT username, vibe, last_updated FROM user_memory ORDER BY last_updated DESC LIMIT 3')
                for row in cursor.fetchall():
                    activities.append({
                        "type": "AI Reflection",
                        "content": f"Updated vibe for <strong>@{row[0]}</strong> to <span class='mention'>'{row[1]}'</span>",
                        "time": format_time_ago(row[2])
                    })

                # 2. Latest Snipe Activity
                cursor.execute('SELECT username, timestamp FROM deleted_messages ORDER BY timestamp DESC LIMIT 2')
                for row in cursor.fetchall():
                    activities.append({
                        "type": "Moderation",
                        "content": f"Sniped a deleted message from <strong>@{row[0]}</strong>.",
                        "time": format_time_ago(row[1])
                    })
    except Exception as e:
        logger.error(f"Error fetching stats from DB: {e}")
    
    # Sort activities by time (optional, they are already grouped)
    return {
        "total_users": total_users,
        "total_commands": total_commands,
        "ai_reflections": ai_reflections,
        "vibe_distribution": vibe_distribution,
        "activities": activities,
        "system_status": "ONLINE",
        "cpu_load": cpu_usage,
        "ram_usage": ram_usage,
        "uptime_seconds": uptime_seconds,
        "process_id": os.getpid()
    }

@app.post("/api/chat")
async def api_chat(request: Request):
    try:
        data = await request.json()
        message = data.get("message", "").strip()
        user_id = data.get("user_id", 999) # Default for playground
        username = data.get("username", "Guest")

        if not message:
            return JSONResponse({"error": "Message is empty"}, status_code=400)

        # Basic command handling for the playground
        if message.startswith("!"):
            cmd = message.split(" ")[0].lower()
            if cmd == "!vibe":
                res = random.choice([
                    "the grid is pulsing with elite energy right now.",
                    "keep your focus sharp. the architecture depends on it.",
                    "current vibe: ultra-silver and high-performance."
                ])
                return {"response": res}
            elif cmd == "!roast":
                target = message.split(" ")[1] if len(message.split(" ")) > 1 else "you"
                res = f"roasting {target}... stay tuned for the burn."
                # Call gemini for a real roast
                prompt = f"Roast this person/thing: {target}. Be savage but elite. No robot talk."
                res = await brain.get_gemini_response(prompt, user_id, username=username)
                return {"response": res}
            elif cmd == "!help":
                return {"response": "Available playground protocols: !vibe, !roast, !help, or just chat naturally with Prime."}

        # Otherwise, regular chat
        response = await brain.get_gemini_response(message, user_id, username=username)
        return {"response": response}

    except Exception as e:
        logger.error(f"Chat API Error: {e}")
        return JSONResponse({"response": "System Error: Failed to process neural link."}, status_code=500)

@app.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/dashboard/index.html")

# Serve the dashboard files
app.mount("/dashboard", StaticFiles(directory=BASE_DIR / "dashboard"), name="dashboard")
app.mount("/assets", StaticFiles(directory=BASE_DIR / "assets"), name="assets")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

