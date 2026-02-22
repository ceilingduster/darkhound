// TypeScript mirror of backend app/core/events/schema.py

export interface BaseEvent {
  event_type: string;
  session_id?: string | null;
  timestamp: string;
}

// ── Session ───────────────────────────────────────────────────────────────────
export interface SessionCreated extends BaseEvent {
  event_type: 'session.created';
  session_id: string;
  asset_id: string;
  analyst_id: string;
}

export interface SessionStateChanged extends BaseEvent {
  event_type: 'session.state_changed';
  session_id: string;
  from_state: string;
  to_state: string;
  reason: string;
}

export interface SessionTerminated extends BaseEvent {
  event_type: 'session.terminated';
  session_id: string;
  reason: string;
}

// ── SSH ───────────────────────────────────────────────────────────────────────
export interface SshConnecting extends BaseEvent {
  event_type: 'ssh.connecting';
  session_id: string;
  target_host: string;
}

export interface SshConnected extends BaseEvent {
  event_type: 'ssh.connected';
  session_id: string;
  server_fingerprint: string;
}

export interface SshDisconnected extends BaseEvent {
  event_type: 'ssh.disconnected';
  session_id: string;
  reason: string;
}

export interface SshCommandStarted extends BaseEvent {
  event_type: 'ssh.command_started';
  session_id: string;
  command_id: string;
  command: string;
}

export interface SshCommandOutput extends BaseEvent {
  event_type: 'ssh.command_output';
  session_id: string;
  command_id: string;
  chunk: string;
  stream: 'stdout' | 'stderr';
}

export interface SshCommandCompleted extends BaseEvent {
  event_type: 'ssh.command_completed';
  session_id: string;
  command_id: string;
  exit_code: number;
  duration_ms: number;
}

// ── Terminal ──────────────────────────────────────────────────────────────────
export interface TerminalStarted extends BaseEvent {
  event_type: 'terminal.started';
  session_id: string;
  cols: number;
  rows: number;
}

export interface TerminalData extends BaseEvent {
  event_type: 'terminal.data';
  session_id: string;
  data: string; // base64
}

export interface TerminalClosed extends BaseEvent {
  event_type: 'terminal.closed';
  session_id: string;
  reason: string;
}

// ── Hunt ─────────────────────────────────────────────────────────────────────
export interface HuntStarted extends BaseEvent {
  event_type: 'hunt.started';
  session_id: string;
  hunt_id: string;
  module_id: string;
}

export interface HuntStepStarted extends BaseEvent {
  event_type: 'hunt.step_started';
  session_id: string;
  hunt_id: string;
  step_id: string;
  description: string;
}

export interface HuntStepCompleted extends BaseEvent {
  event_type: 'hunt.step_completed';
  session_id: string;
  hunt_id: string;
  step_id: string;
  observations: unknown[];
}

export interface HuntCompleted extends BaseEvent {
  event_type: 'hunt.completed';
  session_id: string;
  hunt_id: string;
  findings_count: number;
}

export interface HuntFailed extends BaseEvent {
  event_type: 'hunt.failed';
  session_id: string;
  hunt_id: string;
  error: string;
}

// ── AI ────────────────────────────────────────────────────────────────────────
export interface AiReasoningStarted extends BaseEvent {
  event_type: 'ai.reasoning_started';
  session_id: string;
  hunt_id: string;
  context_summary: string;
}

export interface AiReasoningChunk extends BaseEvent {
  event_type: 'ai.reasoning_chunk';
  session_id: string;
  hunt_id: string;
  chunk: string;
  state: 'analyzing' | 'concluding' | 'generating';
}

export interface AiReasoningCompleted extends BaseEvent {
  event_type: 'ai.reasoning_completed';
  session_id: string;
  hunt_id: string;
  summary: string;
}

export interface AiFindingGenerated extends BaseEvent {
  event_type: 'ai.finding_generated';
  session_id: string;
  hunt_id: string;
  finding_id: string;
  severity: string;
  title: string;
}

// ── MCP ───────────────────────────────────────────────────────────────────────
export interface McpLookupStarted extends BaseEvent {
  event_type: 'mcp.lookup_started';
  finding_id: string;
  provider: string;
  ioc_type: string;
  ioc_value: string;
}

export interface McpLookupCompleted extends BaseEvent {
  event_type: 'mcp.lookup_completed';
  finding_id: string;
  provider: string;
  result_summary: string;
}

// ── System ────────────────────────────────────────────────────────────────────
export interface SystemError extends BaseEvent {
  event_type: 'system.error';
  component: string;
  error: string;
  severity: string;
}

export interface SystemBackpressure extends BaseEvent {
  event_type: 'system.backpressure';
  component: string;
  queue_depth: number;
  limit: number;
}

export type AnyEvent =
  | SessionCreated | SessionStateChanged | SessionTerminated
  | SshConnecting | SshConnected | SshDisconnected
  | SshCommandStarted | SshCommandOutput | SshCommandCompleted
  | TerminalStarted | TerminalData | TerminalClosed
  | HuntStarted | HuntStepStarted | HuntStepCompleted | HuntCompleted | HuntFailed
  | AiReasoningStarted | AiReasoningChunk | AiReasoningCompleted | AiFindingGenerated
  | McpLookupStarted | McpLookupCompleted
  | SystemError | SystemBackpressure;
