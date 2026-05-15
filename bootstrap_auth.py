import os
from pathlib import Path

BASE_DIR = Path("c:/Users/gunda/OneDrive/Desktop/aifusion/backend")

files = {
    "app/models/user_model.py": """from pydantic import BaseModel, EmailStr
from typing import Optional, List

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class APIKeyResponse(BaseModel):
    key: str
    message: str
""",
    "app/auth/__init__.py": "",
    "app/auth/security.py": """import jwt
import secrets
from datetime import datetime, timedelta
from passlib.context import CryptContext
from app.config.settings import settings
import os

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey123")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.PyJWTError:
        return None

def generate_api_key() -> str:
    return secrets.token_urlsafe(32)
""",
    "app/auth/dependencies.py": """from fastapi import Depends, HTTPException, Security, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader
from app.auth.security import decode_access_token, verify_password
from app.database.mongodb import db

security_bearer = HTTPBearer(auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def get_current_user(
    request: Request,
    bearer: HTTPAuthorizationCredentials = Depends(security_bearer),
    api_key: str = Depends(api_key_header)
):
    if not bearer and not api_key:
        raise HTTPException(status_code=401, detail="Not authenticated. Provide Bearer token or X-API-Key.")

    # 1. Try API Key Auth
    if api_key:
        # Search all users to verify API key hash (in production, you'd index keys differently)
        users = await db.users.find({}).to_list(length=1000)
        for user in users:
            hashed_keys = user.get("api_keys", [])
            for hkey in hashed_keys:
                if verify_password(api_key, hkey):
                    return user
        if not bearer:
            raise HTTPException(status_code=401, detail="Invalid API Key")

    # 2. Try JWT Auth
    if bearer:
        payload = decode_access_token(bearer.credentials)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
            
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token payload")
            
        user = await db.users.find_one({"username": username})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
            
        return user
        
    raise HTTPException(status_code=401, detail="Authentication failed")
""",
    "app/routes/auth.py": """from fastapi import APIRouter, HTTPException, Depends
from app.models.user_model import UserCreate, UserLogin, Token, APIKeyResponse
from app.auth.security import get_password_hash, verify_password, create_access_token, generate_api_key
from app.auth.dependencies import get_current_user
from app.database.mongodb import db

router = APIRouter()

@router.post("/register")
async def register(user: UserCreate):
    existing = await db.users.find_one({"username": user.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already registered")
        
    user_dict = user.dict()
    user_dict["password"] = get_password_hash(user_dict["password"])
    user_dict["api_keys"] = []
    
    await db.users.insert_one(user_dict)
    return {"message": "User registered successfully"}

@router.post("/login", response_model=Token)
async def login(user: UserLogin):
    db_user = await db.users.find_one({"username": user.username})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
        
    access_token = create_access_token(data={"sub": db_user["username"]})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/api-key", response_model=APIKeyResponse)
async def create_api_key(current_user: dict = Depends(get_current_user)):
    # Generate raw key
    raw_key = generate_api_key()
    
    # Hash for storage
    hashed_key = get_password_hash(raw_key)
    
    # Save hash to user
    await db.users.update_one(
        {"username": current_user["username"]},
        {"$push": {"api_keys": hashed_key}}
    )
    
    # Return raw key ONLY once
    return APIKeyResponse(
        key=raw_key,
        message="Please store this API key safely. It will not be shown again."
    )
""",
    "app/main.py": """from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.routes import incidents, chat, metrics, simulate, auth
from app.rag.vector_store import init_vector_store
from app.database.mongodb import MongoDB
from app.utils.logger import app_logger
from app.auth.dependencies import get_current_user

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Connect to MongoDB
    MongoDB.connect()
    
    # 2. Initialize FAISS vector store
    app_logger.info("Skipping vector store init (OpenAI quota reached)")
    # init_vector_store()
    
    # 3. Log Backend ready
    app_logger.info("Backend ready and serving requests.")
    
    yield
    
    # 4. Disconnect MongoDB on shutdown
    MongoDB.disconnect()
    app_logger.info("Backend shutdown complete.")

app = FastAPI(title="AI DevOps Incident Autopilot", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Open routes
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])

# Protected routes
app.include_router(
    incidents.router, 
    prefix="/api/incidents", 
    tags=["incidents"],
    dependencies=[Depends(get_current_user)]
)
app.include_router(
    chat.router, 
    prefix="/api/chat", 
    tags=["chat"],
    dependencies=[Depends(get_current_user)]
)
app.include_router(
    metrics.router, 
    prefix="/api/metrics", 
    tags=["metrics"],
    dependencies=[Depends(get_current_user)]
)
app.include_router(
    simulate.router, 
    prefix="/api/simulate", 
    tags=["simulate"],
    dependencies=[Depends(get_current_user)]
)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
"""
}

for filepath, content in files.items():
    full_path = BASE_DIR / filepath
    full_path.parent.mkdir(parents=True, exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

# Update requirements.txt
req_path = BASE_DIR / "requirements.txt"
with open(req_path, "a") as f:
    f.write("PyJWT\\npasslib[bcrypt]\\n")

print("Auth layer generated successfully!")
