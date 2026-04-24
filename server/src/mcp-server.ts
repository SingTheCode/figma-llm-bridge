import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import crypto from 'node:crypto';
import type { WebSocketBridge } from './ws-bridge.js';
import type { BridgeRequest } from './types.js';

const NODE_TYPES = ['RECTANGLE', 'ELLIPSE', 'FRAME', 'TEXT', 'LINE', 'COMPONENT'] as const;

export function createMcpServer(bridge: WebSocketBridge): McpServer {
    const server = new McpServer({
        name: 'figma-llm-bridge',
        version: '1.0.0',
    });

    function ensureConnected(): string | null {
        if (!bridge.isConnected()) {
            return 'Figma plugin is not connected. Please open the Figma plugin and ensure it is connected to ws://localhost:3055';
        }
        return null;
    }

    function toPluginPayload(type: BridgeRequest['type'], params: Record<string, unknown>): Record<string, unknown> {
        const payload = { ...params };

        if ('fillColor' in payload) {
            payload.fills = payload.fillColor;
            delete payload.fillColor;
        }

        if ('nodeId' in payload) {
            payload.id = payload.nodeId;
            delete payload.nodeId;
        }

        if ('text' in payload) {
            payload.characters = payload.text;
            delete payload.text;
        }

        return payload;
    }

    type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: true };

    async function executeCommand(type: BridgeRequest['type'], params: Record<string, unknown>): Promise<ToolResult> {
        const connErr = ensureConnected();
        if (connErr) {
            return { content: [{ type: 'text', text: connErr }], isError: true };
        }

        try {
            const request: BridgeRequest = {
                requestId: crypto.randomUUID(),
                type,
                payload: toPluginPayload(type, params),
            };
            const response = await bridge.sendCommand(request);
            return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown bridge error';
            return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
        }
    }

    server.tool(
        'create_node',
        'Create a new Figma node on the current page',
        {
            nodeType: z.enum(NODE_TYPES).describe('Type of Figma node to create'),
            name: z.string().optional().describe('Name for the node'),
            x: z.number().optional().default(0).describe('X position'),
            y: z.number().optional().default(0).describe('Y position'),
            width: z.number().optional().default(100).describe('Width of the node'),
            height: z.number().optional().default(100).describe('Height of the node'),
            fillColor: z.string().optional().describe('Fill color in hex format (e.g. #FF0000)'),
            opacity: z.number().min(0).max(1).optional().describe('Opacity from 0 to 1'),
            cornerRadius: z.number().optional().describe('Corner radius for rounded shapes'),
            text: z.string().optional().describe('Text content (for TEXT node type)'),
            fontSize: z.number().optional().describe('Font size (for TEXT node type)'),
            textAlignHorizontal: z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED']).optional().describe('Horizontal text alignment (for TEXT node type)'),
            textAlignVertical: z.enum(['TOP', 'CENTER', 'BOTTOM']).optional().describe('Vertical text alignment (for TEXT node type)'),
        },
        (params) => executeCommand('create_node', params),
    );

    server.tool(
        'read_node',
        'Read a Figma node by ID or name',
        {
            nodeId: z.string().optional().describe('Node ID to look up'),
            name: z.string().optional().describe('Node name to search for'),
        },
        async (params) => {
            if (!params.nodeId && !params.name) {
                return { content: [{ type: 'text' as const, text: 'Either nodeId or name must be provided' }] };
            }
            return executeCommand('read_node', params);
        },
    );

    server.tool(
        'update_node',
        'Update properties of an existing Figma node',
        {
            nodeId: z.string().describe('ID of the node to update'),
            name: z.string().optional().describe('New name for the node'),
            x: z.number().optional().describe('New X position'),
            y: z.number().optional().describe('New Y position'),
            width: z.number().optional().describe('New width'),
            height: z.number().optional().describe('New height'),
            fillColor: z.string().optional().describe('New fill color in hex format'),
            opacity: z.number().min(0).max(1).optional().describe('New opacity from 0 to 1'),
            cornerRadius: z.number().optional().describe('New corner radius'),
            text: z.string().optional().describe('New text content (for TEXT nodes)'),
            fontSize: z.number().optional().describe('New font size (for TEXT nodes)'),
            textAlignHorizontal: z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED']).optional().describe('Horizontal text alignment (for TEXT nodes)'),
            textAlignVertical: z.enum(['TOP', 'CENTER', 'BOTTOM']).optional().describe('Vertical text alignment (for TEXT nodes)'),
        },
        (params) => executeCommand('update_node', params),
    );

    server.tool(
        'delete_node',
        'Delete a Figma node by ID',
        {
            nodeId: z.string().describe('ID of the node to delete'),
        },
        (params) => executeCommand('delete_node', params),
    );

    server.tool(
        'get_selection',
        'Get the currently selected nodes in Figma',
        {},
        () => executeCommand('get_selection', {}),
    );

    server.tool(
        'get_page_nodes',
        'List all top-level nodes on the current Figma page',
        {},
        () => executeCommand('get_page_nodes', {}),
    );

    server.tool(
        'read_node_children',
        'Read a Figma node and all its children recursively (useful for analyzing frame contents)',
        {
            nodeId: z.string().describe('ID of the node to read children from'),
            depth: z.number().optional().default(10).describe('Maximum depth to traverse (default: 10)'),
        },
        (params) => executeCommand('read_node_children', params),
    );

    return server;
}
