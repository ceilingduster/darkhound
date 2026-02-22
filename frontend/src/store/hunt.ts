import { create } from 'zustand';

export type HuntStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface HuntStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface Hunt {
  id: string;
  session_id: string;
  module_id: string;
  run_ai: boolean;
  status: HuntStatus;
  steps: HuntStep[];
  findings_count: number;
  reasoning_text: string;
  reasoning_state: 'analyzing' | 'concluding' | 'generating' | null;
  error: string | null;
  outputs: Record<string, string>;
}

interface HuntStore {
  hunts: Record<string, Hunt>; // hunt_id -> Hunt
  activeHuntId: string | null;
  addHunt: (hunt: Hunt) => void;
  updateHunt: (id: string, updates: Partial<Hunt>) => void;
  appendReasoning: (id: string, chunk: string, state: Hunt['reasoning_state']) => void;
  setStepStatus: (huntId: string, stepId: string, status: HuntStep['status']) => void;
  appendOutput: (huntId: string, stepId: string, output: string) => void;
  setActiveHunt: (id: string | null) => void;
}

export const useHuntStore = create<HuntStore>((set) => ({
  hunts: {},
  activeHuntId: null,

  addHunt: (hunt) =>
    set((state) => ({ hunts: { ...state.hunts, [hunt.id]: hunt } })),

  updateHunt: (id, updates) =>
    set((state) => ({
      hunts: {
        ...state.hunts,
        [id]: state.hunts[id] ? { ...state.hunts[id], ...updates } : state.hunts[id],
      },
    })),

  appendReasoning: (id, chunk, reasoning_state) =>
    set((state) => {
      const hunt = state.hunts[id];
      if (!hunt) return state;
      return {
        hunts: {
          ...state.hunts,
          [id]: {
            ...hunt,
            reasoning_text: hunt.reasoning_text + chunk,
            reasoning_state,
          },
        },
      };
    }),

  setStepStatus: (huntId, stepId, status) =>
    set((state) => {
      const hunt = state.hunts[huntId];
      if (!hunt) return state;
      return {
        hunts: {
          ...state.hunts,
          [huntId]: {
            ...hunt,
            steps: hunt.steps.map((s) =>
              s.id === stepId ? { ...s, status } : s
            ),
          },
        },
      };
    }),

  appendOutput: (huntId, stepId, output) =>
    set((state) => {
      const hunt = state.hunts[huntId];
      if (!hunt) return state;
      const prev = hunt.outputs[stepId] || '';
      return {
        hunts: {
          ...state.hunts,
          [huntId]: {
            ...hunt,
            outputs: {
              ...hunt.outputs,
              [stepId]: prev + output,
            },
          },
        },
      };
    }),

  setActiveHunt: (id) => set({ activeHuntId: id }),
}));
