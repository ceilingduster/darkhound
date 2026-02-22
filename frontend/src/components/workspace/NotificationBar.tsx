import { useEffect, type CSSProperties } from 'react';
import { useNotificationStore } from '@/store/notifications';

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  error: { bg: '#2a1212', border: 'var(--danger)', text: 'var(--danger)' },
  warning: { bg: '#2b1f0f', border: 'var(--warning)', text: 'var(--warning)' },
  info: { bg: '#102033', border: 'var(--accent)', text: 'var(--accent)' },
};

export function NotificationBar() {
  const { notifications, dismissNotification } = useNotificationStore();

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    if (notifications.length === 0) return;
    const timers = notifications.map((n) =>
      setTimeout(() => dismissNotification(n.id), 10000)
    );
    return () => timers.forEach(clearTimeout);
  }, [notifications, dismissNotification]);

  if (notifications.length === 0) return null;

  return (
    <div style={styles.container}>
      {notifications.map((n) => {
        const colors = TYPE_COLORS[n.type] || TYPE_COLORS.info;
        return (
          <div
            key={n.id}
            style={{
              ...styles.notification,
              background: colors.bg,
              borderLeft: `3px solid ${colors.border}`,
            }}
          >
            <div style={{ flex: 1 }}>
              <span style={{ color: colors.text, fontSize: 13, fontWeight: 700 }}>
                {n.type.toUpperCase()}
              </span>
              {n.component && (
                <span style={{ color: 'var(--muted-2)', fontSize: 12, marginLeft: 8 }}>
                  [{n.component}]
                </span>
              )}
              <div style={{ color: 'var(--text)', fontSize: 13, marginTop: 2 }}>{n.message}</div>
            </div>
            <button
              onClick={() => dismissNotification(n.id)}
              style={styles.dismiss}
            >
              x
            </button>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '4px 8px',
    background: 'var(--panel-3)',
    borderBottom: '1px solid var(--border)',
  },
  notification: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '8px 12px',
    borderRadius: 4,
    fontFamily: 'var(--font-ui)',
  },
  dismiss: {
    background: 'none',
    border: 'none',
    color: 'var(--muted-2)',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    fontSize: 16,
    padding: '0 4px',
    marginLeft: 8,
  },
};
