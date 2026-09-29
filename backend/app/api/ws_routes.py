"""
TraceForge - WebSocket Routes

/ws/extension  — Chrome extension connects here to send captured requests
                 and receive mock-rule updates
/ws/studio     — React Studio frontend connects here to receive live events
"""

import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ws_manager import manager

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/ws/extension")
async def extension_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for Chrome extension clients.
    - Extension connects on startup
    - Receives MOCK_RULES_UPDATE messages
    - Extension may also send ping/pong for liveness
    """
    await manager.connect(websocket, "extension")
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type")
                if msg_type == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG"}))
                else:
                    logger.debug(f"Extension WS message: {msg_type}")
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, "extension")


@router.websocket("/ws/studio")
async def studio_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for React Studio frontend clients.
    - Receives NEW_REQUEST events in real time
    - Receives MOCK_RULES_UPDATE confirmations
    - May send ping/pong for liveness
    """
    await manager.connect(websocket, "studio")
    try:
        # Send welcome message with connection status
        await websocket.send_text(json.dumps({
            "type": "CONNECTED",
            "message": "TraceForge Studio connected",
            "extension_clients": manager.extension_count,
        }))

        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, "studio")
