import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { intelligenceApi } from '@/api/client';
import { useIntelligenceStore } from '@/store/intelligence';

interface TimelinePanelProps {
  assetId: string;
}

const EVENT_COLORS: Record<string, string> = {
  'session.created': '#36a3d9',
  'ssh.connected': '#b8cc52',
  'ssh.disconnected': '#ff6a00',
  'hunt.started': '#e6b450',
  'hunt.completed': '#b8cc52',
  'ai.finding_generated': '#ff6a00',
  default: 'var(--muted-2)',
};

export function TimelinePanel({ assetId }: TimelinePanelProps) {
  const { timelineEvents, setTimeline } = useIntelligenceStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!assetId) return;
    intelligenceApi.getTimeline(assetId)
      .then((res) => setTimeline(res.data))
      .catch(console.error);
  }, [assetId, setTimeline]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearTimeline = useCallback(async () => {
    if (!assetId || clearing) return;
    setClearing(true);
    try {
      await intelligenceApi.clearTimeline(assetId);
      setTimeline([]);
      setExpanded(new Set());
    } catch (e) {
      console.error('Failed to clear timeline:', e);
    } finally {
      setClearing(false);
    }
  }, [assetId, clearing, setTimeline]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>Asset Timeline</span>
        {timelineEvents.length > 0 && (
          <button
            onClick={clearTimeline}
            disabled={clearing}
            style={styles.clearBtn}
          >
            {clearing ? 'Clearing...' : 'Clear Timeline'}
          </button>
        )}
      </div>
      <div style={styles.timeline}>
        {timelineEvents.length === 0 && (
          <div style={styles.empty}>No timeline events</div>
        )}
        {timelineEvents.map((event) => {
          const isOpen = expanded.has(event.id);
          return (
            <div key={event.id} style={styles.event}>
              <div style={styles.dotCol}>
                <div style={eventDotStyle(event.event_type)} />
                {/* vertical connector line */}
                <div style={styles.dotLine} />
              </div>
              <div style={styles.eventContent}>
                <div
                  style={styles.eventHeader}
                  onClick={() => toggle(event.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(event.id); }}
                >
                  <span style={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
                  <span style={{ color: EVENT_COLORS[event.event_type] || EVENT_COLORS.default, fontSize: 13, flex: 1 }}>
                    {event.event_type}
                  </span>
                  <span style={{ color: 'var(--muted-2)', fontSize: 12, flexShrink: 0 }}>
                    {new Date(event.occurred_at).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>by {event.analyst_id}</div>
                {isOpen && (
                  <pre style={styles.jsonBlock}>
                    {JSON.stringify(event, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function eventDotStyle(type: string): CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: EVENT_COLORS[type] || EVENT_COLORS.default,
    marginTop: 4,
    flexShrink: 0,
  };
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--panel)',
    fontFamily: 'var(--font-ui)',
    color: 'var(--text)',
  },
  header: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    fontSize: 13,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    background: 'var(--panel-3)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearBtn: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--danger)',
    padding: '4px 10px',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'var(--font-ui)',
    fontWeight: 600,
    textTransform: 'none',
    letterSpacing: 0,
  },
  timeline: {
    flex: 1,
    overflow: 'auto',
    padding: 12,
  },
  event: {
    display: 'flex',
    gap: 10,
    alignItems: 'stretch',
    marginBottom: 0,
  },
  dotCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: 12,
    flexShrink: 0,
  },
  dotLine: {
    flex: 1,
    width: 1,
    background: 'var(--border)',
    marginTop: 4,
  },
  eventContent: {
    flex: 1,
    paddingBottom: 12,
    borderBottom: '1px solid var(--border)',
    marginBottom: 8,
  },
  eventHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    userSelect: 'none',
  } as CSSProperties,
  chevron: {
    fontSize: 11,
    color: 'var(--muted-2)',
    width: 12,
    textAlign: 'center',
    flexShrink: 0,
  },
  jsonBlock: {
    marginTop: 8,
    padding: '10px 12px',
    background: 'var(--panel-3)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--muted)',
    overflow: 'auto',
    maxHeight: 260,
    whiteSpace: 'pre',
    margin: 0,
    marginTop: 8,
  },
  empty: {
    color: 'var(--muted-2)',
    textAlign: 'center',
    padding: 20,
    fontSize: 14,
  },
};
