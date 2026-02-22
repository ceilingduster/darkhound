import type { CSSProperties } from 'react';
import { useEffect, useState, useRef, useMemo, useCallback, useDeferredValue } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { huntsApi, intelligenceApi } from '@/api/client';
import { useIntelligenceStore, Finding } from '@/store/intelligence';

/** Strip the trailing JSON-for-machine-parsing section from the AI report */
function stripJsonBlock(text: string): string {
  return text
    .replace(/\n*(?:---\n*)?(?:#+\s*json[^\n]*\n+)?```json[\s\S]*$/i, '')
    .trimEnd();
}

/** Turn heading text into a URL-safe slug */
function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function flattenText(node: any): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (typeof node === 'object' && 'props' in node) return flattenText(node.props?.children);
  return '';
}

function getReportHuntId(reportId: string): string | null {
  const prefix = 'ai-report-';
  if (!reportId.startsWith(prefix)) return null;
  return reportId.slice(prefix.length) || null;
}

interface TocEntry { level: number; text: string; slug: string }

/** Extract H1/H2/H3 headings from markdown source */
function extractToc(md: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const seen = new Map<string, number>();
  for (const m of md.matchAll(/^(#{1,3})\s+(.+)$/gm)) {
    const level = m[1].length;
    const text = m[2].replace(/\*\*/g, '').trim();
    let slug = slugify(text);
    const count = seen.get(slug) ?? 0;
    if (count > 0) slug += `-${count}`;
    seen.set(slug, count + 1);
    entries.push({ level, text, slug });
  }
  return entries;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ff3333',
  high: '#ff6a00',
  medium: '#e6b450',
  low: '#b8cc52',
  info: '#36a3d9',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#ff3333',
  acknowledged: '#e6b450',
  resolved: '#b8cc52',
};

/** Format ISO timestamp to short human-readable string */
function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export function FindingsPanel({ sessionId, assetId }: { sessionId?: string; assetId?: string }) {
  const { findings, setFindings, selectedFindingId, setSelectedFinding, updateFinding, removeFinding, streamingReportIds } = useIntelligenceStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    // Load findings by asset_id so all findings for this machine are visible across sessions
    const params = assetId ? { asset_id: assetId } : sessionId ? { session_id: sessionId } : undefined;
    intelligenceApi.listFindings(params)
      .then((res) => setFindings(res.data))
      .catch((err) => setError(err.message || 'Failed to load findings'))
      .finally(() => setLoading(false));
  }, [setFindings, sessionId, assetId]);

  const selectedFinding = findings.find((f) => f.id === selectedFindingId);

  const handleDelete = async (finding: Finding) => {
    const label = finding.kind === 'ai_report' ? 'AI Executive Report' : `finding "${finding.title}"`;
    const ok = window.confirm(`Delete ${label}? This cannot be undone.`);
    if (!ok) return;
    setDeletingId(finding.id);
    try {
      if (finding.kind === 'ai_report') {
        const huntId = getReportHuntId(finding.id);
        if (!huntId) throw new Error('Report hunt id missing');
        await huntsApi.deleteReport(huntId);
      } else {
        await intelligenceApi.deleteFinding(finding.id);
      }
      removeFinding(finding.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete finding');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={styles.container}>
      {/* Finding list */}
      <div style={styles.list}>
        <div style={styles.listHeader}>Findings ({findings.length})</div>
        {loading && <div style={styles.empty}>Loading...</div>}
        {error && <div style={{ ...styles.empty, color: 'var(--danger)' }}>{error}</div>}
        {!loading && !error && findings.length === 0 && (
          <div style={styles.empty}>No findings yet</div>
        )}
        {findings.map((f) => (
          <FindingRow
            key={f.id}
            finding={f}
            selected={f.id === selectedFindingId}
            isNew={f.status === 'open'}
            onSelect={() => setSelectedFinding(f.id)}
            onDelete={() => handleDelete(f)}
            deleting={deletingId === f.id}
          />
        ))}
      </div>

      {/* Finding detail */}
      {selectedFinding ? (
        selectedFinding.kind === 'ai_report' ? (
          <AiReportDetail finding={selectedFinding} isStreaming={streamingReportIds.has(selectedFinding.id)} />
        ) : (
          <FindingDetail finding={selectedFinding} onStatusChange={updateFinding} />
        )
      ) : (
        <div style={{ ...styles.detail, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--muted-2)' }}>Select a finding to view details</span>
        </div>
      )}
    </div>
  );
}

function FindingRow({
  finding,
  selected,
  isNew,
  onSelect,
  onDelete,
  deleting,
}: {
  finding: Finding;
  selected: boolean;
  isNew: boolean;
  onSelect: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { streamingReportIds } = useIntelligenceStore();
  const isStreaming = finding.kind === 'ai_report' && streamingReportIds.has(finding.id);
  const isClosed = finding.status === 'resolved';

  if (finding.kind === 'ai_report') {
    return (
      <div
        onClick={onSelect}
        style={{
          ...styles.findingRow,
          background: selected ? 'var(--panel-2)' : 'transparent',
          borderLeft: '3px solid var(--accent-2)',
          opacity: isClosed ? 0.5 : 1,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
          <span style={{ color: 'var(--accent-2)', fontSize: 12, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            {isNew && !isStreaming && <span style={styles.unreadDot} />}
            report
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--muted-2)', fontSize: 11, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
              {isClosed && <span style={{ color: 'var(--success)', fontSize: 10 }}>CLOSED</span>}
              {isStreaming && <span style={styles.dotPulse} />}
              ai
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={deleting}
              title="Delete report"
              aria-label="Delete report"
              style={styles.deleteBtn}
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
            </button>
          </span>
        </div>
        <div style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.5 }}>AI Executive Report</div>
        <div style={{ marginTop: 4, color: 'var(--muted-2)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isStreaming ? 'Streaming AI analysis...' : isClosed ? 'Closed' : (finding.first_seen ? formatTimestamp(finding.first_seen) : 'Click to view the analysis')}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onSelect}
      style={{
        ...styles.findingRow,
        background: selected ? 'var(--panel-2)' : 'transparent',
        borderLeft: `3px solid ${SEVERITY_COLORS[finding.severity] || 'var(--muted-2)'}`,
        opacity: isClosed ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
        <span style={{ color: SEVERITY_COLORS[finding.severity], fontSize: 12, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
          {isNew && <span style={styles.unreadDot} />}
          {finding.severity}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: STATUS_COLORS[finding.status] || 'var(--muted-2)', fontSize: 11, textTransform: 'uppercase' }}>
            {finding.status}
          </span>
          {!finding.kind && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={deleting}
              title="Delete finding"
              aria-label="Delete finding"
              style={styles.deleteBtn}
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
            </button>
          )}
        </span>
      </div>
      <div style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.5 }}>{finding.title}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ color: 'var(--muted-2)', fontSize: 12 }}>
          {Math.round(finding.confidence * 100)}% conf
          {finding.first_seen && <span style={{ marginLeft: 8 }}>{formatTimestamp(finding.first_seen)}</span>}
        </span>
        {finding.sighting_count > 1 && (
          <span style={{ color: 'var(--warning)', fontSize: 12 }}>
            {finding.sighting_count} sightings
          </span>
        )}
      </div>
    </div>
  );
}

function FindingDetail({
  finding,
  onStatusChange,
}: {
  finding: Finding;
  onStatusChange: (id: string, updates: Partial<Finding>) => void;
}) {
  const [stixView, setStixView] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const handleStatusChange = async (newStatus: 'open' | 'acknowledged' | 'resolved') => {
    setUpdatingStatus(true);
    try {
      await intelligenceApi.updateStatus(finding.id, newStatus);
      onStatusChange(finding.id, { status: newStatus });
    } catch (err) {
      console.error('Failed to update finding status:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div style={styles.detail}>
      <div style={styles.detailHeader}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ color: SEVERITY_COLORS[finding.severity] }}>[{finding.severity.toUpperCase()}]</span>
            {' '}{finding.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {finding.first_seen && (
              <span style={{ color: 'var(--muted-2)', fontSize: 11 }}>{formatTimestamp(finding.first_seen)}</span>
            )}
            <span style={{ color: STATUS_COLORS[finding.status], fontSize: 12, textTransform: 'uppercase' }}>
              {finding.status}
            </span>
          </div>
        </div>

        {/* Status action buttons */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {finding.status === 'open' && (
            <button
              onClick={() => handleStatusChange('acknowledged')}
              disabled={updatingStatus}
              style={styles.statusBtn}
            >
              Acknowledge
            </button>
          )}
          {(finding.status === 'open' || finding.status === 'acknowledged') && (
            <button
              onClick={() => handleStatusChange('resolved')}
              disabled={updatingStatus}
              style={{ ...styles.statusBtn, borderColor: 'var(--success)', color: 'var(--success)' }}
            >
              Resolve
            </button>
          )}
          {finding.status === 'resolved' && (
            <button
              onClick={() => handleStatusChange('open')}
              disabled={updatingStatus}
              style={{ ...styles.statusBtn, borderColor: 'var(--danger)', color: 'var(--danger)' }}
            >
              Reopen
            </button>
          )}
        </div>
      </div>

      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, color: !stixView ? 'var(--accent)' : 'var(--muted-2)' }}
          onClick={() => setStixView(false)}
        >
          Remediation
        </button>
        {!!finding.stix_bundle && (
          <button
            style={{ ...styles.tab, color: stixView ? 'var(--accent)' : 'var(--muted-2)' }}
            onClick={() => setStixView(true)}
          >
            STIX Bundle
          </button>
        )}
      </div>

      <div style={styles.detailBody}>
        {!stixView && finding.remediation && (
          <RemediationView remediation={finding.remediation} />
        )}
        {stixView && !!finding.stix_bundle && (
          <pre style={styles.jsonView}>
            {JSON.stringify(finding.stix_bundle, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function AiReportDetail({ finding, isStreaming }: { finding: Finding; isStreaming: boolean }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const tocRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const { updateFinding } = useIntelligenceStore();
  const isClosed = finding.status === 'resolved';

  const handleClose = () => updateFinding(finding.id, { status: 'resolved' });
  const handleReopen = () => updateFinding(finding.id, { status: 'acknowledged' });
  const handleExportPdf = () => {
    if (!reportRef.current) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const html = reportRef.current.innerHTML;
    const title = 'AI Executive Report';
    win.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light; }
      body {
        font-family: 'Space Grotesk', Arial, sans-serif;
        color: #0b0f14;
        background: #ffffff;
        margin: 24px;
      }
      h1, h2, h3 {
        color: #0b3b5c;
        border-bottom: 1px solid #d8e2ee;
        padding-bottom: 6px;
        margin: 18px 0 10px;
      }
      h1 { font-size: 20px; }
      h2 { font-size: 16px; }
      h3 { font-size: 14px; border: none; }
      p { margin: 8px 0; line-height: 1.6; }
      ul, ol { padding-left: 18px; margin: 8px 0; }
      li { margin: 4px 0; }
      code {
        background: #f3f6fb;
        padding: 2px 4px;
        border-radius: 3px;
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
        font-size: 12px;
      }
      pre {
        background: #f6f8fb;
        border: 1px solid #dfe6ef;
        border-radius: 4px;
        padding: 10px 12px;
        overflow-x: auto;
      }
      blockquote {
        border-left: 3px solid #4db2ff;
        margin: 8px 0;
        padding: 4px 12px;
        color: #3b4756;
        background: #f6f8fb;
        border-radius: 0 4px 4px 0;
      }
      hr { border: none; border-top: 1px solid #dfe6ef; margin: 14px 0; }
      @media print {
        body { margin: 0.5in; }
      }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    ${html}
  </body>
</html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const cleanText = useMemo(
    () => stripJsonBlock(finding.report_text || ''),
    [finding.report_text],
  );

  // During streaming, defer the expensive markdown parsing so the UI stays responsive.
  // useDeferredValue lets React batch updates and skip intermediate renders.
  const deferredCleanText = useDeferredValue(cleanText);
  // Use deferred text for heavy computations, immediate text for auto-scroll
  const renderText = isStreaming ? deferredCleanText : cleanText;
  const toc = useMemo(() => extractToc(renderText), [renderText]);

  useEffect(() => {
    setActiveSlug(null);
  }, [renderText]);

  useEffect(() => {
    if (!bodyRef.current) return;
    const headings = Array.from(bodyRef.current.querySelectorAll('h1,h2,h3')) as HTMLElement[];
    if (headings.length === 0) return;
  }, [renderText]);

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (isStreaming && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [finding.report_text, isStreaming]);

  const scrollTo = useCallback((slug: string) => {
    if (!bodyRef.current) return;
    console.log('[toc] click', slug);
    const container = bodyRef.current;
    const el = container.querySelector(`[id="${slug}"], [data-slug="${slug}"]`) as HTMLElement | null;
    if (!el) {
      console.log('[toc] target not found', slug);
      return;
    }
    const tocOffset = tocCollapsed ? 0 : (tocRef.current?.offsetHeight || 0);
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const nextTop = container.scrollTop + (elRect.top - containerRect.top) - tocOffset - 12;
    container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
    setActiveSlug(slug);
  }, [tocCollapsed]);

  /** Custom heading components that inject id anchors */
  const mdComponents = useMemo(() => {
    const slugQueue = new Map<string, string[]>();
    for (const entry of toc) {
      const key = entry.text.trim();
      const list = slugQueue.get(key) ?? [];
      list.push(entry.slug);
      slugQueue.set(key, list);
    }
    const makeHeading = (Tag: 'h1' | 'h2' | 'h3') =>
      (props: any) => {
        const { node, ...rest } = props;
        const text = flattenText(props.children).replace(/\*\*/g, '').trim();
        const list = slugQueue.get(text) ?? [];
        const slug = list.shift() || slugify(text);
        const isActive = activeSlug === slug;
        return (
          <Tag
            id={slug}
            data-slug={slug}
            style={
              isActive
                ? {
                    background: 'rgba(124, 241, 199, 0.12)',
                    boxShadow: 'inset 0 -2px 0 rgba(124, 241, 199, 0.6)',
                    borderRadius: 3,
                    padding: '2px 4px',
                  }
                : undefined
            }
            {...rest}
          />
        );
      };
    return { h1: makeHeading('h1'), h2: makeHeading('h2'), h3: makeHeading('h3') };
  }, [renderText, activeSlug, toc]);

  return (
    <div style={styles.detail}>
      <div style={styles.detailHeader}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: 'var(--accent-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {isStreaming && <span style={styles.spinner} />}
            AI Executive Report
            {isClosed && <span style={{ color: 'var(--success)', fontSize: 11, textTransform: 'uppercase' }}>CLOSED</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: isStreaming ? 'var(--accent)' : 'var(--muted-2)', fontSize: 12, textTransform: 'uppercase' }}>
              {isStreaming ? 'STREAMING' : 'AI'}
            </span>
            <button
              onClick={handleExportPdf}
              style={{ ...styles.statusBtn, borderColor: 'var(--accent)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Print"
              aria-label="Print"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9V2h12v7" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M6 14h12v8H6z" />
              </svg>
            </button>
            {!isStreaming && (
              isClosed ? (
                <button onClick={handleReopen} style={{ ...styles.statusBtn, borderColor: 'var(--accent)', color: 'var(--accent)' }}>Reopen</button>
              ) : (
                <button onClick={handleClose} style={{ ...styles.statusBtn, borderColor: 'var(--success)', color: 'var(--success)' }}>Close</button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Table of Contents */}
      {toc.length > 0 && (
        <div style={styles.tocContainer} ref={tocRef}>
          <div
            style={styles.tocHeader}
            onClick={() => setTocCollapsed(c => !c)}
          >
            <span style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
              {tocCollapsed ? '▸' : '▾'} Contents
            </span>
          </div>
          {!tocCollapsed && (
            <ul style={styles.tocList}>
              {toc.map((entry, i) => (
                <li
                  key={`${entry.slug}-${i}`}
                  style={{
                    ...styles.tocItem,
                    paddingLeft: 8 + (entry.level - 1) * 14,
                    fontWeight: entry.level === 1 ? 600 : 400,
                    color: entry.level === 1 ? 'var(--accent-2)' : entry.level === 2 ? 'var(--text)' : 'var(--muted)',
                    background: activeSlug === entry.slug ? 'rgba(77, 178, 255, 0.12)' : 'transparent',
                    borderLeft: activeSlug === entry.slug ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                  onClick={() => scrollTo(entry.slug)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') scrollTo(entry.slug);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {entry.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={styles.detailBody} ref={bodyRef}>
        {!finding.report_text && isStreaming ? (
          <div style={{ padding: 20, color: 'var(--muted-2)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={styles.spinner} />
            Waiting for AI response...
          </div>
        ) : (
          <div className="md-report" style={styles.reportMarkdown} ref={reportRef}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {renderText || 'AI analysis pending...'}
            </ReactMarkdown>
            {isStreaming && <span style={styles.streamCursor}>|</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function RemediationView({ remediation }: { remediation: Finding['remediation'] }) {
  if (!remediation) return null;
  return (
    <div style={{ padding: 12 }}>
      {remediation.immediate_actions.length > 0 && (
        <Section title="Immediate Actions" color="#ff3333" steps={remediation.immediate_actions} />
      )}
      {remediation.short_term_actions.length > 0 && (
        <Section title="Short-Term Actions" color="#e6b450" steps={remediation.short_term_actions} />
      )}
      {remediation.long_term_actions.length > 0 && (
        <Section title="Long-Term Actions" color="#36a3d9" steps={remediation.long_term_actions} />
      )}
    </div>
  );
}

function Section({ title, color, steps }: { title: string; color: string; steps: string[] }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        {title}
      </div>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
          <span style={{ color: 'var(--muted-2)', minWidth: 16 }}>{i + 1}.</span>
          <span style={{ color: 'var(--text)', lineHeight: 1.6 }}>{step}</span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    height: '100%',
    background: 'var(--panel)',
    fontFamily: 'var(--font-ui)',
    color: 'var(--text)',
  },
  list: {
    width: 280,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflowX: 'hidden',
    overflowY: 'auto',
  },
  listHeader: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    fontSize: 13,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    background: 'var(--panel-3)',
  },
  findingRow: {
    padding: '10px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    transition: 'background 0.15s',
  },
  empty: {
    padding: 20,
    color: 'var(--muted-2)',
    textAlign: 'center',
    fontSize: 14,
  },
  detail: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  detailHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    fontSize: 15,
    color: 'var(--text)',
    background: 'var(--panel-3)',
  },
  statusBtn: {
    background: 'none',
    border: '1px solid var(--warning)',
    color: 'var(--warning)',
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    fontSize: 12,
    borderRadius: 3,
  },
  deleteBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--muted-2)',
    width: 20,
    height: 20,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    cursor: 'pointer',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
    background: 'var(--panel-3)',
  },
  tab: {
    background: 'none',
    border: 'none',
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'inherit',
  },
  detailBody: {
    flex: 1,
    overflow: 'auto',
  },
  tocContainer: {
    borderBottom: '1px solid var(--border)',
    background: 'var(--panel-2)',
    flexShrink: 0,
  },
  tocHeader: {
    padding: '6px 14px',
    cursor: 'pointer',
    userSelect: 'none',
  } as CSSProperties,
  tocList: {
    listStyle: 'none',
    margin: 0,
    padding: '0 8px 8px',
    maxHeight: 220,
    overflowY: 'auto',
    overflowX: 'hidden',
  } as CSSProperties,
  tocItem: {
    padding: '3px 8px',
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: 1.6,
    borderRadius: 3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    transition: 'background 0.12s',
  } as CSSProperties,
  reportMarkdown: {
    padding: '12px 16px',
    color: 'var(--text)',
    fontSize: 13,
    lineHeight: 1.7,
    fontFamily: 'var(--font-ui)',
    overflow: 'visible',
  },
  jsonView: {
    padding: 12,
    fontSize: 13,
    color: 'var(--text)',
    background: 'var(--panel-2)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  spinner: {
    display: 'inline-block',
    width: 14,
    height: 14,
    border: '2px solid var(--border)',
    borderTop: '2px solid var(--accent)',
    borderRadius: '50%',
    animation: 'ai-spin 0.8s linear infinite',
    flexShrink: 0,
  } as CSSProperties,
  dotPulse: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--accent)',
    animation: 'ai-pulse 1s ease-in-out infinite',
  } as CSSProperties,
  streamCursor: {
    color: 'var(--accent)',
    animation: 'ai-blink 0.6s step-end infinite',
    fontWeight: 700,
  } as CSSProperties,
  unreadDot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--accent)',
    flexShrink: 0,
  } as CSSProperties,
};
