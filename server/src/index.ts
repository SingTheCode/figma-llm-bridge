import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketBridge } from './ws-bridge.js';
import { createMcpServer } from './mcp-server.js';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HUB_PORT = 3056;

function isHubRunning(): Promise<boolean> {
    return new Promise((resolve) => {
        const sock = createConnection({ port: HUB_PORT, host: '127.0.0.1' });
        sock.once('connect', () => {
            sock.destroy();
            resolve(true);
        });
        sock.once('error', () => {
            resolve(false);
        });
    });
}

function startHub(): void {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const hubPath = join(__dirname, 'hub.js');

    const child = spawn('node', [hubPath], {
        detached: true,
        stdio: 'ignore',
    });
    child.unref();
    console.error(`[Main] Started hub process (PID: ${child.pid})`);
}

async function ensureHub(): Promise<void> {
    if (await isHubRunning()) {
        console.error('[Main] Hub already running');
        return;
    }

    startHub();
    for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 300));
        if (await isHubRunning()) return;
    }
    throw new Error('Hub failed to start within 3s');
}

async function main(): Promise<void> {
    await ensureHub();

    const bridge = await WebSocketBridge.create();
    const mcpServer = createMcpServer(bridge);
    const transport = new StdioServerTransport();

    console.error('[Main] Starting MCP server on stdio transport...');
    await mcpServer.connect(transport);
    console.error('[Main] MCP server connected and ready');

    const shutdown = () => {
        console.error('[Main] Shutting down...');
        bridge.close();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    console.error('[Main] Fatal error:', err);
    process.exit(1);
});
