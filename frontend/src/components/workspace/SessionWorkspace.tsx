import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useHuntStore } from '@/store/hunt';
import { useIntelligenceStore } from '@/store/intelligence';
import { useSessionStore } from '@/store/session';
import { useNotificationStore } from '@/store/notifications';
import { intelligenceApi, sessionsApi, huntsApi } from '@/api/client';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { HuntPanel } from '@/components/hunt/HuntPanel';
import { FindingsPanel } from '@/components/intelligence/FindingsPanel';
import { TimelinePanel } from '@/components/timeline/TimelinePanel';
import { NotificationBar } from '@/components/workspace/NotificationBar';
import type {
  AiReasoningStarted,
  AiReasoningChunk,
  AiReasoningCompleted,
  AiFindingGenerated,
  HuntStarted,
  HuntStepStarted,
  HuntStepCompleted,
  HuntCompleted,
  HuntFailed,
  SessionStateChanged,
} from '@/events/schema';

type Tab = 'terminal' | 'hunt' | 'findings' | 'timeline';

interface SessionWorkspaceProps {
  sessionId: string;
}

const STATE_COLORS: Record<string, string> = {
  INITIALIZING: 'var(--muted-2)',
  CONNECTING: '#e6b450',
  CONNECTED: '#36a3d9',
  RUNNING: '#b8cc52',
  PAUSED: '#e6b450',
  LOCKED: '#ff6a00',
  DISCONNECTED: '#ff3333',
  FAILED: '#ff3333',
  TERMINATED: 'var(--muted-2)',
};

export function SessionWorkspace({ sessionId }: SessionWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<Tab>('hunt');
  const [jumpStepId, setJumpStepId] = useState<string | null>(null);
  const { on, emit, socket } = useSocket({ sessionId });
  const { hunts, activeHuntId, addHunt, updateHunt, appendReasoning, setStepStatus, setActiveHunt, appendOutput } = useHuntStore();
  const { addFinding, updateFinding, appendReportText, setSelectedFinding, setReportStreaming } = useIntelligenceStore();
  const { sessions, updateSession, removeSession } = useSessionStore();
  const { addNotification } = useNotificationStore();
  const [closing, setClosing] = useState(false);
  const [hasTerminalData, setHasTerminalData] = useState(false);

  const session = sessions.find((s) => s.id === sessionId);
  const sessionState = session?.state || 'INITIALIZING';
  const sessionMode = session?.mode || 'ai';
  const assetId = session?.asset_id || '';

  const reportIdFor = (huntId: string) => `ai-report-${huntId}`;

  // Poll session state to catch events missed before WebSocket room join
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      // Small delay to let socket join the room first
      await new Promise((r) => setTimeout(r, 500));
      if (cancelled) return;
      try {
        const res = await sessionsApi.get(sessionId);
        if (!cancelled && res.data.state !== session?.state) {
          updateSession(sessionId, { state: res.data.state as any });
        }
      } catch { /* session may have been terminated */ }
    };
    poll();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Track when terminal receives any data (PTY or hunt output)
  useEffect(() => {
    if (!socket) return;
    const markActive = () => setHasTerminalData(true);
    socket.on('terminal.data', markActive);
    socket.on('hunt.step_started', markActive);
    socket.on('hunt.observation', markActive);
    return () => {
      socket.off('terminal.data', markActive);
      socket.off('hunt.step_started', markActive);
      socket.off('hunt.observation', markActive);
    };
  }, [socket]);

  // Wire Socket.IO events to stores
  useEffect(() => {
    const unsubs = [
      // Session state tracking
      on('session.state_changed', (e) => {
        const ev = e as SessionStateChanged;
        updateSession(ev.session_id, { state: ev.to_state as any });
      }),

      // Session mode tracking
      on('session.mode_changed', (e) => {
        const ev = e as any;
        updateSession(ev.session_id, { mode: ev.to_mode });
      }),

      on('hunt.started', (e) => {
        const ev = e as HuntStarted;
        addHunt({
          id: ev.hunt_id,
          session_id: ev.session_id,
          module_id: ev.module_id,
          run_ai: true,
          status: 'RUNNING',
          steps: [],
          findings_count: 0,
          reasoning_text: '',
          reasoning_state: null,
          error: null,
           outputs: {},
        });
        setActiveHunt(ev.hunt_id);
      }),

      on('hunt.step_started', (e) => {
        const ev = e as HuntStepStarted;
        const hunt = useHuntStore.getState().hunts[ev.hunt_id];
        if (hunt) {
          updateHunt(ev.hunt_id, {
            steps: [
              ...hunt.steps,
              { id: ev.step_id, description: ev.description, status: 'running' },
            ],
          });
        }
        setStepStatus(ev.hunt_id, ev.step_id, 'running');
      }),

      on('hunt.step_completed', (e) => {
        const ev = e as HuntStepCompleted;
        setStepStatus(ev.hunt_id, ev.step_id, 'completed');
      }),

      on('hunt.observation', (e) => {
        const ev = e as any;
        const data = ev.data || {};
        const stepId = data.step_id;
        if (!stepId) return;
        const parts = [] as string[];
        const norm = (s: string) => s.replace(/\r?\n/g, '\r\n');
        if (data.command) parts.push(`\r\n$ ${data.command}\r\n`);
        if (data.stdout) parts.push(norm(String(data.stdout)));
        if (data.stderr) parts.push(`\r\n[stderr]\r\n${norm(String(data.stderr))}`);
        if (typeof data.exit_code === 'number') parts.push(`\r\n[exit ${data.exit_code}]\r\n`);
        appendOutput(ev.hunt_id, stepId, parts.join(''));
      }),

      on('hunt.completed', (e) => {
        const ev = e as HuntCompleted;
        updateHunt(ev.hunt_id, {
          status: 'COMPLETED',
          findings_count: ev.findings_count,
          reasoning_state: null,
        });
      }),

      on('hunt.failed', (e) => {
        const ev = e as HuntFailed;
        updateHunt(ev.hunt_id, { status: 'FAILED', error: ev.error });
      }),

      on('ai.reasoning_started', (e) => {
        const ev = e as AiReasoningStarted;
        const reportId = reportIdFor(ev.hunt_id);
        // Create the AI report finding immediately in the store
        addFinding({
          id: reportId,
          session_id: ev.session_id,
          asset_id: assetId,
          title: 'AI Executive Report',
          severity: 'info',
          confidence: 1,
          status: 'acknowledged',
          sighting_count: 1,
          first_seen: new Date().toISOString(),
          kind: 'ai_report',
          report_text: '',
          report_summary: null,
          stix_bundle: null,
          remediation: null,
        });
        setReportStreaming(reportId, true);
        setSelectedFinding(reportId);
        setActiveTab('findings');
      }),

      on('ai.reasoning_chunk', (e) => {
        const ev = e as AiReasoningChunk;
        appendReasoning(ev.hunt_id, ev.chunk, ev.state);

        const reportId = reportIdFor(ev.hunt_id);
        const store = useIntelligenceStore.getState();
        const existing = store.findings.find((f) => f.id === reportId);
        if (existing) {
          appendReportText(reportId, ev.chunk);
        } else {
          // Re-create if the finding was lost (e.g. tab re-mount wiped it)
          addFinding({
            id: reportId,
            session_id: ev.session_id,
            asset_id: assetId,
            title: 'AI Executive Report',
            severity: 'info',
            confidence: 1,
            status: 'acknowledged',
            sighting_count: 1,
            first_seen: new Date().toISOString(),
            kind: 'ai_report',
            report_text: ev.chunk,
            report_summary: null,
            stix_bundle: null,
            remediation: null,
          });
          setSelectedFinding(reportId);
        }
      }),

      on('ai.reasoning_completed', (e) => {
        const ev = e as AiReasoningCompleted;
        const reportId = reportIdFor(ev.hunt_id);
        updateFinding(reportId, { report_summary: ev.summary });
        setReportStreaming(reportId, false);
      }),

      on('ai.finding_generated', async (e) => {
        const ev = e as AiFindingGenerated;
        // Fetch the full finding and add to store
        try {
          const res = await intelligenceApi.getFinding(ev.finding_id);
          addFinding(res.data);
        } catch {
          // Optimistic add with minimal data
          addFinding({
            id: ev.finding_id,
            session_id: ev.session_id,
            asset_id: '',
            title: ev.title,
            severity: ev.severity as 'critical' | 'high' | 'medium' | 'low' | 'info',
            confidence: 0.5,
            status: 'open',
            sighting_count: 1,
            first_seen: new Date().toISOString(),
            stix_bundle: null,
            remediation: null,
          });
        }
        setActiveTab('findings');
      }),

      // Error/warning event handlers
      on('system.error', (e) => {
        const ev = e as any;
        addNotification({
          type: 'error',
          message: ev.error,
          component: ev.component,
        });
      }),

      on('ssh.error', (e) => {
        const ev = e as any;
        addNotification({
          type: 'error',
          message: ev.message,
          component: 'ssh',
        });
      }),

      on('ai.error', (e) => {
        const ev = e as any;
        addNotification({
          type: ev.retryable ? 'warning' : 'error',
          message: ev.error,
          component: 'ai',
        });
      }),

      on('system.backpressure', (e) => {
        const ev = e as any;
        addNotification({
          type: 'warning',
          message: `Event queue at ${ev.queue_depth}/${ev.limit} capacity`,
          component: ev.component,
        });
      }),

      on('ssh.disconnected', (e) => {
        const ev = e as any;
        addNotification({
          type: 'warning',
          message: `SSH disconnected: ${ev.reason || 'connection lost'}`,
          component: 'ssh',
        });
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [on, addHunt, updateHunt, appendReasoning, setStepStatus, setActiveHunt, addFinding, updateFinding, appendReportText, setReportStreaming, setSelectedFinding, updateSession, addNotification, assetId]);

  // Load previously saved AI reports for this asset from the DB (across all sessions)
  useEffect(() => {
    if (!assetId) return;
    huntsApi.assetReports(assetId).then((res) => {
      for (const report of res.data) {
        if (!report.ai_report_text) continue;
        const reportId = reportIdFor(report.hunt_id);
        const store = useIntelligenceStore.getState();
        if (store.findings.find((f) => f.id === reportId)) continue;
        addFinding({
          id: reportId,
          session_id: report.session_id,
          asset_id: assetId,
          title: 'AI Executive Report',
          severity: 'info',
          confidence: 1,
          status: 'acknowledged',
          sighting_count: 1,
          first_seen: report.started_at || null,
          kind: 'ai_report',
          report_text: report.ai_report_text,
          report_summary: null,
          stix_bundle: null,
          remediation: null,
        });
      }
    }).catch(() => { /* asset may not have any reports yet */ });
  }, [sessionId, assetId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMode = () => {
    if (!socket) return;
    const newMode = sessionMode === 'ai' ? 'interactive' : 'ai';
    socket.emit('toggle_mode', { session_id: sessionId, mode: newMode });
    if (newMode === 'interactive') {
      setActiveTab('terminal');
    }
  };

  const isReady = sessionState === 'RUNNING' || sessionState === 'PAUSED' || sessionState === 'LOCKED';

  const handleStepSelect = (stepId: string) => {
    setJumpStepId(stepId);
    setActiveTab('terminal');
  };

  const handleAiSelect = () => {
    const huntId = activeHuntId;
    if (!huntId) return;
    const reportId = reportIdFor(huntId);
    const store = useIntelligenceStore.getState();
    const existing = store.findings.find((f) => f.id === reportId);
    if (!existing) {
      addFinding({
        id: reportId,
        session_id: sessionId,
        asset_id: assetId,
        title: 'AI Executive Report',
        severity: 'info',
        confidence: 1,
        status: 'acknowledged',
        sighting_count: 1,
        first_seen: new Date().toISOString(),
        kind: 'ai_report',
        report_text: 'AI analysis pending...',
        report_summary: null,
        stix_bundle: null,
        remediation: null,
      });
    }
    setSelectedFinding(reportId);
    setActiveTab('findings');
  };

  const jumpOutput = (() => {
    if (!activeHuntId) return '';
    const hunt = hunts[activeHuntId];
    return hunt?.outputs?.[jumpStepId || ''] || '';
  })();

  const closeSession = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await sessionsApi.terminate(sessionId);
    } catch (err: any) {
      // If 404, the session is already gone on the backend — still remove locally
      if (err?.response?.status !== 404) {
        addNotification({
          type: 'error',
          message: 'Failed to close session',
          component: 'session',
        });
      }
    } finally {
      removeSession(sessionId);
      setClosing(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Tab bar */}
      <div style={styles.tabBar}>
        {(['terminal', 'hunt', 'findings', 'timeline'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...styles.tab,
              color: activeTab === tab ? 'var(--accent)' : 'var(--muted-2)',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}

        {/* Mode toggle */}
        {isReady && (
          <button onClick={toggleMode} style={styles.modeBtn}>
            {sessionMode === 'ai' ? 'PTY' : 'AI'}
          </button>
        )}

        {/* Session state indicator */}
        <div style={styles.stateIndicator}>
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: STATE_COLORS[sessionState] || 'var(--muted-2)',
              marginRight: 6,
            }}
          />
          <span style={{ color: STATE_COLORS[sessionState] || 'var(--muted-2)' }}>
            {sessionState}
          </span>
        </div>

        <button
          onClick={closeSession}
          disabled={closing}
          style={styles.closeBtn}
        >
          {closing ? 'Closing...' : 'Close'}
        </button>
        <div style={styles.sessionBadge}>{sessionId.slice(0, 8)}</div>
      </div>

      {/* Notifications */}
      <NotificationBar />

      {/* Connection status overlay */}
      {!isReady && sessionState !== 'CONNECTED' && (
        <div style={styles.overlay}>
          {sessionState === 'INITIALIZING' && 'Initializing session...'}
          {sessionState === 'CONNECTING' && 'Connecting to host...'}
          {sessionState === 'FAILED' && 'Connection failed. Check asset credentials and try again.'}
          {sessionState === 'TERMINATED' && 'Session terminated.'}
          {sessionState === 'DISCONNECTED' && 'Disconnected. Reconnecting...'}
        </div>
      )}

      {/* Tab content */}
      <div style={styles.content}>
        {/* Terminal is always mounted so it can receive hunt events while other tabs are active */}
        <div style={{ width: '100%', height: '100%', display: activeTab === 'terminal' ? 'block' : 'none', position: 'relative' }}>
          {activeTab === 'terminal' && !hasTerminalData && (
            <div style={styles.terminalEmpty}>
              <div style={styles.terminalEmptyIcon}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </div>
              <div style={styles.terminalEmptyTitle}>No terminal output yet</div>
              <div style={styles.terminalEmptyHint}>
                Switch to <strong>PTY</strong> mode for an interactive shell, or go to the <strong>Hunt</strong> tab to run a hunt module.
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => { toggleMode(); setHasTerminalData(true); }} style={styles.terminalEmptyBtn}>
                  {sessionMode === 'ai' ? 'Start PTY' : 'Switch to AI'}
                </button>
                <button onClick={() => setActiveTab('hunt')} style={styles.terminalEmptyBtnSecondary}>
                  Run a Hunt
                </button>
              </div>
            </div>
          )}
          <TerminalPanel
            sessionId={sessionId}
            socket={socket}
            active={activeTab === 'terminal'}
            jumpStepId={jumpStepId}
            jumpStepOutput={jumpOutput}
            onJumpHandled={() => setJumpStepId(null)}
          />
        </div>
        {activeTab === 'hunt' && (
          <HuntPanel
            sessionId={sessionId}
            onStepSelect={handleStepSelect}
            onAiSelect={handleAiSelect}
          />
        )}
        {activeTab === 'findings' && (
          <FindingsPanel sessionId={sessionId} assetId={assetId} />
        )}
        {activeTab === 'timeline' && (
          <TimelinePanel assetId={assetId} />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--panel)',
    color: 'var(--text)',
    fontFamily: 'var(--font-ui)',
  },
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--panel-3)',
    borderBottom: '1px solid var(--border)',
    padding: '0 8px',
  },
  tab: {
    background: 'none',
    border: 'none',
    padding: '10px 16px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: 0.3,
  },
  modeBtn: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--warning)',
    padding: '5px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 3,
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  stateIndicator: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    fontSize: 12,
    fontFamily: 'var(--font-ui)',
    marginRight: 10,
  },
  sessionBadge: {
    color: 'var(--muted)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    padding: '4px 8px',
    border: '1px solid var(--border)',
    borderRadius: 3,
    background: 'var(--panel-2)',
  },
  closeBtn: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--danger)',
    padding: '5px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 3,
    marginRight: 8,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  overlay: {
    padding: '20px',
    textAlign: 'center',
    color: 'var(--warning)',
    fontSize: 14,
    fontFamily: 'var(--font-ui)',
    background: 'var(--panel-3)',
    borderBottom: '1px solid var(--border)',
  },
  terminalEmpty: {
    position: 'absolute',
    inset: 0,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(8, 12, 18, 0.92)',
    gap: 8,
  } as CSSProperties,
  terminalEmptyIcon: {
    color: 'var(--muted-2)',
    marginBottom: 4,
  },
  terminalEmptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text)',
    letterSpacing: 0.3,
  },
  terminalEmptyHint: {
    fontSize: 13,
    color: 'var(--muted)',
    maxWidth: 360,
    textAlign: 'center',
    lineHeight: 1.6,
  },
  terminalEmptyBtn: {
    background: 'var(--accent)',
    color: '#0b0f14',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 700,
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
  },
  terminalEmptyBtnSecondary: {
    background: 'var(--panel-2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    padding: '8px 16px',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600,
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
  },
};
