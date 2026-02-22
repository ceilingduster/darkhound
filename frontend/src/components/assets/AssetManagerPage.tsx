import { useEffect, useMemo, useRef, useState, useCallback, type CSSProperties, type KeyboardEvent } from 'react';
import { assetsApi } from '@/api/client';

/* ── Tag Input Component ──────────────────────────────────────────────────── */
function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (tags: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = useCallback((raw: string) => {
    const tag = raw.trim();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput('');
  }, [tags, onChange]);

  const removeTag = useCallback((index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  }, [tags, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (input.trim()) {
        e.preventDefault();
        addTag(input);
      } else if (e.key === ',') {
        e.preventDefault();
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }, [input, tags, addTag, removeTag]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const parts = pasted.split(/[,;\n\t]+/).map(s => s.trim()).filter(Boolean);
    const unique = parts.filter(p => !tags.includes(p));
    if (unique.length) onChange([...tags, ...unique]);
  }, [tags, onChange]);

  return (
    <div
      style={tagInputStyles.wrapper}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, i) => (
        <span key={`${tag}-${i}`} style={tagInputStyles.pill}>
          {tag}
          <span style={tagInputStyles.remove} onClick={(e) => { e.stopPropagation(); removeTag(i); }}>×</span>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => { if (input.trim()) addTag(input); }}
        placeholder={tags.length === 0 ? (placeholder || 'Type and press Enter') : ''}
        style={tagInputStyles.input}
      />
    </div>
  );
}

const tagInputStyles: Record<string, CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    padding: '4px 8px',
    minHeight: 36,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    cursor: 'text',
    alignItems: 'center',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: 'var(--accent)',
    color: '#0b0f14',
    padding: '2px 8px',
    borderRadius: 3,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: '18px',
    whiteSpace: 'nowrap',
  },
  remove: {
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: '14px',
    opacity: 0.7,
  },
  input: {
    flex: 1,
    minWidth: 80,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'var(--text)',
    fontFamily: 'inherit',
    fontSize: 13,
    padding: '4px 0',
  },
};

/* ── SSH Key Upload ───────────────────────────────────────────────────────── */
function SshKeyUpload({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: CSSProperties }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    onChange(text.trim());
  }, [onChange]);

  return (
    <div style={{ ...style, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            background: 'var(--panel-2)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            padding: '6px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 14 }}>📁</span> Upload SSH Key
        </button>
        {value && (
          <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
            {value.startsWith('ssh-') ? value.slice(0, 40) + '…' : 'Key loaded (' + value.length + ' chars)'}
          </span>
        )}
        {value && (
          <span
            onClick={() => onChange('')}
            style={{ cursor: 'pointer', color: 'var(--danger)', fontSize: 12 }}
          >✕ Clear</span>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          if (fileRef.current) fileRef.current.value = '';
        }}
      />
      <textarea
        placeholder="Or paste SSH key (OpenSSH format)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: 'var(--panel-2)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          padding: '8px 10px',
          borderRadius: 4,
          fontFamily: 'monospace',
          fontSize: 12,
          minHeight: 60,
          resize: 'vertical',
        }}
      />
    </div>
  );
}

interface AssetRow {
  id: string;
  hostname: string;
  ip_address: string | null;
  os_type: string;
  os_version: string | null;
  tags: string[] | null;
  credential_vault_path: string | null;
  ssh_port: number | null;
  sudo_method: string | null;
  has_credentials: boolean;
}

interface AssetManagerPageProps {
  onClose: () => void;
}

const CSV_COLUMNS = [
  'id',
  'hostname',
  'ip_address',
  'os_type',
  'os_version',
  'tags',
  'ssh_port',
  'ssh_username',
  'ssh_password',
  'ssh_key',
  'sudo_method',
  'sudo_password',
] as const;

type CsvRow = Record<string, string>;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        value += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(value);
      value = '';
    } else if (ch === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else if (ch === '\r') {
      // Ignore CR; handle LF
    } else {
      value += ch;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function toCsv(rows: CsvRow[], columns: readonly string[]): string {
  const escape = (v: string) => {
    if (v.includes('"') || v.includes(',') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(String(row[c] ?? ''))).join(','));
  }
  return lines.join('\n');
}

function normalizeTags(tags: string): string[] {
  return tags
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function AssetManagerPage({ onClose }: AssetManagerPageProps) {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [osFilter, setOsFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Record<string, any>>({});
  const [newAsset, setNewAsset] = useState({
    hostname: '',
    ip_address: '',
    os_type: 'linux',
    os_version: '',
    tags: [] as string[],
    ssh_port: '',
    ssh_username: '',
    ssh_password: '',
    ssh_key: '',
    sudo_method: '',
    sudo_password: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    assetsApi.list()
      .then((res) => setAssets(res.data))
      .catch((err) => setError(err.message || 'Failed to load assets'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (osFilter !== 'all' && a.os_type !== osFilter) return false;
      if (!term) return true;
      const tags = (a.tags || []).join(' ').toLowerCase();
      return [a.hostname, a.ip_address || '', a.os_type, a.os_version || '', tags]
        .some((v) => v.toLowerCase().includes(term));
    });
  }, [assets, search, osFilter]);

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.map((a) => a.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createAsset = async () => {
    try {
      const payload: Record<string, unknown> = {
        hostname: newAsset.hostname,
        ip_address: newAsset.ip_address || undefined,
        os_type: newAsset.os_type,
        os_version: newAsset.os_version || undefined,
        tags: newAsset.tags.length > 0 ? newAsset.tags : undefined,
        ssh_port: newAsset.ssh_port ? parseInt(newAsset.ssh_port, 10) : undefined,
        ssh_username: newAsset.ssh_username || undefined,
        ssh_password: newAsset.ssh_password || undefined,
        ssh_key: newAsset.ssh_key || undefined,
        sudo_method: newAsset.sudo_method || undefined,
        sudo_password: newAsset.sudo_password || undefined,
      };
      const res = await assetsApi.create(payload);
      setAssets((prev) => [res.data, ...prev]);
      setNewAsset({
        hostname: '',
        ip_address: '',
        os_type: 'linux',
        os_version: '',
        tags: [],
        ssh_port: '',
        ssh_username: '',
        ssh_password: '',
        ssh_key: '',
        sudo_method: '',
        sudo_password: '',
      });
    } catch (e: any) {
      setError(e?.message || 'Create asset failed');
    }
  };

  const saveAsset = async (id: string) => {
    const next = editing[id];
    if (!next) return;
    try {
      const payload: Record<string, unknown> = {
        hostname: next.hostname,
        ip_address: next.ip_address || undefined,
        os_type: next.os_type,
        os_version: next.os_version || undefined,
        tags: next.tags?.length > 0 ? next.tags : undefined,
        ssh_port: next.ssh_port ? parseInt(next.ssh_port, 10) : undefined,
        ssh_username: next.ssh_username || undefined,
        ssh_password: next.ssh_password || undefined,
        ssh_key: next.ssh_key || undefined,
        sudo_method: next.sudo_method || undefined,
        sudo_password: next.sudo_password || undefined,
      };
      const res = await assetsApi.update(id, payload);
      setAssets((prev) => prev.map((a) => (a.id === id ? res.data : a)));
      setEditing((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } catch (e: any) {
      setError(e?.message || 'Update asset failed');
    }
  };

  const deleteAsset = async (id: string) => {
    try {
      await assetsApi.delete(id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e: any) {
      setError(e?.message || 'Delete asset failed');
    }
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    for (const id of ids) {
      // Best-effort delete; continue on errors
      try {
        await assetsApi.delete(id);
      } catch {
        // ignore
      }
    }
    setAssets((prev) => prev.filter((a) => !selected.has(a.id)));
    setSelected(new Set());
  };

  const exportCsv = () => {
    const rows: CsvRow[] = assets.map((a) => ({
      id: a.id,
      hostname: a.hostname,
      ip_address: a.ip_address || '',
      os_type: a.os_type,
      os_version: a.os_version || '',
      tags: (a.tags || []).join(';'),
      ssh_port: a.ssh_port?.toString() || '',
      ssh_username: '',
      ssh_password: '',
      ssh_key: '',
      sudo_method: a.sudo_method || '',
      sudo_password: '',
    }));
    const csv = toCsv(rows, CSV_COLUMNS);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `assets-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) return;
    const header = rows[0].map((h) => h.trim());
    const colIndex = (name: string) => header.indexOf(name);

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.length === 0 || !row.some((v) => v.trim())) continue;

      const data: CsvRow = {};
      for (let c = 0; c < header.length; c += 1) {
        data[header[c]] = row[c] || '';
      }

      const payload: Record<string, unknown> = {
        hostname: data.hostname || data.hostname === '' ? data.hostname : row[colIndex('hostname')],
        ip_address: data.ip_address || undefined,
        os_type: data.os_type || 'linux',
        os_version: data.os_version || undefined,
        tags: data.tags ? normalizeTags(data.tags) : undefined,
        ssh_port: data.ssh_port ? parseInt(data.ssh_port, 10) : undefined,
        ssh_username: data.ssh_username || undefined,
        ssh_password: data.ssh_password || undefined,
        ssh_key: data.ssh_key || undefined,
        sudo_method: data.sudo_method || undefined,
        sudo_password: data.sudo_password || undefined,
      };

      const id = data.id || '';
      try {
        if (id && assets.find((a) => a.id === id)) {
          const res = await assetsApi.update(id, payload);
          setAssets((prev) => prev.map((a) => (a.id === id ? res.data : a)));
        } else {
          const res = await assetsApi.create(payload);
          setAssets((prev) => [res.data, ...prev]);
        }
      } catch {
        // ignore bad rows
      }
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <div>
          <div style={styles.title}>Asset Manager</div>
          <div style={styles.subtitle}>Manage, search, filter, export and import assets</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.secondaryBtn} onClick={exportCsv}>Export CSV</button>
          <button
            style={styles.secondaryBtn}
            onClick={() => fileInputRef.current?.click()}
          >
            Import CSV
          </button>
          <button style={styles.primaryBtn} onClick={onClose}>Back</button>
        </div>
      </div>

      <div style={styles.toolbar}>
        <input
          placeholder="Search hostname, IP, OS, tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.search}
        />
        <select value={osFilter} onChange={(e) => setOsFilter(e.target.value)} style={styles.select}>
          <option value="all">All OS</option>
          <option value="linux">Linux</option>
          <option value="windows">Windows</option>
          <option value="macos">macOS</option>
          <option value="unknown">Unknown</option>
        </select>
        <button style={styles.secondaryBtn} onClick={deleteSelected} disabled={selected.size === 0}>
          Delete Selected ({selected.size})
        </button>
      </div>

      <div style={styles.tableWrap}>
        {loading && <div style={styles.empty}>Loading assets...</div>}
        {error && <div style={{ ...styles.empty, color: 'var(--danger)' }}>{error}</div>}
        {!loading && filtered.length === 0 && (
          <div style={styles.empty}>No assets match the current filters.</div>
        )}
        {!loading && filtered.length > 0 && (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === filtered.length}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th style={styles.th}>Hostname</th>
                <th style={styles.th}>IP</th>
                <th style={styles.th}>OS</th>
                <th style={styles.th}>Version</th>
                <th style={styles.th}>Tags</th>
                <th style={styles.th}>Creds</th>
                <th style={styles.th}>Sudo</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset) => {
                const edit = editing[asset.id];
                return (
                  <tr key={asset.id} style={styles.tr}>
                    <td style={styles.td}>
                      <input
                        type="checkbox"
                        checked={selected.has(asset.id)}
                        onChange={() => toggleOne(asset.id)}
                      />
                    </td>
                    <td style={styles.td}>
                      {edit ? (
                        <input
                          value={edit.hostname}
                          onChange={(e) => setEditing((prev) => ({ ...prev, [asset.id]: { ...edit, hostname: e.target.value } }))}
                          style={styles.inlineInput}
                        />
                      ) : asset.hostname}
                    </td>
                    <td style={styles.td}>
                      {edit ? (
                        <input
                          value={edit.ip_address || ''}
                          onChange={(e) => setEditing((prev) => ({ ...prev, [asset.id]: { ...edit, ip_address: e.target.value } }))}
                          style={styles.inlineInput}
                        />
                      ) : (asset.ip_address || '-')}
                    </td>
                    <td style={styles.td}>
                      {edit ? (
                        <select
                          value={edit.os_type}
                          onChange={(e) => setEditing((prev) => ({ ...prev, [asset.id]: { ...edit, os_type: e.target.value } }))}
                          style={styles.inlineSelect}
                        >
                          <option value="linux">linux</option>
                          <option value="windows">windows</option>
                          <option value="macos">macos</option>
                          <option value="unknown">unknown</option>
                        </select>
                      ) : asset.os_type}
                    </td>
                    <td style={styles.td}>
                      {edit ? (
                        <input
                          value={edit.os_version || ''}
                          onChange={(e) => setEditing((prev) => ({ ...prev, [asset.id]: { ...edit, os_version: e.target.value } }))}
                          style={styles.inlineInput}
                        />
                      ) : (asset.os_version || '-')}
                    </td>
                    <td style={styles.td}>
                      {edit ? (
                        <TagInput
                          tags={edit.tags || []}
                          onChange={(tags) => setEditing((prev) => ({ ...prev, [asset.id]: { ...edit, tags } }))}
                          placeholder="Add tag…"
                        />
                      ) : (asset.tags?.join(', ') || '-')}
                    </td>
                    <td style={styles.td}>
                      {asset.has_credentials ? 'Yes' : 'No'}
                    </td>
                    <td style={styles.td}>
                      {edit ? (
                        <select
                          value={edit.sudo_method}
                          onChange={(e) => setEditing((prev) => ({ ...prev, [asset.id]: { ...edit, sudo_method: e.target.value } }))}
                          style={styles.inlineSelect}
                        >
                          <option value="">No Sudo</option>
                          <option value="nopasswd">NOPASSWD</option>
                          <option value="ssh_password">Use SSH Password</option>
                          <option value="custom_password">Custom Password</option>
                        </select>
                      ) : (
                        <span style={{ fontSize: 12, color: asset.sudo_method ? 'var(--accent)' : 'var(--muted-2)' }}>
                          {asset.sudo_method === 'nopasswd' ? 'NOPASSWD' : asset.sudo_method === 'ssh_password' ? 'SSH Pass' : asset.sudo_method === 'custom_password' ? 'Custom' : '-'}
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>
                      {edit ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={styles.primaryBtnSmall} onClick={() => saveAsset(asset.id)}>Save</button>
                          <button style={styles.secondaryBtnSmall} onClick={() => setEditing((prev) => {
                            const copy = { ...prev };
                            delete copy[asset.id];
                            return copy;
                          })}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            style={styles.secondaryBtnSmall}
                            onClick={() => setEditing((prev) => ({
                              ...prev,
                              [asset.id]: {
                                hostname: asset.hostname,
                                ip_address: asset.ip_address || '',
                                os_type: asset.os_type,
                                os_version: asset.os_version || '',
                                tags: [...(asset.tags || [])],
                                ssh_port: (asset.ssh_port || '').toString(),
                                ssh_username: '',
                                ssh_password: '',
                                ssh_key: '',
                                sudo_method: asset.sudo_method || '',
                                sudo_password: '',
                              },
                            }))}
                          >
                            Edit
                          </button>
                          <button style={styles.deleteBtnSmall} onClick={() => deleteAsset(asset.id)}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={styles.createPanel}>
        <div style={styles.createTitle}>Create New Asset</div>
        <div style={styles.grid}>
          <input
            placeholder="Hostname"
            value={newAsset.hostname}
            onChange={(e) => setNewAsset({ ...newAsset, hostname: e.target.value })}
            style={styles.input}
          />
          <input
            placeholder="IP Address"
            value={newAsset.ip_address}
            onChange={(e) => setNewAsset({ ...newAsset, ip_address: e.target.value })}
            style={styles.input}
          />
          <select
            value={newAsset.os_type}
            onChange={(e) => setNewAsset({ ...newAsset, os_type: e.target.value })}
            style={styles.input}
          >
            <option value="linux">linux</option>
            <option value="windows">windows</option>
            <option value="macos">macos</option>
            <option value="unknown">unknown</option>
          </select>
          <input
            placeholder="OS Version"
            value={newAsset.os_version}
            onChange={(e) => setNewAsset({ ...newAsset, os_version: e.target.value })}
            style={styles.input}
          />
          <TagInput
            tags={newAsset.tags}
            onChange={(tags) => setNewAsset({ ...newAsset, tags })}
            placeholder="Add tags…"
          />
          <input
            placeholder="SSH Port (default: 22)"
            type="number"
            value={newAsset.ssh_port}
            onChange={(e) => setNewAsset({ ...newAsset, ssh_port: e.target.value })}
            style={styles.input}
          />
          <input
            placeholder="SSH Username"
            value={newAsset.ssh_username}
            onChange={(e) => setNewAsset({ ...newAsset, ssh_username: e.target.value })}
            style={styles.input}
          />
          <input
            type="password"
            placeholder="SSH Password"
            value={newAsset.ssh_password}
            onChange={(e) => setNewAsset({ ...newAsset, ssh_password: e.target.value })}
            style={styles.input}
          />
          <select
            value={newAsset.sudo_method}
            onChange={(e) => setNewAsset({ ...newAsset, sudo_method: e.target.value, sudo_password: e.target.value === 'custom_password' ? newAsset.sudo_password : '' })}
            style={styles.input}
          >
            <option value="">No Sudo</option>
            <option value="nopasswd">NOPASSWD (passwordless)</option>
            <option value="ssh_password">Use SSH Password</option>
            <option value="custom_password">Custom Sudo Password</option>
          </select>
          {newAsset.sudo_method === 'custom_password' && (
            <input
              type="password"
              placeholder="Sudo Password"
              value={newAsset.sudo_password}
              onChange={(e) => setNewAsset({ ...newAsset, sudo_password: e.target.value })}
              style={styles.input}
            />
          )}
          <SshKeyUpload
            value={newAsset.ssh_key}
            onChange={(v) => setNewAsset({ ...newAsset, ssh_key: v })}
            style={{ gridColumn: 'span 3' }}
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <button style={styles.primaryBtn} onClick={createAsset}>Create Asset</button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importCsv(file);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--panel)',
    color: 'var(--text)',
    fontFamily: 'var(--font-ui)',
    maxWidth: 1400,
    margin: '0 auto',
    width: '100%',
  },
  pageHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--panel-3)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 18,
    color: 'var(--text)',
    fontWeight: 600,
  },
  subtitle: {
    fontSize: 12,
    color: 'var(--muted)',
  },
  toolbar: {
    padding: '10px 16px',
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    borderBottom: '1px solid var(--border)',
    background: 'var(--panel-2)',
  },
  search: {
    flex: 1,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    padding: '8px 10px',
    borderRadius: 4,
    fontFamily: 'inherit',
    fontSize: 13,
  },
  select: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    padding: '8px 10px',
    borderRadius: 4,
    fontFamily: 'inherit',
    fontSize: 13,
  },
  tableWrap: {
    flex: 1,
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    fontSize: 12,
    color: 'var(--muted)',
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--panel-3)',
  },
  tr: {
    borderBottom: '1px solid var(--border)',
  },
  td: {
    padding: '8px 10px',
    fontSize: 13,
    verticalAlign: 'top',
  },
  inlineInput: {
    width: '100%',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    padding: '6px 8px',
    borderRadius: 3,
    fontSize: 12,
    fontFamily: 'inherit',
  },
  inlineSelect: {
    width: '100%',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    padding: '6px 8px',
    borderRadius: 3,
    fontSize: 12,
    fontFamily: 'inherit',
  },
  createPanel: {
    borderTop: '1px solid var(--border)',
    padding: '14px 16px',
    background: 'var(--panel-3)',
  },
  createTitle: {
    fontSize: 13,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 8,
  },
  input: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    padding: '8px 10px',
    borderRadius: 4,
    fontFamily: 'inherit',
    fontSize: 13,
  },
  primaryBtn: {
    background: 'var(--accent)',
    color: '#0b0f14',
    border: 'none',
    padding: '8px 14px',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 700,
    fontFamily: 'inherit',
    fontSize: 13,
  },
  secondaryBtn: {
    background: 'var(--panel-2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    padding: '8px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
  },
  primaryBtnSmall: {
    background: 'var(--accent)',
    color: '#0b0f14',
    border: 'none',
    padding: '5px 10px',
    borderRadius: 3,
    cursor: 'pointer',
    fontWeight: 700,
    fontFamily: 'inherit',
    fontSize: 12,
  },
  secondaryBtnSmall: {
    background: 'var(--panel-2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    padding: '5px 10px',
    borderRadius: 3,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
  },
  deleteBtnSmall: {
    background: 'none',
    color: 'var(--danger)',
    border: '1px solid var(--danger)',
    padding: '5px 10px',
    borderRadius: 3,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
  },
  empty: {
    padding: 20,
    color: 'var(--muted-2)',
    textAlign: 'center',
    fontSize: 14,
  },
};
