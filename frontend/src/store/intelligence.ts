import { create } from 'zustand';

export interface Finding {
  id: string;
  session_id: string;
  asset_id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: number;
  status: 'open' | 'acknowledged' | 'resolved';
  sighting_count: number;
  first_seen?: string | null;
  kind?: 'ai_report';
  report_text?: string | null;
  report_summary?: string | null;
  stix_bundle: unknown | null;
  remediation: {
    immediate_actions: string[];
    short_term_actions: string[];
    long_term_actions: string[];
    all_steps: string[];
  } | null;
}

export interface TimelineEvent {
  id: string;
  asset_id: string;
  event_type: string;
  payload: unknown;
  occurred_at: string;
  analyst_id: string;
}

interface IntelligenceStore {
  findings: Finding[];
  timelineEvents: TimelineEvent[];
  selectedFindingId: string | null;
  streamingReportIds: Set<string>;
  readIds: Set<string>;
  setFindings: (findings: Finding[]) => void;
  addFinding: (finding: Finding) => void;
  updateFinding: (id: string, updates: Partial<Finding>) => void;
  /** Append text to a report finding without re-sorting (perf: hot path during AI streaming) */
  appendReportText: (id: string, chunk: string) => void;
  removeFinding: (id: string) => void;
  setTimeline: (events: TimelineEvent[]) => void;
  setSelectedFinding: (id: string | null) => void;
  setReportStreaming: (id: string, streaming: boolean) => void;
  markRead: (id: string) => void;
}

/** Sort priority: unread first, then by status (open > acknowledged > resolved) */
const STATUS_ORDER: Record<string, number> = { open: 0, acknowledged: 1, resolved: 2 };
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    // Sort by status first (open > acknowledged > resolved)
    const aStatus = STATUS_ORDER[a.status] ?? 1;
    const bStatus = STATUS_ORDER[b.status] ?? 1;
    if (aStatus !== bStatus) return aStatus - bStatus;
    // Then by severity (critical > high > medium > low > info)
    const aSev = SEVERITY_ORDER[a.severity] ?? 4;
    const bSev = SEVERITY_ORDER[b.severity] ?? 4;
    return aSev - bSev;
  });
}

export const useIntelligenceStore = create<IntelligenceStore>((set) => ({
  findings: [],
  timelineEvents: [],
  selectedFindingId: null,
  streamingReportIds: new Set<string>(),
  readIds: new Set<string>(),

  setFindings: (dbFindings) =>
    set((state) => {
      // Preserve in-memory-only findings (e.g. streaming AI reports) that aren't in the DB yet
      const inMemoryOnly = state.findings.filter(
        (f) => f.kind === 'ai_report' && !dbFindings.find((df) => df.id === f.id)
      );
      return { findings: sortFindings([...inMemoryOnly, ...dbFindings]) };
    }),

  addFinding: (finding) =>
    set((state) => {
      const exists = state.findings.find((f) => f.id === finding.id);
      if (exists) return state;
      return { findings: sortFindings([finding, ...state.findings]) };
    }),

  updateFinding: (id, updates) =>
    set((state) => {
      const updated = state.findings.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      );
      return { findings: sortFindings(updated) };
    }),

  appendReportText: (id, chunk) =>
    set((state) => {
      // Fast path: mutate only the target finding's report_text, skip sorting
      const idx = state.findings.findIndex((f) => f.id === id);
      if (idx === -1) return state;
      const f = state.findings[idx];
      const updated = [...state.findings];
      updated[idx] = { ...f, report_text: (f.report_text || '') + chunk };
      return { findings: updated };
    }),

  removeFinding: (id) =>
    set((state) => ({
      findings: state.findings.filter((f) => f.id !== id),
      selectedFindingId: state.selectedFindingId === id ? null : state.selectedFindingId,
    })),

  setTimeline: (timelineEvents) => set({ timelineEvents }),

  setSelectedFinding: (id) =>
    set((state) => {
      if (id && !state.readIds.has(id)) {
        const next = new Set(state.readIds);
        next.add(id);
        return { selectedFindingId: id, readIds: next };
      }
      return { selectedFindingId: id };
    }),

  markRead: (id) =>
    set((state) => {
      if (state.readIds.has(id)) return state;
      const next = new Set(state.readIds);
      next.add(id);
      return { readIds: next };
    }),

  setReportStreaming: (id, streaming) =>
    set((state) => {
      const next = new Set(state.streamingReportIds);
      if (streaming) next.add(id);
      else next.delete(id);
      return { streamingReportIds: next };
    }),
}));
