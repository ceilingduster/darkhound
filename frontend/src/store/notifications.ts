import { create } from 'zustand';

export interface Notification {
  id: string;
  type: 'error' | 'warning' | 'info';
  message: string;
  component?: string;
  timestamp: number;
}

interface NotificationStore {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id' | 'timestamp'>) => void;
  dismissNotification: (id: string) => void;
  clearAll: () => void;
}

let _nextId = 0;

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  addNotification: (n) =>
    set((state) => {
      const id = `notif-${++_nextId}`;
      const notification: Notification = {
        ...n,
        id,
        timestamp: Date.now(),
      };
      // Keep max 10 notifications
      const updated = [notification, ...state.notifications].slice(0, 10);
      return { notifications: updated };
    }),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearAll: () => set({ notifications: [] }),
}));
