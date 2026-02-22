import { create } from 'zustand';

export type SessionState =
  | 'INITIALIZING' | 'CONNECTING' | 'CONNECTED' | 'RUNNING'
  | 'PAUSED' | 'LOCKED' | 'DISCONNECTED' | 'FAILED' | 'TERMINATED';

export interface Session {
  id: string;
  asset_id: string;
  analyst_id: string;
  state: SessionState;
  mode: 'ai' | 'interactive';
  locked_by: string | null;
}

interface SessionStore {
  sessions: Session[];
  activeSessionId: string | null;
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  activeSessionId: null,

  setSessions: (sessions) => set({ sessions }),

  addSession: (session) =>
    set((state) => ({ sessions: [...state.sessions, session] })),

  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),

  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
    })),

  setActiveSession: (id) => set({ activeSessionId: id }),
}));
