import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { huntModulesApi, huntsApi } from '@/api/client';
import { useHuntStore } from '@/store/hunt';

interface HuntModule {
  id: string;
  name: string;
  description: string;
  os_types: string[];
  tags: string[];
  severity_hint: string;
  step_count: number;
}

interface HuntStepDetail {
  id: string;
  description: string;
  command: string;
  timeout: number;
  requires_sudo: boolean;
}

interface HuntModuleDetail extends Omit<HuntModule, 'step_count'> {
  steps: HuntStepDetail[];
}

const SEVERITY_COLORS: Record<string, string> = {
  analyzing: '#36a3d9',
  concluding: '#e6b450',
  generating: '#b8cc52',
};

interface HuntPanelProps {
  sessionId: string;
  onStepSelect?: (stepId: string) => void;
  onAiSelect?: () => void;
}

export function HuntPanel({ sessionId, onStepSelect, onAiSelect }: HuntPanelProps) {
  const [modules, setModules] = useState<HuntModule[]>([]);
  const [selectedModule, setSelectedModule] = useState('');
  const [loading, setLoading] = useState(false);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [moduleDetail, setModuleDetail] = useState<HuntModuleDetail | null>(null);
  const [moduleDetailLoading, setModuleDetailLoading] = useState(false);
  const [runAi, setRunAi] = useState(true);
  const { hunts, activeHuntId } = useHuntStore();
  const activeHunt = activeHuntId ? hunts[activeHuntId] : null;

  useEffect(() => {
    huntsApi.modules()
      .then((res) => {
        setModules(res.data);
        if (res.data.length > 0 && !selectedModule) {
          setSelectedModule(res.data[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setModulesLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedModule) return;
    setModuleDetailLoading(true);
    huntModulesApi.get(selectedModule)
      .then((res) => setModuleDetail(res.data))
      .catch(() => setModuleDetail(null))
      .finally(() => setModuleDetailLoading(false));
  }, [selectedModule]);

  const startHunt = async () => {
    setLoading(true);
    try {
      const res = await huntsApi.start(sessionId, selectedModule, runAi);
      useHuntStore.getState().addHunt({
        id: res.data.id,
        session_id: sessionId,
        module_id: selectedModule,
        run_ai: runAi,
        status: 'PENDING',
        steps: [],
        findings_count: 0,
        reasoning_text: '',
        reasoning_state: null,
        error: null,
        outputs: {},
      });
      useHuntStore.getState().setActiveHunt(res.data.id);
    } catch (e) {
      console.error('Failed to start hunt:', e);
    } finally {
      setLoading(false);
    }
  };

  const [activeStepIdx, setActiveStepIdx] = useState(0);

  // reset step selection when module changes
  useEffect(() => { setActiveStepIdx(0); }, [selectedModule]);

  const selectedModuleInfo = modules.find((m) => m.id === selectedModule);
  const aiEnabled = activeHunt ? activeHunt.run_ai : runAi;
  const aiStepStatus = (() => {
    if (!aiEnabled) return 'skipped';
    if (activeHunt?.reasoning_state) return 'running';
    if (activeHunt?.reasoning_text) return 'completed';
    if (activeHunt?.status === 'COMPLETED') return 'completed';
    if (activeHunt?.status === 'FAILED') return 'failed';
    return 'pending';
  })();

  return (
    <div style={styles.container}>
      {/* Hunt controls */}
      <div style={styles.controls}>
        <select
          value={selectedModule}
          onChange={(e) => setSelectedModule(e.target.value)}
          style={styles.select}
          disabled={modulesLoading}
        >
          {modulesLoading && <option>Loading modules...</option>}
          {modules.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button
          onClick={startHunt}
          disabled={loading || !selectedModule || activeHunt?.status === 'RUNNING'}
          style={styles.button}
        >
          {loading ? 'Starting...' : 'Run Hunt'}
        </button>
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={aiEnabled}
            onChange={(e) => setRunAi(e.target.checked)}
            disabled={loading || activeHunt?.status === 'RUNNING'}
          />
          Run AI analysis
        </label>
      </div>

      {/* Module info */}
      {selectedModuleInfo && !activeHunt && (
        <div style={styles.moduleInfo}>
          <div style={{ color: 'var(--text)', fontSize: 14, marginBottom: 6 }}>
            {selectedModuleInfo.description}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={styles.infoBadge}>{selectedModuleInfo.step_count} steps</span>
            <span style={styles.infoBadge}>{selectedModuleInfo.severity_hint}</span>
            {selectedModuleInfo.tags.map((tag) => (
              <span key={tag} style={styles.tagBadge}>{tag}</span>
            ))}
          </div>

          <div style={styles.moduleSteps}>
            <div style={styles.moduleStepsHeader}>Steps ({moduleDetail?.steps.length ?? selectedModuleInfo.step_count})</div>
            {moduleDetailLoading && (
              <div style={styles.stepEmpty}>Loading steps...</div>
            )}
            {!moduleDetailLoading && (!moduleDetail || moduleDetail.steps.length === 0) && (
              <div style={styles.stepEmpty}>No steps defined for this module.</div>
            )}
            {!moduleDetailLoading && moduleDetail && moduleDetail.steps.length > 0 && (
              <div style={styles.stepLayout}>
                {/* Sidebar */}
                <div style={styles.stepSidebar}>
                  {moduleDetail.steps.map((step, idx) => (
                    <div
                      key={`${step.id}-${idx}`}
                      onClick={() => setActiveStepIdx(idx)}
                      style={{
                        ...styles.stepSidebarItem,
                        background: idx === activeStepIdx ? 'var(--accent)' : 'transparent',
                        color: idx === activeStepIdx ? '#0b0f14' : 'var(--text)',
                      }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {step.id || `step_${idx + 1}`}
                      </span>
                      <span style={{ fontSize: 11, opacity: 0.6, flexShrink: 0 }}>#{idx + 1}</span>
                    </div>
                  ))}
                </div>

                {/* Detail */}
                {moduleDetail.steps[activeStepIdx] && (() => {
                  const step = moduleDetail.steps[activeStepIdx];
                  return (
                    <div style={styles.stepDetail}>
                      <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, marginBottom: 10 }}>
                        Step #{activeStepIdx + 1}
                      </div>

                      <div style={styles.stepFieldGrid}>
                        <div>
                          <div style={styles.stepFieldLabel}>Step ID / Slug</div>
                          <div style={styles.stepFieldValue}>{step.id || '—'}</div>
                        </div>
                        <div>
                          <div style={styles.stepFieldLabel}>Timeout (seconds)</div>
                          <div style={styles.stepFieldValue}>{step.timeout}</div>
                        </div>
                      </div>

                      {step.description && (
                        <div style={{ marginTop: 8 }}>
                          <div style={styles.stepFieldLabel}>Description</div>
                          <div style={styles.stepFieldValue}>{step.description}</div>
                        </div>
                      )}

                      {step.command && (
                        <div style={{ marginTop: 8 }}>
                          <div style={styles.stepFieldLabel}>Command</div>
                          <pre style={styles.stepCmdBox}>{step.command}</pre>
                        </div>
                      )}

                      {step.requires_sudo && (
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--warning)' }}>
                          <span style={{ display: 'inline-block', width: 14, height: 14, border: '1px solid var(--warning)', borderRadius: 3 }} />
                          Requires sudo
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active hunt display */}
      {activeHunt && (
        <div style={styles.huntView}>
          <div style={styles.statusBar}>
            {(activeHunt.status === 'RUNNING' || activeHunt.status === 'PENDING') && (
              <span style={{ ...styles.stepSpinner, marginRight: 8 }} />
            )}
            <span style={{ color: statusColor(activeHunt.status) }}>
              {activeHunt.status}
            </span>
            <span style={{ color: 'var(--muted)' }}> — {activeHunt.module_id}</span>
            {activeHunt.findings_count > 0 && (
              <span style={{ color: 'var(--success)', marginLeft: 12 }}>
                {activeHunt.findings_count} finding(s)
              </span>
            )}
          </div>

          {/* Steps */}
          <div style={styles.steps}>
            {activeHunt.steps.map((step) => (
              <div
                key={step.id}
                style={styles.step}
                onClick={() => onStepSelect?.(step.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onStepSelect?.(step.id);
                  }
                }}
              >
                <StepStatusIcon status={step.status} />
                <span style={{ color: 'var(--text)', fontSize: 14 }}>{step.description}</span>
              </div>
            ))}
            <div
              style={styles.step}
              onClick={() => aiEnabled && onAiSelect?.()}
              role={aiEnabled ? 'button' : undefined}
              tabIndex={aiEnabled ? 0 : -1}
              onKeyDown={(e) => {
                if (!aiEnabled) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  onAiSelect?.();
                }
              }}
            >
              <StepStatusIcon status={aiStepStatus} />
              <span style={{ color: 'var(--text)', fontSize: 14 }}>
                AI Executive Report {aiEnabled ? '' : '(skipped)'}
              </span>
            </div>
          </div>

          {/* AI reasoning stream */}
          {activeHunt.reasoning_text && (
            <div style={styles.reasoning}>
              <div style={styles.reasoningHeader}>
                <span>AI Analysis</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {activeHunt.reasoning_state && (
                    <span style={{ color: SEVERITY_COLORS[activeHunt.reasoning_state], fontSize: 13 }}>
                      {activeHunt.reasoning_state}
                    </span>
                  )}
                  <button
                    style={styles.copyBtn}
                    title="Copy to clipboard"
                    onClick={() => {
                      if (activeHunt.reasoning_text) {
                        if (navigator.clipboard?.writeText) {
                          navigator.clipboard.writeText(activeHunt.reasoning_text);
                        } else {
                          const ta = document.createElement('textarea');
                          ta.value = activeHunt.reasoning_text;
                          ta.style.position = 'fixed';
                          ta.style.opacity = '0';
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand('copy');
                          document.body.removeChild(ta);
                        }
                      }
                    }}
                  >
                    ⎘ Copy
                  </button>
                </div>
              </div>
              <pre style={styles.reasoningText}>{activeHunt.reasoning_text}</pre>
            </div>
          )}

          {/* Error display */}
          {activeHunt.error && (
            <div style={styles.errorBox}>
              {activeHunt.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function statusColor(status: string) {
  switch (status) {
    case 'RUNNING': return '#36a3d9';
    case 'COMPLETED': return '#b8cc52';
    case 'FAILED': return '#ff3333';
    case 'CANCELLED': return '#e6b450';
    default: return 'var(--muted-2)';
  }
}

function stepColor(status: string) {
  switch (status) {
    case 'running': return '#36a3d9';
    case 'completed': return '#b8cc52';
    case 'failed': return '#ff3333';
    case 'skipped': return 'var(--muted-2)';
    default: return 'var(--muted-2)';
  }
}

function stepIcon(status: string) {
  switch (status) {
    case 'running': return null; // will use spinner
    case 'completed': return '✓';
    case 'failed': return '✗';
    case 'skipped': return '–';
    default: return '○';
  }
}

function StepStatusIcon({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <span style={styles.stepSpinner} />
    );
  }
  return (
    <span style={{ color: stepColor(status), marginRight: 8, fontSize: 14 }}>
      {stepIcon(status)}
    </span>
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
  controls: {
    display: 'flex',
    gap: 8,
    padding: 12,
    borderBottom: '1px solid var(--border)',
    background: 'var(--panel-3)',
  },
  moduleSteps: {
    marginTop: 12,
    borderTop: '1px solid var(--border)',
    paddingTop: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flex: 1,
    minHeight: 0,
  },
  moduleStepsHeader: {
    fontSize: 12,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stepLayout: {
    display: 'flex',
    border: '1px solid var(--border)',
    borderRadius: 6,
    overflow: 'hidden',
    minHeight: 180,
  },
  stepSidebar: {
    width: 220,
    minWidth: 220,
    borderRight: '1px solid var(--border)',
    background: 'var(--panel-3)',
    overflowY: 'auto',
  },
  stepSidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 10px',
    fontSize: 12,
    cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    userSelect: 'none',
    transition: 'background 0.1s',
  } as CSSProperties,
  stepDetail: {
    flex: 1,
    padding: 14,
    background: 'var(--panel-2)',
    overflowY: 'auto',
  },
  stepFieldGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  stepFieldLabel: {
    fontSize: 11,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  stepFieldValue: {
    background: 'var(--panel-3)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '6px 10px',
    color: 'var(--text)',
    fontSize: 13,
    minHeight: 30,
    display: 'flex',
    alignItems: 'center',
  },
  stepCmdBox: {
    background: 'var(--panel-3)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '8px 10px',
    color: 'var(--muted)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    minHeight: 50,
    margin: 0,
  },
  stepEmpty: {
    color: 'var(--muted-2)',
    fontSize: 12,
    padding: '6px 0',
  },
  select: {
    flex: 1,
    background: 'var(--panel-2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    padding: '8px 10px',
    borderRadius: 4,
    fontFamily: 'inherit',
    fontSize: 14,
  },
  button: {
    background: 'var(--accent)',
    color: '#0b0f14',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 700,
    fontFamily: 'inherit',
    fontSize: 14,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--muted)',
    fontSize: 13,
    fontFamily: 'inherit',
  },
  moduleInfo: {
    padding: 12,
    borderBottom: '1px solid var(--border)',
    overflowY: 'auto',
    flex: 1,
  },
  infoBadge: {
    background: 'var(--chip)',
    color: 'var(--text)',
    padding: '3px 8px',
    borderRadius: 3,
    fontSize: 12,
  },
  tagBadge: {
    background: 'var(--chip)',
    color: 'var(--accent)',
    padding: '3px 8px',
    borderRadius: 3,
    fontSize: 12,
  },
  huntView: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  statusBar: {
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
  },
  steps: {
    padding: 12,
    overflowY: 'auto',
    borderBottom: '1px solid var(--border)',
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 0',
    fontSize: 14,
    cursor: 'pointer',
  },
  stepSpinner: {
    display: 'inline-block',
    width: 14,
    height: 14,
    border: '2px solid var(--border)',
    borderTop: '2px solid #36a3d9',
    borderRadius: '50%',
    animation: 'ai-spin 0.8s linear infinite',
    marginRight: 8,
    flexShrink: 0,
  } as CSSProperties,
  reasoning: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  reasoningHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'var(--panel-3)',
    borderBottom: '1px solid var(--border)',
    fontSize: 13,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  reasoningText: {
    flex: 1,
    padding: 12,
    overflow: 'auto',
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: 'var(--text)',
  },
  errorBox: {
    margin: 12,
    padding: 12,
    background: '#2a1212',
    border: '1px solid var(--danger)',
    borderRadius: 4,
    color: 'var(--danger)',
    fontSize: 14,
  },
  copyBtn: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--muted)',
    padding: '3px 10px',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'var(--font-ui)',
    letterSpacing: 0.5,
    transition: 'color 0.15s, border-color 0.15s',
  },
};
