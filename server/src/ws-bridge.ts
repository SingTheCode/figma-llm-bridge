import { WebSocket } from 'ws';
import type { BridgeRequest, BridgeResponse, PendingRequest } from './types.js';

const REQUEST_TIMEOUT_MS = 30_000;
const RECONNECT_DELAY_MS = 3_000;
const HUB_URL = 'ws://localhost:3056';

export class WebSocketBridge {
    private socket: WebSocket | null = null;
    private pendingRequests = new Map<string, PendingRequest>();
    private closed = false;

    private constructor() {}

    static async create(): Promise<WebSocketBridge> {
        const bridge = new WebSocketBridge();
        await bridge.connect();
        return bridge;
    }

    private connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(HUB_URL);
            let resolved = false;

            ws.once('open', () => {
                this.socket = ws;
                resolved = true;
                console.error('[WS Bridge] Connected to hub');
                resolve();
            });

            ws.once('error', (err) => {
                if (!resolved) {
                    reject(new Error(`Failed to connect to hub: ${err.message}`));
                }
            });

            ws.on('message', (raw) => {
                try {
                    const response = JSON.parse(raw.toString()) as BridgeResponse;
                    const pending = this.pendingRequests.get(response.requestId);
                    if (pending) {
                        clearTimeout(pending.timer);
                        this.pendingRequests.delete(response.requestId);
                        pending.resolve(response);
                    }
                } catch {
                    console.error('[WS Bridge] Failed to parse hub message');
                }
            });

            ws.on('close', () => {
                console.error('[WS Bridge] Disconnected from hub');
                this.socket = null;
                this.rejectAllPending('Hub connection lost');
                this.scheduleReconnect();
            });

            ws.on('error', (err) => {
                console.error('[WS Bridge] Socket error:', err.message);
            });
        });
    }

    private scheduleReconnect(): void {
        if (this.closed) return;
        setTimeout(() => {
            if (this.closed) return;
            console.error('[WS Bridge] Reconnecting to hub...');
            this.connect().catch(() => {
                this.scheduleReconnect();
            });
        }, RECONNECT_DELAY_MS);
    }

    isConnected(): boolean {
        return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
    }

    sendCommand(request: BridgeRequest): Promise<BridgeResponse> {
        return new Promise((resolve, reject) => {
            if (!this.isConnected()) {
                reject(new Error('Not connected to hub'));
                return;
            }

            const timer = setTimeout(() => {
                this.pendingRequests.delete(request.requestId);
                reject(new Error(`Request ${request.requestId} timed out after ${REQUEST_TIMEOUT_MS}ms`));
            }, REQUEST_TIMEOUT_MS);

            this.pendingRequests.set(request.requestId, { resolve, reject, timer });

            try {
                this.socket!.send(JSON.stringify(request));
            } catch (err) {
                clearTimeout(timer);
                this.pendingRequests.delete(request.requestId);
                reject(err instanceof Error ? err : new Error('Failed to send message'));
            }
        });
    }

    close(): void {
        this.closed = true;
        this.rejectAllPending('Bridge shutting down');
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    private rejectAllPending(reason: string): void {
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(new Error(reason));
            this.pendingRequests.delete(id);
        }
    }
}
