/**
 * MCP Chat Client — connects to the MCP HTTP server and orchestrates
 * tool calls through an LLM (Anthropic Claude or OpenAI).
 *
 * This is a browser ES module loaded by index.html.
 */

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

interface McpTool {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}

interface LlmTool {
    name: string;
    description?: string;
    input_schema?: Record<string, unknown>;
}

interface McpToolCallResult {
    content?: Array<{ text: string }>;
    isError?: boolean;
}

interface JsonRpcResponse {
    jsonrpc: string;
    id?: number;
    result?: Record<string, unknown>;
    error?: { message?: string };
}

type LlmProvider = 'anthropic' | 'openai';

interface LlmOrchestratorConfig {
    provider: LlmProvider;
    apiKey: string;
    mcpClient: McpClient;
    model?: string;
    enviaToken?: string;
}

interface ToolCall {
    id: string;
    name: string;
    args: Record<string, unknown>;
}

interface LlmResponse {
    text: string;
    toolCalls: ToolCall[];
    raw: unknown;
    rawMessage: unknown;
}

interface ToolResult {
    id: string;
    name: string;
    result: string;
    isError: boolean;
}

type OnToolCallFn = (name: string, args: Record<string, unknown>) => void;
type OnDebugFn = (tag: string, title: string, data: unknown) => void;

interface AnthropicContentBlock {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
}

interface AnthropicResponse {
    content: AnthropicContentBlock[];
}

interface OpenAiToolCall {
    id: string;
    function: { name: string; arguments: string };
}

interface OpenAiMessage {
    content: string | null;
    tool_calls?: OpenAiToolCall[];
    role: string;
}

interface OpenAiResponse {
    choices: Array<{ message: OpenAiMessage }>;
}

// ═══════════════════════════════════════════════════════════════════════
// MCP Transport
// ═══════════════════════════════════════════════════════════════════════

export class McpClient {
    private baseUrl: string;
    private sessionId: string | null;
    private nextId: number;
    public tools: McpTool[];

    /** @param baseUrl — e.g. "http://localhost:3100" */
    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.sessionId = null;
        this.nextId = 1;
        this.tools = [];
    }

    /** Build common headers for MCP requests */
    private _headers(): Record<string, string> {
        const h: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
        };
        if (this.sessionId) h['mcp-session-id'] = this.sessionId;
        return h;
    }

    /** Send a JSON-RPC request (has id, expects a response) */
    private async _rpc(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        const id = this.nextId++;

        const res = await fetch(`${this.baseUrl}/mcp`, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        });

        const sid = res.headers.get('mcp-session-id');
        if (sid) this.sessionId = sid;

        const contentType = res.headers.get('content-type') ?? '';

        if (contentType.includes('text/event-stream')) {
            const text = await res.text();
            const lines = text.split('\n');
            let lastData: string | null = null;
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    lastData = line.slice(6);
                }
            }
            if (lastData) {
                const parsed = JSON.parse(lastData) as JsonRpcResponse;
                if (parsed.error) throw new Error(parsed.error.message ?? JSON.stringify(parsed.error));
                return parsed.result ?? {};
            }
            throw new Error('No data in SSE response');
        }

        const json = (await res.json()) as JsonRpcResponse;
        if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
        return json.result ?? {};
    }

    /** Send a JSON-RPC notification (no id, fire-and-forget) */
    private async _notify(method: string, params: Record<string, unknown> = {}): Promise<void> {
        const res = await fetch(`${this.baseUrl}/mcp`, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify({ jsonrpc: '2.0', method, params }),
        });

        const sid = res.headers.get('mcp-session-id');
        if (sid) this.sessionId = sid;
    }

    /** Initialize the MCP session and fetch available tools */
    async connect(): Promise<Record<string, unknown>> {
        const result = await this._rpc('initialize', {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'envia-chat', version: '1.0.0' },
        });

        await this._notify('notifications/initialized', {});

        const toolsResult = await this._rpc('tools/list', {});
        this.tools = (toolsResult['tools'] as McpTool[] | undefined) ?? [];

        return result;
    }

    /** Call an MCP tool */
    async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolCallResult> {
        return this._rpc('tools/call', { name, arguments: args }) as Promise<McpToolCallResult>;
    }

    /** Clean up the session */
    async disconnect(): Promise<void> {
        if (!this.sessionId) return;
        try {
            await fetch(`${this.baseUrl}/mcp`, {
                method: 'DELETE',
                headers: { 'mcp-session-id': this.sessionId },
            });
        } catch {
            /* ignore */
        }
        this.sessionId = null;
    }

    /**
     * Get tools formatted for LLM consumption.
     * Strips the `api_key` property from schemas so the LLM never
     * sees or attempts to fill it — the orchestrator injects it at call time.
     */
    getToolsForLLM(): LlmTool[] {
        return this.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: McpClient._stripApiKey(t.inputSchema),
        }));
    }

    /** Remove `api_key` from a JSON Schema properties object and required array. */
    static _stripApiKey(schema?: Record<string, unknown>): Record<string, unknown> | undefined {
        if (!schema) return schema;

        const copy = { ...schema };
        const props = copy['properties'] as Record<string, unknown> | undefined;
        if (props && 'api_key' in props) {
            const { api_key: _, ...rest } = props;
            copy['properties'] = rest;
        }

        const required = copy['required'];
        if (Array.isArray(required)) {
            copy['required'] = (required as string[]).filter((r) => r !== 'api_key');
        }

        return copy;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// LLM Orchestrator
// ═══════════════════════════════════════════════════════════════════════

export class LLMOrchestrator {
    private provider: LlmProvider;
    private apiKey: string;
    private mcpClient: McpClient;
    private model: string;
    private messages: Array<Record<string, unknown>>;
    private enviaToken: string | undefined;

    constructor(config: LlmOrchestratorConfig) {
        this.provider = config.provider;
        this.apiKey = config.apiKey;
        this.mcpClient = config.mcpClient;
        this.model = config.model ?? (config.provider === 'anthropic' ? 'claude-sonnet-4-5-20250929' : 'gpt-4o');
        this.messages = [];
        this.enviaToken = config.enviaToken;
    }

    /**
     * Process a user message through the LLM with MCP tool calling.
     * Loops up to 10 turns to resolve tool calls before returning a final text response.
     */
    async chat(userMessage: string, onToolCall?: OnToolCallFn, onDebug?: OnDebugFn): Promise<string> {
        const debug: OnDebugFn = onDebug ?? (() => {});
        this.messages.push({ role: 'user', content: userMessage });

        const tools = this.mcpClient.getToolsForLLM();
        let response: LlmResponse | undefined;

        for (let turns = 0; turns < 10; turns++) {
            debug('llm-req', `Turn ${turns + 1} → ${this.provider} (${this.model})`, {
                model: this.model,
                messages: this.messages,
                tools_count: tools.length,
                tool_names: tools.map((t) => t.name),
            });

            if (this.provider === 'anthropic') {
                response = await this._callAnthropic(tools);
            } else {
                response = await this._callOpenAI(tools);
            }

            debug(
                'llm-resp',
                response.toolCalls.length > 0
                    ? `${response.toolCalls.length} tool call(s): ${response.toolCalls.map((t) => t.name).join(', ')}`
                    : 'Text response (no tool calls)',
                { text: response.text, toolCalls: response.toolCalls },
            );

            if (response.toolCalls.length === 0) {
                this.messages.push({ role: 'assistant', content: response.text });
                return response.text;
            }

            const toolResults: ToolResult[] = [];
            for (const tc of response.toolCalls) {
                const { api_key: _stripped, ...displayArgs } = tc.args;
                if (onToolCall) onToolCall(tc.name, displayArgs);
                const callArgs = this.enviaToken
                    ? { ...tc.args, api_key: this.enviaToken }
                    : tc.args;
                debug('mcp-call', `${tc.name}()`, displayArgs);
                try {
                    const result = await this.mcpClient.callTool(tc.name, callArgs);
                    const text = result.content?.map((c) => c.text).join('\n') ?? JSON.stringify(result);
                    toolResults.push({ id: tc.id, name: tc.name, result: text, isError: result.isError ?? false });
                    debug('mcp-resp', `${tc.name} → ${result.isError ? 'ERROR' : 'OK'} (${text.length} chars)`, {
                        isError: result.isError ?? false,
                        content: result.content,
                    });
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    toolResults.push({ id: tc.id, name: tc.name, result: `Error: ${message}`, isError: true });
                    debug('error', `${tc.name} threw`, message);
                }
            }

            if (this.provider === 'anthropic') {
                this.messages.push({ role: 'assistant', content: response.raw });
                this.messages.push({
                    role: 'user',
                    content: toolResults.map((tr) => ({
                        type: 'tool_result',
                        tool_use_id: tr.id,
                        content: tr.result,
                        is_error: tr.isError,
                    })),
                });
            } else {
                this.messages.push(response.rawMessage as Record<string, unknown>);
                for (const tr of toolResults) {
                    this.messages.push({
                        role: 'tool',
                        tool_call_id: tr.id,
                        content: tr.result,
                    });
                }
            }
        }

        return response?.text ?? 'Max tool call iterations reached.';
    }

    /** Call the Anthropic Messages API */
    private async _callAnthropic(tools: LlmTool[]): Promise<LlmResponse> {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: 4096,
                system:
                    'You are a helpful shipping assistant using the Envia API. You help users quote, create, track, ' +
                    'and manage shipments. Respond in the same language the user writes in. / Eres un asistente de ' +
                    'envíos que ayuda a cotizar, crear, rastrear y gestionar envíos con la API de Envia. Responde ' +
                    'en el mismo idioma que el usuario.',
                messages: this.messages,
                tools: tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    input_schema: t.input_schema,
                })),
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Anthropic API error ${res.status}: ${err}`);
        }

        const data = (await res.json()) as AnthropicResponse;
        const textBlocks = data.content.filter((b) => b.type === 'text');
        const toolBlocks = data.content.filter((b) => b.type === 'tool_use');

        return {
            text: textBlocks.map((b) => b.text ?? '').join('\n'),
            toolCalls: toolBlocks.map((b) => ({ id: b.id!, name: b.name!, args: b.input ?? {} })),
            raw: data.content,
            rawMessage: null,
        };
    }

    /** Call the OpenAI Chat Completions API */
    private async _callOpenAI(tools: LlmTool[]): Promise<LlmResponse> {
        const openaiMessages = this.messages.map((m) => {
            if (m['role'] === 'user' && Array.isArray(m['content']) && (m['content'] as Array<Record<string, unknown>>)[0]?.['type'] === 'tool_result') {
                return { role: 'user', content: JSON.stringify(m['content']) };
            }
            return m;
        });

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a helpful shipping assistant using the Envia API. You help users quote, create, ' +
                            'track, and manage shipments. Respond in the same language the user writes in.',
                    },
                    ...openaiMessages,
                ],
                tools: tools.map((t) => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.input_schema,
                    },
                })),
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`OpenAI API error ${res.status}: ${err}`);
        }

        const data = (await res.json()) as OpenAiResponse;
        const choice = data.choices[0];
        const msg = choice.message;

        const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        }));

        return {
            text: msg.content ?? '',
            toolCalls,
            raw: null,
            rawMessage: msg,
        };
    }
}
