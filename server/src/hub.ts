import { WebSocketServer, WebSocket } from 'ws';

/**
 * Hub — 싱글턴 프로세스.
 * - 포트 3055: Figma 플러그인이 연결
 * - 포트 3056: MCP 서버 클라이언트들이 연결
 *
 * MCP 클라이언트 → hub → 플러그인 → hub → 해당 MCP 클라이언트로 응답 라우팅
 */

const PLUGIN_PORT = 3055;
const CLIENT_PORT = 3056;
const HEARTBEAT_INTERVAL_MS = 30_000;

let pluginSocket: WebSocket | null = null;
const mcpClients = new Set<WebSocket>();
const requestOrigin = new Map<string, WebSocket>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

const pluginWss = new WebSocketServer({ port: PLUGIN_PORT });

pluginWss.on('listening', () => {
    console.error(`[Hub] Plugin WS listening on port ${PLUGIN_PORT}`);
});

pluginWss.on('connection', (ws) => {
    if (pluginSocket) {
        console.error('[Hub] Replacing existing plugin connection');
        pluginSocket.close();
    }

    pluginSocket = ws;
    startHeartbeat(ws);
    console.error('[Hub] Figma plugin connected');

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            const requestId = msg.requestId as string;
            const origin = requestOrigin.get(requestId);

            if (origin && origin.readyState === WebSocket.OPEN) {
                origin.send(raw.toString());
            }
            requestOrigin.delete(requestId);
        } catch {
            console.error('[Hub] Failed to parse plugin message');
        }
    });

    ws.on('close', () => {
        console.error('[Hub] Figma plugin disconnected');
        stopHeartbeat();
        if (pluginSocket === ws) {
            pluginSocket = null;
        }
        for (const [requestId, client] of requestOrigin) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    requestId,
                    success: false,
                    error: 'Plugin disconnected',
                }));
            }
        }
        requestOrigin.clear();
    });

    ws.on('error', (err) => {
        console.error('[Hub] Plugin socket error:', err.message);
    });
});

const clientWss = new WebSocketServer({ port: CLIENT_PORT });

clientWss.on('listening', () => {
    console.error(`[Hub] MCP client WS listening on port ${CLIENT_PORT}`);
});

clientWss.on('connection', (ws) => {
    mcpClients.add(ws);
    console.error(`[Hub] MCP client connected (total: ${mcpClients.size})`);

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            const requestId = msg.requestId as string;

            if (!pluginSocket || pluginSocket.readyState !== WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    requestId,
                    success: false,
                    error: 'Figma plugin is not connected',
                }));
                return;
            }

            requestOrigin.set(requestId, ws);
            pluginSocket.send(raw.toString());
        } catch {
            console.error('[Hub] Failed to parse MCP client message');
        }
    });

    ws.on('close', () => {
        mcpClients.delete(ws);
        console.error(`[Hub] MCP client disconnected (total: ${mcpClients.size})`);
        for (const [requestId, client] of requestOrigin) {
            if (client === ws) {
                requestOrigin.delete(requestId);
            }
        }
    });

    ws.on('error', (err) => {
        console.error('[Hub] MCP client socket error:', err.message);
    });
});

function startHeartbeat(ws: WebSocket): void {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat(): void {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

function shutdown(): void {
    console.error('[Hub] Shutting down...');
    stopHeartbeat();
    pluginWss.close();
    clientWss.close();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.error('[Hub] Hub process started (PID: ' + process.pid + ')');
