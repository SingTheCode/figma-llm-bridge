declare const __html__: string;

type NodeType = 'RECTANGLE' | 'ELLIPSE' | 'FRAME' | 'TEXT' | 'LINE' | 'COMPONENT';

type FigmaColor = {
    r: number;
    g: number;
    b: number;
};

type PaintInput = string | string[];

type FontInput = {
    family: string;
    style: string;
};

interface BaseCommand {
    requestId?: string;
    type?: string;
    payload?: Record<string, unknown>;
}

interface CreateNodePayload {
    nodeType: NodeType;
    name?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fills?: PaintInput;
    opacity?: number;
    cornerRadius?: number;
    characters?: string;
    fontSize?: number;
    fontName?: FontInput;
    textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
}

interface ReadNodePayload {
    id?: string;
    name?: string;
}

interface UpdateNodePayload {
    id: string;
    name?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fills?: PaintInput;
    opacity?: number;
    cornerRadius?: number;
    characters?: string;
    fontSize?: number;
    fontName?: FontInput;
    textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
}

interface DeleteNodePayload {
    id: string;
}

interface ReadNodeChildrenPayload {
    id: string;
    depth?: number;
}

interface ResponseMessage {
    requestId: string;
    success: boolean;
    data?: unknown;
    error?: string;
}

type SupportedNode = RectangleNode | EllipseNode | FrameNode | TextNode | LineNode | ComponentNode;

const defaultFont: FontName = { family: 'Inter', style: 'Regular' };

figma.showUI(__html__, {
    width: 300,
    height: 200,
    title: 'LLM Bridge',
} as Parameters<typeof figma.showUI>[1]);

figma.ui.onmessage = (message: unknown) => {
    void handleIncomingMessage(message);
};

async function handleIncomingMessage(message: unknown): Promise<void> {
    if (!isBaseCommand(message)) {
        return;
    }

    const command = message;

    try {
        switch (command.type) {
            case 'create_node':
                await handleCreateNode(command.requestId, command.payload);
                break;
            case 'read_node':
                await handleReadNode(command.requestId, command.payload);
                break;
            case 'update_node':
                await handleUpdateNode(command.requestId, command.payload);
                break;
            case 'delete_node':
                await handleDeleteNode(command.requestId, command.payload);
                break;
            case 'get_selection':
                postResponse(command.requestId, true, {
                    selection: figma.currentPage.selection.map((node) => serializeNode(node)),
                });
                break;
            case 'get_page_nodes':
                postResponse(command.requestId, true, {
                    nodes: figma.currentPage.children.map((node) => serializeNode(node)),
                });
                break;
            case 'read_node_children':
                await handleReadNodeChildren(command.requestId, command.payload);
                break;
            default:
                postResponse(command.requestId, false, undefined, `Unsupported command type: ${command.type}`);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown plugin error';
        postResponse(command.requestId, false, undefined, errorMessage);
    }
}

async function handleCreateNode(requestId: string, payload: Record<string, unknown> | undefined): Promise<void> {
    const data = payload as Partial<CreateNodePayload> | undefined;

    if (!data?.nodeType) {
        postResponse(requestId, false, undefined, 'Missing nodeType');
        return;
    }

    const node = createNodeByType(data.nodeType);
    figma.currentPage.appendChild(node);

    await applyNodeProperties(node, {
        name: data.name,
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
        fills: data.fills,
        opacity: data.opacity,
        cornerRadius: data.cornerRadius,
    });

    if (node.type === 'TEXT') {
        await applyTextProperties(node, {
            characters: data.characters,
            fontSize: data.fontSize,
            fontName: data.fontName,
            textAlignHorizontal: data.textAlignHorizontal,
            textAlignVertical: data.textAlignVertical,
        });
    }

    postResponse(requestId, true, { node: serializeNode(node) });
}

async function handleReadNode(requestId: string, payload: Record<string, unknown> | undefined): Promise<void> {
    const data = payload as Partial<ReadNodePayload> | undefined;
    const node = await findNode(data?.id, data?.name);

    if (!node) {
        postResponse(requestId, false, undefined, 'Node not found');
        return;
    }

    postResponse(requestId, true, { node: serializeNode(node) });
}

async function handleUpdateNode(requestId: string, payload: Record<string, unknown> | undefined): Promise<void> {
    const data = payload as Partial<UpdateNodePayload> | undefined;

    if (!data?.id) {
        postResponse(requestId, false, undefined, 'Missing node id');
        return;
    }

    const node = await findNode(data.id);

    if (!node) {
        postResponse(requestId, false, undefined, 'Node not found');
        return;
    }

    await applyNodeProperties(node, {
        name: data.name,
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
        fills: data.fills,
        opacity: data.opacity,
        cornerRadius: data.cornerRadius,
    });

    if (node.type === 'TEXT') {
        await applyTextProperties(node, {
            characters: data.characters,
            fontSize: data.fontSize,
            fontName: data.fontName,
            textAlignHorizontal: data.textAlignHorizontal,
            textAlignVertical: data.textAlignVertical,
        });
    }

    postResponse(requestId, true, { node: serializeNode(node) });
}

async function handleDeleteNode(requestId: string, payload: Record<string, unknown> | undefined): Promise<void> {
    const data = payload as Partial<DeleteNodePayload> | undefined;

    if (!data?.id) {
        postResponse(requestId, false, undefined, 'Missing node id');
        return;
    }

    const node = await findNode(data.id);

    if (!node) {
        postResponse(requestId, false, undefined, 'Node not found');
        return;
    }

    node.remove();
    postResponse(requestId, true, { deleted: true, id: data.id });
}

function createNodeByType(nodeType: NodeType): SupportedNode {
    switch (nodeType) {
        case 'RECTANGLE':
            return figma.createRectangle();
        case 'ELLIPSE':
            return figma.createEllipse();
        case 'FRAME':
            return figma.createFrame();
        case 'TEXT':
            return figma.createText();
        case 'LINE':
            return figma.createLine();
        case 'COMPONENT':
            return figma.createComponent();
        default:
            throw new Error(`Unsupported nodeType: ${nodeType}`);
    }
}

async function applyNodeProperties(
    node: SupportedNode,
    properties: {
        name?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        fills?: PaintInput;
        opacity?: number;
        cornerRadius?: number;
    },
): Promise<void> {
    if (typeof properties.name === 'string') {
        node.name = properties.name;
    }

    if (typeof properties.x === 'number') {
        node.x = properties.x;
    }

    if (typeof properties.y === 'number') {
        node.y = properties.y;
    }

    if (typeof properties.width === 'number' || typeof properties.height === 'number') {
        node.resize(properties.width ?? node.width, properties.height ?? node.height);
    }

    if (typeof properties.fills !== 'undefined') {
        setFills(node, properties.fills);
    }

    if (typeof properties.opacity === 'number') {
        node.opacity = properties.opacity;
    }

    if (typeof properties.cornerRadius === 'number' && 'cornerRadius' in node) {
        node.cornerRadius = properties.cornerRadius;
    }
}

async function applyTextProperties(
    node: TextNode,
    properties: {
        characters?: string;
        fontSize?: number;
        fontName?: FontInput;
        textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
        textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
    },
): Promise<void> {
    const fontName = properties.fontName ?? (node.fontName === figma.mixed ? defaultFont : node.fontName);

    await figma.loadFontAsync(fontName);

    node.fontName = fontName;

    if (typeof properties.fontSize === 'number') {
        node.fontSize = properties.fontSize;
    }

    if (typeof properties.characters === 'string') {
        node.characters = properties.characters;
    }

    if (typeof properties.textAlignHorizontal === 'string') {
        node.textAlignHorizontal = properties.textAlignHorizontal;
    }

    if (typeof properties.textAlignVertical === 'string') {
        node.textAlignVertical = properties.textAlignVertical;
    }
}

async function findNode(id?: string, name?: string): Promise<SceneNode | null> {
    if (typeof id === 'string' && id.length > 0) {
        const byId = await figma.getNodeByIdAsync(id);
        if (byId && byId.type !== 'PAGE') {
            return byId as SceneNode;
        }
    }

    if (typeof name === 'string' && name.length > 0) {
        const byName = figma.currentPage.findOne((node) => node.name === name);
        if (byName && byName.type !== 'PAGE') {
            return byName;
        }
    }

    return null;
}

function serializeNode(node: SceneNode) {
    return {
        id: node.id,
        name: node.name,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        fills: serializeFills(node),
        opacity: node.opacity,
        childrenCount: 'children' in node ? node.children.length : 0,
    };
}

function serializeFills(node: SceneNode): Array<Record<string, unknown>> {
    if (!('fills' in node) || node.fills === figma.mixed || !Array.isArray(node.fills)) {
        return [];
    }

    return node.fills.map((paint) => {
        if (paint.type === 'SOLID') {
            return {
                type: paint.type,
                color: paint.color,
                opacity: paint.opacity,
            };
        }

        return {
            type: paint.type,
        };
    });
}

function setFills(node: SupportedNode, fills: PaintInput): void {
    if (!('fills' in node)) {
        return;
    }

    const value = Array.isArray(fills) ? fills : [fills];
    const paints: SolidPaint[] = value.map((fill) => ({
        type: 'SOLID',
        color: hexToFigmaColor(fill),
        opacity: 1,
    }));

    node.fills = paints;
}

function hexToFigmaColor(hex: string): FigmaColor {
    const normalized = hex.trim().replace(/^#/, '');

    if (normalized.length === 3) {
        const r = normalized[0];
        const g = normalized[1];
        const b = normalized[2];
        return {
            r: parseInt(r + r, 16) / 255,
            g: parseInt(g + g, 16) / 255,
            b: parseInt(b + b, 16) / 255,
        };
    }

    if (normalized.length !== 6) {
        throw new Error(`Invalid hex color: ${hex}`);
    }

    return {
        r: parseInt(normalized.slice(0, 2), 16) / 255,
        g: parseInt(normalized.slice(2, 4), 16) / 255,
        b: parseInt(normalized.slice(4, 6), 16) / 255,
    };
}

function postResponse(requestId: string, success: boolean, data?: unknown, error?: string): void {
    const response: ResponseMessage = {
        requestId,
        success,
    };

    if (success && typeof data !== 'undefined') {
        response.data = data;
    }

    if (!success && typeof error === 'string') {
        response.error = error;
    }

    figma.ui.postMessage(response);
}

async function handleReadNodeChildren(requestId: string, payload: Record<string, unknown> | undefined): Promise<void> {
    const data = payload as Partial<ReadNodeChildrenPayload> | undefined;

    if (!data?.id) {
        postResponse(requestId, false, undefined, 'Missing node id');
        return;
    }

    const maxDepth = typeof data.depth === 'number' ? data.depth : 10;
    const node = await findNode(data.id);

    if (!node) {
        postResponse(requestId, false, undefined, 'Node not found');
        return;
    }

    postResponse(requestId, true, { node: serializeNodeDeep(node, maxDepth, 0) });
}

function serializeNodeDeep(node: SceneNode, maxDepth: number, currentDepth: number): Record<string, unknown> {
    const base: Record<string, unknown> = {
        id: node.id,
        name: node.name,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        fills: serializeFills(node),
        opacity: node.opacity,
    };

    if (node.type === 'TEXT') {
        base.characters = node.characters;
        base.fontSize = node.fontSize !== figma.mixed ? node.fontSize : 'mixed';
    }

    if ('children' in node) {
        base.childrenCount = node.children.length;
        if (currentDepth < maxDepth) {
            base.children = node.children.map((child) => serializeNodeDeep(child, maxDepth, currentDepth + 1));
        }
    } else {
        base.childrenCount = 0;
    }

    return base;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isBaseCommand(value: unknown): value is BaseCommand {
    return isRecord(value) && typeof value.requestId === 'string' && typeof value.type === 'string';
}
