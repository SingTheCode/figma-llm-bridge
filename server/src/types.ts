export type NodeType = 'RECTANGLE' | 'ELLIPSE' | 'FRAME' | 'TEXT' | 'LINE' | 'COMPONENT';

export interface BridgeRequest {
    requestId: string;
    type: 'create_node' | 'read_node' | 'update_node' | 'delete_node' | 'get_selection' | 'get_page_nodes' | 'read_node_children';
    payload: Record<string, unknown>;
}

export interface BridgeResponse {
    requestId: string;
    success: boolean;
    data?: unknown;
    error?: string;
}

export interface PendingRequest {
    resolve: (response: BridgeResponse) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}
