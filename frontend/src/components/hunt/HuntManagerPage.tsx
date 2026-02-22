import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { huntModulesApi } from '@/api/client';

/* ── Types ────────────────────────────────────────────────────────────────── */

interface HuntStep {
  id: string;
  description: string;
  command: string;
  timeout: number;
  requires_sudo: boolean;
}

interface HuntModule {
  id: string;
  name: string;
  description: string;
  os_types: string[];
  tags: string[];
  severity_hint: string;
  steps: HuntStep[];
  step_count?: number;
}

interface HuntManagerPageProps {
  onClose: () => void;
}

const EMPTY_STEP: HuntStep = { id: '', description: '', command: '', timeout: 30, requires_sudo: false };

const OS_OPTIONS = ['linux', 'windows', 'macos'];
const SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low', 'info'];

/* ── Tag Input ────────────────────────────────────────────────────────────── */

function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (t: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('');

  const add = (raw: string) => {
    const t = raw.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput('');
  };

  return (
    <div style={tagStyles.wrap}>
      {tags.map((t, i) => (
        <span key={`${t}-${i}`} style={tagStyles.pill}>
          {t}
          <span style={tagStyles.x} onClick={() => onChange(tags.filter((_, j) => j !== i))}>×</span>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
            e.preventDefault();
            add(input);
          } else if (e.key === 'Backspace' && !input && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => { if (input.trim()) add(input); }}
        placeholder={tags.length === 0 ? (placeholder || 'Add tag…') : ''}
        style={tagStyles.input}
      />
    </div>
  );
}

const tagStyles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 8px', minHeight: 36, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'text', alignItems: 'center' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--accent)', color: '#0b0f14', padding: '2px 8px', borderRadius: 3, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  x: { cursor: 'pointer', fontSize: 14, opacity: 0.7 },
  input: { flex: 1, minWidth: 80, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, padding: '4px 0' },
};

/* ── Step Editor ──────────────────────────────────────────────────────────── */

function StepEditor({ steps, onChange }: { steps: HuntStep[]; onChange: (s: HuntStep[]) => void }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const updateStep = (idx: number, patch: Partial<HuntStep>) => {
    onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removeStep = (idx: number) => {
    const next = steps.filter((_, i) => i !== idx);
    onChange(next);
    setConfirmDeleteIdx(null);
    if (activeIdx >= next.length) setActiveIdx(Math.max(0, next.length - 1));
    else if (activeIdx > idx) setActiveIdx(activeIdx - 1);
  };

  const addStep = () => {
    const newSteps = [...steps, { ...EMPTY_STEP, id: `step_${steps.length + 1}` }];
    onChange(newSteps);
    setActiveIdx(newSteps.length - 1);
  };

  // Drag-and-drop handlers
  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const next = [...steps];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    onChange(next);
    setActiveIdx(targetIdx);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const step = steps[activeIdx];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Steps ({steps.length})
        </div>
        <button type="button" onClick={addStep} style={s.addStepBtn}>+ Add Step</button>
      </div>

      {steps.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-2)', fontSize: 13 }}>
          No steps yet. Click "+ Add Step" to begin.
        </div>
      ) : (
        <div style={stepEditorStyles.layout}>
          {/* Sidebar — drag to reorder */}
          <div style={stepEditorStyles.sidebar}>
            {steps.map((st, idx) => (
              <div
                key={idx}
                style={{ position: 'relative' }}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <div
                  draggable
                  onDragStart={() => { handleDragStart(idx); setHoverIdx(null); }}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setActiveIdx(idx)}
                  style={{
                    ...stepEditorStyles.sidebarItem,
                    background: idx === activeIdx ? 'var(--accent)' : dragOverIdx === idx ? 'var(--panel)' : 'transparent',
                    color: idx === activeIdx ? '#0b0f14' : 'var(--text)',
                    opacity: dragIdx === idx ? 0.4 : 1,
                    borderTop: dragOverIdx === idx && dragIdx !== null && dragIdx !== idx ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                >
                  <span style={stepEditorStyles.dragHandle} title="Drag to reorder">&#9776;</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {st.id || `(step ${idx + 1})`}
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.6, flexShrink: 0 }}>#{idx + 1}</span>
                </div>
                {/* Hover tooltip */}
                {hoverIdx === idx && dragIdx === null && (st.description || st.command) && (
                  <div style={stepEditorStyles.tooltip}>
                    {st.description && <div style={stepEditorStyles.tooltipDesc}>{st.description}</div>}
                    {st.command && <div style={stepEditorStyles.tooltipCmd}>{st.command}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Detail panel */}
          {step && (
            <div style={stepEditorStyles.detail}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Step #{activeIdx + 1}</span>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteIdx(activeIdx)}
                  style={{ ...s.deleteBtnSm, fontSize: 11, padding: '3px 8px' }}
                >
                  Delete Step
                </button>
              </div>

              <div style={s.stepGrid}>
                <div>
                  <label style={s.label}>Step ID / Slug</label>
                  <input value={step.id} onChange={(e) => updateStep(activeIdx, { id: e.target.value })} placeholder="check_something" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Timeout (seconds)</label>
                  <input type="number" value={step.timeout} onChange={(e) => updateStep(activeIdx, { timeout: parseInt(e.target.value) || 30 })} style={s.input} />
                </div>
              </div>

              <div style={{ marginTop: 8 }}>
                <label style={s.label}>Description</label>
                <input value={step.description} onChange={(e) => updateStep(activeIdx, { description: e.target.value })} placeholder="What this step checks" style={s.input} />
              </div>

              <div style={{ marginTop: 8 }}>
                <label style={s.label}>Command</label>
                <textarea
                  value={step.command}
                  onChange={(e) => updateStep(activeIdx, { command: e.target.value })}
                  placeholder="ss -tlnpu 2>/dev/null || netstat -tlnpu"
                  style={{ ...s.input, fontFamily: 'monospace', minHeight: 60, resize: 'vertical' }}
                />
              </div>

              <div style={{ marginTop: 8 }}>
                <label style={{ ...s.label, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={step.requires_sudo} onChange={(e) => updateStep(activeIdx, { requires_sudo: e.target.checked })} />
                  Requires sudo
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete step confirmation */}
      {confirmDeleteIdx !== null && (
        <div style={s.modalOverlay} onClick={() => setConfirmDeleteIdx(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Delete Step</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
              Are you sure you want to delete step <strong>{steps[confirmDeleteIdx]?.id || `#${confirmDeleteIdx + 1}`}</strong>?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setConfirmDeleteIdx(null)} style={s.secondaryBtn}>Cancel</button>
              <button onClick={() => removeStep(confirmDeleteIdx)} style={s.dangerBtn}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const stepEditorStyles: Record<string, CSSProperties> = {
  layout: {
    display: 'flex',
    gap: 0,
    border: '1px solid var(--border)',
    borderRadius: 6,
    overflow: 'hidden',
    flex: 1,
    minHeight: 0,
  },
  sidebar: {
    width: 220,
    minWidth: 220,
    borderRight: '1px solid var(--border)',
    background: 'var(--panel-3)',
    overflowY: 'auto',
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 10px',
    fontSize: 12,
    cursor: 'grab',
    borderBottom: '1px solid var(--border)',
    userSelect: 'none',
    transition: 'background 0.1s',
  } as CSSProperties,
  dragHandle: {
    fontSize: 12,
    opacity: 0.4,
    cursor: 'grab',
    flexShrink: 0,
  },
  detail: {
    flex: 1,
    padding: 14,
    background: 'var(--panel-2)',
    overflowY: 'auto',
  },
  tooltip: {
    position: 'absolute',
    left: '100%',
    top: 0,
    marginLeft: 6,
    zIndex: 20,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 10px',
    width: 280,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
    pointerEvents: 'none',
  } as CSSProperties,
  tooltipDesc: {
    fontSize: 12,
    color: 'var(--text)',
    marginBottom: 4,
    lineHeight: 1.4,
  } as CSSProperties,
  tooltipCmd: {
    fontSize: 11,
    color: 'var(--accent)',
    fontFamily: 'monospace',
    background: 'var(--panel-3)',
    padding: '4px 6px',
    borderRadius: 3,
    wordBreak: 'break-all',
    lineHeight: 1.4,
  } as CSSProperties,
};

/* ── Main Component ───────────────────────────────────────────────────────── */

export function HuntManagerPage({ onClose }: HuntManagerPageProps) {
  const [modules, setModules] = useState<HuntModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [osFilter, setOsFilter] = useState<string>('all');
  const [editing, setEditing] = useState<HuntModule | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<HuntModule | null>(null);

  const loadModules = useCallback(async () => {
    try {
      const res = await huntModulesApi.list();
      setModules(res.data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadModules(); }, [loadModules]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return modules
      .filter((m) => osFilter === 'all' || m.os_types.includes(osFilter))
      .filter((m) =>
        !term || [m.id, m.name, m.description, ...m.tags, ...m.os_types, m.severity_hint]
          .some((v) => v.toLowerCase().includes(term))
      );
  }, [modules, search, osFilter]);

  const startEdit = async (moduleId: string) => {
    try {
      const res = await huntModulesApi.get(moduleId);
      setEditing(res.data);
      setIsNew(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to load module');
    }
  };

  const startCreate = () => {
    setEditing({
      id: '',
      name: '',
      description: '',
      os_types: ['linux'],
      tags: [],
      severity_hint: 'medium',
      steps: [],
    });
    setIsNew(true);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await huntModulesApi.create(editing);
      } else {
        await huntModulesApi.update(editing.id, editing);
      }
      setEditing(null);
      setIsNew(false);
      await loadModules();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(detail || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteModule = async (id: string) => {
    try {
      await huntModulesApi.delete(id);
      setConfirmDelete(null);
      await loadModules();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    }
  };

  // ── Editor view ──
  if (editing) {
    return (
      <div style={s.page}>
        <div style={s.pageHeader}>
          <div>
            <div style={s.title}>{isNew ? 'Create Hunt Module' : `Edit: ${editing.name}`}</div>
            <div style={s.subtitle}>{isNew ? 'Define a new threat hunting module' : `Editing ${editing.id}`}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.secondaryBtn} onClick={() => { setEditing(null); setIsNew(false); }}>Cancel</button>
            <button style={s.primaryBtn} onClick={save} disabled={saving || !editing.id || !editing.name}>
              {saving ? 'Saving...' : 'Save Module'}
            </button>
          </div>
        </div>

        {error && <div style={{ padding: '8px 16px', color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

        <div style={s.editorBody}>
          {/* Header fields */}
          <div style={s.section}>
            <div style={{ fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Module Header</div>
            <div style={s.formGrid}>
              <div>
                <label style={s.label}>Module ID</label>
                <input
                  value={editing.id}
                  onChange={(e) => setEditing({ ...editing, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                  placeholder="linux_network"
                  style={s.input}
                  disabled={!isNew}
                />
              </div>
              <div>
                <label style={s.label}>Name</label>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Linux Network Threat Hunting"
                  style={s.input}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={s.label}>Description</label>
                <textarea
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="What this module hunts for..."
                  style={{ ...s.input, minHeight: 48, resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={s.label}>OS Types</label>
                <div style={{ display: 'flex', gap: 10, padding: '6px 0' }}>
                  {OS_OPTIONS.map((os) => (
                    <label key={os} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editing.os_types.includes(os)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditing({ ...editing, os_types: [...editing.os_types, os] });
                          } else {
                            setEditing({ ...editing, os_types: editing.os_types.filter((o) => o !== os) });
                          }
                        }}
                      />
                      {os}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={s.label}>Severity Hint</label>
                <select
                  value={editing.severity_hint}
                  onChange={(e) => setEditing({ ...editing, severity_hint: e.target.value })}
                  style={s.input}
                >
                  {SEVERITY_OPTIONS.map((sv) => (
                    <option key={sv} value={sv}>{sv}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={s.label}>Tags (MITRE ATT&CK IDs, categories)</label>
                <TagInput tags={editing.tags} onChange={(tags) => setEditing({ ...editing, tags })} placeholder="e.g. T1049, network, lateral-movement" />
              </div>
            </div>
          </div>

          {/* Steps */}
          <div style={s.sectionSteps}>
            <StepEditor steps={editing.steps} onChange={(steps) => setEditing({ ...editing, steps })} />
          </div>
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <div style={s.title}>Hunt Manager</div>
          <div style={s.subtitle}>Create, edit, and manage threat hunting modules</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.primaryBtn} onClick={startCreate}>+ New Module</button>
          <button style={s.secondaryBtn} onClick={onClose}>Back</button>
        </div>
      </div>

      <div style={s.toolbar}>
        <input
          placeholder="Search modules..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={s.search}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'linux', 'windows', 'macos'] as const).map((os) => (
            <button
              key={os}
              onClick={() => setOsFilter(os)}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                border: osFilter === os ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: osFilter === os ? 'var(--accent)' : 'transparent',
                color: osFilter === os ? '#0b0f14' : 'var(--muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: osFilter === os ? 700 : 500,
                fontFamily: 'inherit',
                textTransform: 'capitalize',
              }}
            >
              {os === 'all' ? 'All' : os === 'macos' ? 'macOS' : os.charAt(0).toUpperCase() + os.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ padding: '8px 16px', color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

      <div style={s.listWrap}>
        {loading && <div style={s.empty}>Loading modules...</div>}
        {!loading && filtered.length === 0 && (
          <div style={s.empty}>No hunt modules found.</div>
        )}
        {filtered.map((m) => (
          <div key={m.id} style={s.moduleCard}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 15 }}>{m.name}</span>
                <span style={s.severityBadge(m.severity_hint)}>{m.severity_hint}</span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>{m.description}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>{m.step_count} steps</span>
                <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>|</span>
                <span style={{ fontSize: 12, color: 'var(--accent)' }}>{m.os_types.join(', ')}</span>
                {m.tags.length > 0 && (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>|</span>
                    {m.tags.map((t) => (
                      <span key={t} style={s.tagChip}>{t}</span>
                    ))}
                  </>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button style={s.secondaryBtnSm} onClick={() => startEdit(m.id)}>Edit</button>
              <button style={s.deleteBtnSm} onClick={() => setConfirmDelete(m)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={s.modalOverlay} onClick={() => setConfirmDelete(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Delete Module</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
              Are you sure you want to delete <strong>{confirmDelete.name}</strong> ({confirmDelete.id})?
              This will remove the module file from disk.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)} style={s.secondaryBtn}>Cancel</button>
              <button onClick={() => deleteModule(confirmDelete.id)} style={s.dangerBtn}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────────── */

const severityColors: Record<string, string> = {
  critical: '#ff4444',
  high: '#ff8844',
  medium: '#ffcc44',
  low: '#44cc88',
  info: '#4488cc',
};

const s: Record<string, any> = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--panel)', color: 'var(--text)', fontFamily: 'var(--font-ui)', maxWidth: 1200, margin: '0 auto', width: '100%' } as CSSProperties,
  pageHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--panel-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 } as CSSProperties,
  title: { fontSize: 18, color: 'var(--text)', fontWeight: 600 } as CSSProperties,
  subtitle: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  toolbar: { padding: '10px 16px', display: 'flex', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--panel-2)' } as CSSProperties,
  search: { flex: 1, background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 4, fontFamily: 'inherit', fontSize: 13 } as CSSProperties,
  listWrap: { flex: 1, overflow: 'auto', padding: '0' } as CSSProperties,
  editorBody: { flex: 1, overflow: 'hidden', padding: 16, display: 'flex', flexDirection: 'column', minHeight: 0 } as CSSProperties,
  section: { marginBottom: 20, flexShrink: 0 } as CSSProperties,
  sectionSteps: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } as CSSProperties,
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } as CSSProperties,
  label: { display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 } as CSSProperties,
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 4, fontFamily: 'inherit', fontSize: 13 } as CSSProperties,
  primaryBtn: { background: 'var(--accent)', color: '#0b0f14', border: 'none', padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', fontSize: 13 } as CSSProperties,
  secondaryBtn: { background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 } as CSSProperties,
  dangerBtn: { background: 'var(--danger)', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-ui)' } as CSSProperties,
  secondaryBtnSm: { background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 } as CSSProperties,
  deleteBtnSm: { background: 'none', color: 'var(--danger)', border: '1px solid var(--danger)', padding: '5px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 } as CSSProperties,
  addStepBtn: { background: 'var(--panel-2)', color: 'var(--accent)', border: '1px solid var(--border)', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 } as CSSProperties,
  moduleCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tagChip: { background: 'var(--chip, var(--panel-2))', color: 'var(--muted)', padding: '1px 6px', borderRadius: 3, fontSize: 11 } as CSSProperties,
  stepGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 } as CSSProperties,
  empty: { padding: 40, color: 'var(--muted-2)', textAlign: 'center', fontSize: 14 } as CSSProperties,
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(5, 8, 12, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } as CSSProperties,
  modal: { width: 400, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)' } as CSSProperties,
  severityBadge: (level: string): CSSProperties => ({
    fontSize: 11,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 3,
    color: '#0b0f14',
    background: severityColors[level] || severityColors.medium,
  }),
};
