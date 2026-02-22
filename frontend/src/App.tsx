import React, { useState, useEffect, useRef, useCallback, type CSSProperties, type FormEvent } from 'react';
import { authApi, sessionsApi } from '@/api/client';
import { AssetPanel } from '@/components/assets/AssetPanel';
import { AssetManagerPage } from '@/components/assets/AssetManagerPage';
import { HuntManagerPage } from '@/components/hunt/HuntManagerPage';
import { SessionWorkspace } from '@/components/workspace/SessionWorkspace';
import { useSessionStore } from '@/store/session';

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await authApi.login(username, password);
      localStorage.setItem('access_token', res.data.access_token);
      localStorage.setItem('refresh_token', res.data.refresh_token);
      onLogin();
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={loginStyles.overlay}>
      <div style={loginStyles.box}>
        <img src="/darkhound-logo.png" alt="DarkHound" style={loginStyles.logo} />
        <form onSubmit={handleLogin} style={loginStyles.form}>
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={loginStyles.input}
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={loginStyles.input}
            autoComplete="current-password"
          />
          {error && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</div>}
          <button type="submit" disabled={loading} style={loginStyles.button}>
            {loading ? 'Authenticating...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('access_token'));
  const { sessions, setSessions, setActiveSession } = useSessionStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [tileWidths, setTileWidths] = useState<Record<string, number>>({});
  const [view, setView] = useState<'workspace' | 'assets' | 'hunts'>('workspace');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Edge-hover scrolling
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [edgeHover, setEdgeHover] = useState<'left' | 'right' | null>(null);

  const startEdgeScroll = useCallback((direction: 'left' | 'right') => {
    setEdgeHover(direction);
    if (scrollInterval.current) clearInterval(scrollInterval.current);
    scrollInterval.current = setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      el.scrollLeft += direction === 'right' ? 12 : -12;
    }, 16);
  }, []);

  const stopEdgeScroll = useCallback(() => {
    setEdgeHover(null);
    if (scrollInterval.current) {
      clearInterval(scrollInterval.current);
      scrollInterval.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (scrollInterval.current) clearInterval(scrollInterval.current);
    };
  }, []);

  // Restore active sessions from backend on reload
  useEffect(() => {
    if (!authed) return;
    // Only restore if the store is empty (i.e. fresh page load, not a re-render)
    if (sessions.length > 0) return;
    sessionsApi.list().then((res) => {
      const active = res.data.filter(
        (s: any) => !['TERMINATED', 'FAILED'].includes(s.state)
      );
      // Deduplicate by asset — keep only the most recent session per asset
      const byAsset = new Map<string, any>();
      for (const s of active) {
        const existing = byAsset.get(s.asset_id);
        if (!existing) {
          byAsset.set(s.asset_id, s);
        }
      }
      const deduped = Array.from(byAsset.values());
      if (deduped.length > 0) {
        setSessions(
          deduped.map((s: any) => ({
            id: s.id,
            asset_id: s.asset_id,
            analyst_id: s.analyst_id,
            state: s.state,
            mode: s.mode,
            locked_by: s.locked_by,
          }))
        );
        setActiveSession(deduped[0].id);
      }
    }).catch(() => {});
  }, [authed]); // eslint-disable-line react-hooks/exhaustive-deps

  const tileTheme = (index: number): CSSProperties => {
    if (index % 2 === 0) {
      return {
        '--panel': '#102038',
        '--panel-2': '#132845',
        '--panel-3': '#0c1a30',
      } as CSSProperties;
    }
    return {
      '--panel': '#0b1628',
      '--panel-2': '#0f1e33',
      '--panel-3': '#091221',
    } as CSSProperties;
  };

  useEffect(() => {
    const check = () => setAuthed(!!localStorage.getItem('access_token'));
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  useEffect(() => {
    if (sessions.length === 0) return;
    setTileWidths((prev) => {
      const next = { ...prev };
      for (const session of sessions) {
        if (!next[session.id]) next[session.id] = 750;
      }
      return next;
    });
  }, [sessions]);

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setSessions([]);
    setActiveSession(null);
    setAuthed(false);
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (!currentPassword || !newPassword) {
      setPasswordError('Enter your current and new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setPasswordSaving(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSettingsOpen(false);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to change password.';
      setPasswordError(String(msg));
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div style={appStyles.root}>
      {/* Sidebar — hidden when a full-page manager is open */}
      {view === 'workspace' && !sidebarCollapsed && (
      <div style={appStyles.sidebar}>
        <div style={appStyles.header}>
          <div style={appStyles.logo}>
            <img src="/darkhound-logo-text.png" alt="DarkHound" style={appStyles.logoText} />
          </div>
          <button
            onClick={() => setSidebarCollapsed(true)}
            style={appStyles.collapseBtn}
            title="Collapse sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
        <AssetPanel onSessionCreated={() => {}} onManage={() => setView('assets')} />
        <div style={appStyles.sidebarFooter}>
          <button
            onClick={() => setView('hunts')}
            style={appStyles.logoutBtn}
            title="Hunt Manager"
          >
            Hunt Modules
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            style={appStyles.iconBtn}
            aria-label="Settings"
            title="Settings"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a7.97 7.97 0 0 0 .1-2 7.97 7.97 0 0 0-.1-2l2-1.6-2-3.4-2.3.9a7.92 7.92 0 0 0-3.4-2l-.4-2.5h-4l-.4 2.5a7.92 7.92 0 0 0-3.4 2l-2.3-.9-2 3.4 2 1.6a7.97 7.97 0 0 0-.1 2 7.97 7.97 0 0 0 .1 2l-2 1.6 2 3.4 2.3-.9a7.92 7.92 0 0 0 3.4 2l.4 2.5h4l.4-2.5a7.92 7.92 0 0 0 3.4-2l2.3.9 2-3.4-2-1.6z" />
            </svg>
          </button>
          <button onClick={handleLogout} style={appStyles.logoutBtn}>Logout</button>
        </div>
      </div>
      )}
      {/* Collapsed sidebar strip */}
      {view === 'workspace' && sidebarCollapsed && (
        <div style={appStyles.sidebarCollapsed}>
          <button
            onClick={() => setSidebarCollapsed(false)}
            style={appStyles.expandBtn}
            title="Expand sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}

      {/* Main workspace */}
      <div style={appStyles.main}>
        {view === 'assets' ? (
          <AssetManagerPage onClose={() => setView('workspace')} />
        ) : view === 'hunts' ? (
          <HuntManagerPage onClose={() => setView('workspace')} />
        ) : (
          sessions.length > 0 ? (
            <div style={appStyles.scrollWrapper}>
              {/* Left edge scroll zone */}
              <div
                style={{
                  ...appStyles.edgeZoneLeft,
                  opacity: edgeHover === 'left' ? 1 : 0,
                }}
                onMouseEnter={() => startEdgeScroll('left')}
                onMouseLeave={stopEdgeScroll}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </div>
              {/* Right edge scroll zone */}
              <div
                style={{
                  ...appStyles.edgeZoneRight,
                  opacity: edgeHover === 'right' ? 1 : 0,
                }}
                onMouseEnter={() => startEdgeScroll('right')}
                onMouseLeave={stopEdgeScroll}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
              <div ref={scrollerRef} style={appStyles.workspaceScroller}>
              <div style={appStyles.workspaceRow}>
                {sessions.map((session, index) => (
                  <React.Fragment key={session.id}>
                    <div
                      style={{
                        ...appStyles.workspaceTile,
                        ...tileTheme(index),
                        width: tileWidths[session.id] || 750,
                        minWidth: tileWidths[session.id] || 750,
                      }}
                    >
                      <SessionWorkspace sessionId={session.id} />
                    </div>
                    <div
                      style={appStyles.resizeHandle}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const startX = e.clientX;
                        const startWidth = tileWidths[session.id] || 750;

                        const onMove = (ev: MouseEvent) => {
                          const nextWidth = Math.max(750, startWidth + (ev.clientX - startX));
                          setTileWidths((prev) => ({ ...prev, [session.id]: nextWidth }));
                        };

                        const onUp = () => {
                          window.removeEventListener('mousemove', onMove);
                          window.removeEventListener('mouseup', onUp);
                        };

                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                      }}
                    >
                      <span style={appStyles.resizeGrip}>⋮</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
              </div>
            </div>
          ) : (
            <div style={appStyles.empty}>
              <div style={appStyles.emptyText}>Select an asset and start a session</div>
            </div>
          )
        )}
      </div>

      {settingsOpen && (
        <div style={appStyles.modalOverlay} onClick={() => setSettingsOpen(false)}>
          <div style={appStyles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={appStyles.modalTitle}>Account Settings</div>
            <form onSubmit={handleChangePassword} style={appStyles.modalForm}>
              <input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={appStyles.modalInput}
                autoComplete="current-password"
              />
              <input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={appStyles.modalInput}
                autoComplete="new-password"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={appStyles.modalInput}
                autoComplete="new-password"
              />
              {passwordError && <div style={appStyles.modalError}>{passwordError}</div>}
              <div style={appStyles.modalActions}>
                <button type="button" onClick={() => setSettingsOpen(false)} style={appStyles.modalSecondary}>Cancel</button>
                <button type="submit" disabled={passwordSaving} style={appStyles.modalPrimary}>
                  {passwordSaving ? 'Saving...' : 'Change password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const appStyles: Record<string, CSSProperties> = {
  root: {
    display: 'flex',
    height: '100vh',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: 'var(--font-ui)',
  },
  sidebar: {
    width: 330,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--panel-3)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--panel-3)',
    position: 'relative',
  },
  collapseBtn: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--muted)',
    width: 24,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    cursor: 'pointer',
    padding: 0,
    transition: 'color 0.15s, border-color 0.15s',
  },
  sidebarCollapsed: {
    width: 36,
    minWidth: 36,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'var(--panel-3)',
    paddingTop: 10,
  },
  expandBtn: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--muted)',
    width: 26,
    height: 26,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    cursor: 'pointer',
    padding: 0,
    transition: 'color 0.15s, border-color 0.15s',
  },
  sidebarFooter: {
    marginTop: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '10px 12px',
    borderTop: '1px solid var(--border)',
    background: 'var(--panel-3)',
    flexShrink: 0,
  },
  logo: {
    color: 'var(--accent)',
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 1.5,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  logoImg: {
    width: 26,
    height: 26,
    objectFit: 'contain',
  },
  logoText: {
    height: 75,
    objectFit: 'contain',
    textAlign: 'center'
  },
  iconBtn: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--muted)',
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    cursor: 'pointer',
  },
  logoutBtn: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--muted)',
    padding: '6px 10px',
    cursor: 'pointer',
    borderRadius: 4,
    fontFamily: 'var(--font-ui)',
    fontSize: 12,
    fontWeight: 600,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(5, 8, 12, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  modal: {
    width: 420,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 20,
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: 12,
  },
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  modalInput: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    padding: '10px 12px',
    borderRadius: 4,
    fontFamily: 'var(--font-ui)',
    fontSize: 14,
    outline: 'none',
  },
  modalError: {
    color: 'var(--danger)',
    fontSize: 13,
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 6,
  },
  modalPrimary: {
    background: 'var(--accent)',
    color: '#0b0f14',
    border: 'none',
    padding: '8px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
  },
  modalSecondary: {
    background: 'var(--panel-2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    padding: '8px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    background: 'var(--panel)',
  },
  scrollWrapper: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  edgeZoneLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 36,
    height: '100%',
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(200,210,225,0.7)',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    background: 'linear-gradient(to right, rgba(11,15,20,0.9), transparent)',
  } as CSSProperties,
  edgeZoneRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 36,
    height: '100%',
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(200,210,225,0.7)',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    background: 'linear-gradient(to left, rgba(11,15,20,0.9), transparent)',
  } as CSSProperties,
  workspaceScroller: {
    width: '100%',
    height: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
  },
  workspaceRow: {
    display: 'flex',
    height: '100%',
    width: 'max-content',
  },
  workspaceTile: {
    height: '100%',
    background: 'var(--panel)',
    flex: '0 0 auto',
    position: 'relative',
  },
  resizeHandle: {
    flex: '0 0 15px',
    width: 15,
    height: '100%',
    cursor: 'ew-resize',
    background: '#1a1e24',
    borderLeft: '1px solid #2a2e36',
    borderRight: '1px solid #2a2e36',
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s',
  },
  resizeGrip: {
    color: '#555e6b',
    fontSize: 16,
    lineHeight: 1,
    userSelect: 'none',
    pointerEvents: 'none',
    letterSpacing: 2,
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyLogo: {
    width: 120,
    height: 120,
    objectFit: 'contain',
    opacity: 0.25,
  },
  emptyText: {
    color: 'var(--muted)',
    fontSize: 16,
    letterSpacing: 0.5,
  },
};

const loginStyles: Record<string, CSSProperties> = {
  overlay: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
  },
  box: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 40,
    width: 360,
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.45)',
  },
  logo: {
    width: 250,
    height: 250,
    objectFit: 'contain',
    display: 'block',
    margin: '0 auto 16px',
  },
  title: {
    color: 'var(--accent)',
    fontSize: 30,
    fontWeight: 700,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: 'var(--muted-2)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
    letterSpacing: 0.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  input: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    padding: '10px 14px',
    borderRadius: 4,
    fontFamily: 'var(--font-ui)',
    fontSize: 16,
    outline: 'none',
  },
  button: {
    background: 'var(--accent)',
    color: '#0b0f14',
    border: 'none',
    padding: '12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 15,
    fontFamily: 'var(--font-ui)',
    letterSpacing: 0.5,
    marginTop: 4,
  },
};
