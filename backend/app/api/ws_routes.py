"""
TraceForge - WebSocket Routes

/ws/extension  — Chrome extension connects here to send captured requests
                 and receive mock-rule and recording state updates
/ws/studio     — React Studio frontend connects here to receive live events
                 and control recording / mocking state
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
    - Receives MOCK_RULES_UPDATE and SET_RECORDING messages
    - Extension may also send ping/pong or recording toggle
    """
    await manager.connect(websocket, "extension")
    try:
        # Send current recording status on connect
        await websocket.send_text(json.dumps({
            "type": "SET_RECORDING",
            "recording": manager.is_recording,
        }))

        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type")
                if msg_type == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG"}))
                elif msg_type == "SET_RECORDING":
                    recording = bool(msg.get("recording", True))
                    await manager.set_recording(recording)
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
    - Receives NEW_REQUEST and SENTINEL_ALERT events in real time
    - Receives RECORDING_STATE updates
    - Can send SET_RECORDING to pause/resume capturing
    """
    await manager.connect(websocket, "studio")
    try:
        # Send welcome message with connection status and recording state
        await websocket.send_text(json.dumps({
            "type": "CONNECTED",
            "message": "TraceForge Studio connected",
            "extension_clients": manager.extension_count,
            "is_recording": manager.is_recording,
        }))

        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type")
                if msg_type == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG"}))
                elif msg_type == "SET_RECORDING":
                    recording = bool(msg.get("recording", True))
                    await manager.set_recording(recording)
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, "studio")
