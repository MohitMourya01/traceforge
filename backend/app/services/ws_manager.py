"""
TraceForge - WebSocket Connection Manager
"""

import json
import logging
from typing import Literal
from fastapi import WebSocket

logger = logging.getLogger(__name__)
ClientType = Literal["extension", "studio"]


class ConnectionManager:
    def __init__(self):
        self._extension_clients: list[WebSocket] = []
        self._studio_clients: list[WebSocket] = []
        self._is_recording: bool = True

    @property
    def is_recording(self) -> bool:
        return self._is_recording

    async def connect(self, websocket: WebSocket, client_type: ClientType):
        await websocket.accept()
        if client_type == "extension":
            self._extension_clients.append(websocket)
        else:
            self._studio_clients.append(websocket)

    def disconnect(self, websocket: WebSocket, client_type: ClientType):
        if client_type == "extension":
            self._extension_clients = [c for c in self._extension_clients if c != websocket]
        else:
            self._studio_clients = [c for c in self._studio_clients if c != websocket]

    async def broadcast_to_studio(self, data: dict):
        message = json.dumps(data)
        dead = []
        for client in self._studio_clients:
            try:
                await client.send_text(message)
            except Exception:
                dead.append(client)
        for d in dead:
            if d in self._studio_clients:
                self._studio_clients.remove(d)

    async def broadcast_to_extension(self, data: dict):
        message = json.dumps(data)
        dead = []
        for client in self._extension_clients:
            try:
                await client.send_text(message)
            except Exception:
                dead.append(client)
        for d in dead:
            if d in self._extension_clients:
                self._extension_clients.remove(d)

    async def set_recording(self, recording: bool):
        self._is_recording = recording
        logger.info(f"Capture recording state set to: {recording}")
        await self.broadcast_to_extension({"type": "SET_RECORDING", "recording": recording})
        await self.broadcast_to_studio({"type": "RECORDING_STATE", "recording": recording})

    async def broadcast_sentinel_alert(self, finding: dict, request_info: dict):
        """Push a real-time Sentinel HIGH/MEDIUM finding alert to Studio clients."""
        await self.broadcast_to_studio({
            "type": "SENTINEL_ALERT",
            "severity": finding.get("severity"),
            "rule_id": finding.get("id"),
            "category": finding.get("category"),
            "title": finding.get("title"),
            "evidence": finding.get("evidence", ""),
            "remediation": finding.get("remediation", ""),
            "request": {
                "id": request_info.get("id"),
                "method": request_info.get("method"),
                "url": request_info.get("url"),
                "domain": request_info.get("domain"),
            },
        })

    async def broadcast_mock_rules(self, rules: list[dict]):
        message = json.dumps({"type": "MOCK_RULES_UPDATE", "rules": rules})
        dead = []
        for client in self._extension_clients:
            try:
                await client.send_text(message)
            except Exception:
                dead.append(client)
        for d in dead:
            if d in self._extension_clients:
                self._extension_clients.remove(d)

    @property
    def extension_count(self) -> int:
        return len(self._extension_clients)

    @property
    def studio_count(self) -> int:
        return len(self._studio_clients)


manager = ConnectionManager()
