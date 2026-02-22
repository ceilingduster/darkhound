import { useEffect, useState, type CSSProperties } from 'react';
import { assetsApi, sessionsApi } from '@/api/client';
import { useSessionStore } from '@/store/session';

interface Asset {
  id: string;
  hostname: string;
  ip_address: string | null;
  os_type: string;
  os_version: string | null;
  tags: string[] | null;
  credential_vault_path: string | null;
  ssh_username: string | null;
  ssh_port: number | null;
  has_credentials: boolean;
}

interface AssetPanelProps {
  onSessionCreated?: (sessionId: string) => void;
  onManage?: () => void;
}

export function AssetPanel({ onSessionCreated, onManage }: AssetPanelProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<Asset | null>(null);

  const { addSession, setActiveSession } = useSessionStore();

  useEffect(() => {
    assetsApi.list()
      .then((res) => setAssets(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const startSession = async (assetId: string) => {
    try {
      const res = await sessionsApi.create({ asset_id: assetId, mode: 'ai' });
      const session = {
        id: res.data.id,
        asset_id: assetId,
        analyst_id: res.data.analyst_id,
        state: res.data.state,
        mode: res.data.mode,
        locked_by: res.data.locked_by,
      };
      addSession(session);
      setActiveSession(session.id);
      onSessionCreated?.(session.id);
    } catch (e) {
      console.error('Start session failed:', e);
    }
  };

  const deleteAsset = async (assetId: string) => {
    try {
      await assetsApi.delete(assetId);
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      setConfirmDelete(null);
    } catch (e) {
      console.error('Delete asset failed:', e);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>Assets</span>
        <button style={styles.manageBtn} onClick={onManage}>
          Manage
        </button>
      </div>

      <div style={styles.assetList}>
        {loading && <div style={styles.empty}>Loading assets...</div>}
        {!loading && assets.length === 0 && (
          <div style={styles.empty}>No assets. Add one to get started.</div>
        )}
        {assets.map((asset) => (
          <div key={asset.id} style={styles.assetRow}>
            <div style={styles.assetInfo}>
              <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 15 }}>
                {asset.ssh_username || 'root'}@{asset.ip_address || asset.hostname}
              </div>
              <div style={{ color: 'var(--accent)', fontSize: 12 }}>{asset.os_type}</div>
              {asset.has_credentials && (
                <div style={{ color: 'var(--success)', fontSize: 12, marginTop: 2 }}>Credentials set</div>
              )}
              {asset.tags && asset.tags.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {asset.tags.map((tag) => (
                    <span key={tag} style={styles.tag}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => startSession(asset.id)}
                style={styles.sessionBtn}
              >
                Start Session
              </button>
              <button
                onClick={() => setConfirmDelete(asset)}
                style={styles.deleteBtn}
                title="Delete asset"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div style={styles.modalOverlay} onClick={() => setConfirmDelete(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>Delete Asset</div>
            <div style={styles.modalBody}>
              Are you sure you want to delete <strong>{confirmDelete.hostname}</strong>
              {confirmDelete.ip_address ? ` (${confirmDelete.ip_address})` : ''}?
              This will also remove all related sessions, findings, and timeline events.
            </div>
            <div style={styles.modalActions}>
              <button onClick={() => setConfirmDelete(null)} style={styles.modalCancel}>Cancel</button>
              <button onClick={() => deleteAsset(confirmDelete.id)} style={styles.modalConfirm}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--panel)',
    fontFamily: 'var(--font-ui)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    fontSize: 13,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    background: 'var(--panel-3)',
  },
  manageBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    padding: '6px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    borderRadius: 3,
  },
  assetList: {
    flex: 1,
    overflow: 'auto',
  },
  assetRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    borderBottom: '1px solid var(--border)',
  },
  assetInfo: {
    flex: 1,
  },
  sessionBtn: {
    background: 'var(--panel-2)',
    color: 'var(--success)',
    border: '1px solid var(--border)',
    padding: '6px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    borderRadius: 3,
  },
  deleteBtn: {
    background: 'none',
    color: 'var(--muted-2)',
    border: '1px solid var(--border)',
    padding: '6px 8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    borderRadius: 3,
    lineHeight: 1,
    transition: 'color 0.15s, border-color 0.15s',
  } as CSSProperties,
  tag: {
    background: 'var(--chip)',
    color: 'var(--muted)',
    padding: '2px 6px',
    borderRadius: 3,
    fontSize: 12,
    marginRight: 4,
  },
  empty: {
    padding: 20,
    color: 'var(--muted-2)',
    textAlign: 'center',
    fontSize: 14,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(5, 8, 12, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    width: 380,
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
    marginBottom: 10,
  },
  modalBody: {
    fontSize: 13,
    color: 'var(--muted)',
    lineHeight: 1.6,
    marginBottom: 16,
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalCancel: {
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
  modalConfirm: {
    background: 'var(--danger)',
    color: '#fff',
    border: 'none',
    padding: '8px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
  },
};
