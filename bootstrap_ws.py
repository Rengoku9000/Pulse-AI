import os
from pathlib import Path

BASE_DIR = Path("c:/Users/gunda/OneDrive/Desktop/aifusion/backend")

files = {
    "app/ws/__init__.py": "",
    "app/ws/manager.py": """from typing import List
from fastapi import WebSocket
import json
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total active: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending message to socket: {e}")
                dead_connections.append(connection)
                
        for dead in dead_connections:
            self.disconnect(dead)

manager = ConnectionManager()
""",
    "app/routes/ws.py": """from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.ws.manager import manager
from app.auth.security import decode_access_token
from app.database.mongodb import db

router = APIRouter()

@router.websocket("/incidents")
async def websocket_incidents(websocket: WebSocket, token: str = Query(None)):
    if not token:
        await websocket.close(code=1008, reason="Missing token")
        return
        
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        await websocket.close(code=1008, reason="Invalid token")
        return
        
    user = await db.users.find_one({"username": payload.get("sub")})
    if not user:
        await websocket.close(code=1008, reason="User not found")
        return

    await manager.connect(websocket)
    try:
        while True:
            # Wait for messages or ping/pong (mostly to detect disconnects)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
""",
    "app/routes/incidents.py": """from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from datetime import datetime
import asyncio
from app.models.request_models import AnalyzeRequest
from app.models.incident_model import IncidentResponse
from app.database.mongodb import db
from app.services.severity_engine import SeverityEngine
from app.rag.retriever import RAGRetriever
from app.rag.vector_store import vector_store
from app.ai.openai_service import OpenAIService
from app.ws.manager import manager

router = APIRouter()
severity_engine = SeverityEngine()
ai_service = OpenAIService()

@router.get("/", response_model=List[IncidentResponse])
async def list_incidents(
    status: Optional[str] = None, 
    severity: Optional[str] = None, 
    limit: int = Query(20, ge=1, le=100)
):
    query = {}
    if status:
        query["status"] = status
    if severity:
        query["severity"] = severity
    
    cursor = db.incidents.find(query).limit(limit).sort("created_at", -1)
    incidents = await cursor.to_list(length=limit)
    return [IncidentResponse(**doc) for doc in incidents]

@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: str):
    doc = await db.incidents.find_one({"incident_id": incident_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return IncidentResponse(**doc)

@router.post("/analyze", response_model=IncidentResponse)
async def analyze_incident_endpoint(request: AnalyzeRequest):
    severity_result = severity_engine.evaluate(
        request.cpu, request.memory, request.restart_count, request.logs
    )
    
    retriever = RAGRetriever(vector_store)
    retrieved_docs = retriever.retrieve(request.logs)
    
    analysis = await ai_service.analyze_incident(
        service=request.service,
        cpu=request.cpu,
        memory=request.memory,
        restart_count=request.restart_count,
        logs=request.logs,
        severity=severity_result.level.value,
        retrieved_docs=retrieved_docs
    )
    
    incident = IncidentResponse(
        service=request.service,
        cpu_usage=request.cpu,
        memory_usage=request.memory,
        restart_count=request.restart_count,
        logs=request.logs,
        severity=severity_result.level.value,
        root_cause=analysis.get("root_cause"),
        recommendation=analysis.get("recommendation"),
        confidence=analysis.get("confidence"),
        created_at=datetime.utcnow()
    )
    
    await db.incidents.insert_one(incident.dict())
    
    # Broadcast to WebSocket clients without blocking HTTP response
    ws_payload = {
        "event": "new_incident",
        "incident_id": incident.incident_id,
        "severity": incident.severity,
        "summary": incident.root_cause or "Pending analysis"
    }
    asyncio.create_task(manager.broadcast(ws_payload))
    
    return incident

@router.patch("/{incident_id}/resolve", response_model=IncidentResponse)
async def resolve_incident(incident_id: str):
    result = await db.incidents.find_one_and_update(
        {"incident_id": incident_id},
        {"$set": {"status": "RESOLVED"}},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Incident not found")
    return IncidentResponse(**result)

@router.delete("/{incident_id}")
async def delete_incident(incident_id: str):
    result = await db.incidents.delete_one({"incident_id": incident_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"deleted": True}
""",
    "app/main.py": """from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.routes import incidents, chat, metrics, simulate, auth, ws
from app.rag.vector_store import init_vector_store
from app.database.mongodb import MongoDB
from app.utils.logger import app_logger
from app.auth.dependencies import get_current_user

@asynccontextmanager
async def lifespan(app: FastAPI):
    MongoDB.connect()
    app_logger.info("Skipping vector store init (OpenAI quota reached)")
    app_logger.info("Backend ready and serving requests.")
    yield
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
app.include_router(ws.router, prefix="/ws", tags=["websocket"])

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

print("WebSocket layer generated successfully!")
