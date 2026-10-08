import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettingRow {
  key: string;
  value: string;
  description: string | null;
  updated_at: string | null;
}

interface SettingMeta {
  label: string;
  suffix?: string;
  type: 'number' | 'text' | 'toggle';
  description: string;
}

// ---------------------------------------------------------------------------
// Config – friendly metadata for each known setting key
// ---------------------------------------------------------------------------

const SETTING_META: Record<string, SettingMeta> = {
  platform_fee_percent: {
    label: 'Platform Fee',
    suffix: '%',
    type: 'number',
    description: 'Fee charged on each booking',
  },
  tax_rate_percent: {
    label: 'Tax Rate (GST)',
    suffix: '%',
    type: 'number',
    description: 'Tax applied to every transaction',
  },
  maintenance_mode: {
    label: 'Maintenance Mode',
    type: 'toggle',
    description: 'When enabled, the platform is inaccessible to regular users',
  },
  default_radius_km: {
    label: 'Default Worker Search Radius',
    suffix: 'km',
    type: 'number',
    description: 'Default radius used when searching for nearby workers',
  },
  contact_email: {
    label: 'Contact Email',
    type: 'text',
    description: 'Support / contact e-mail shown to end users',
  },
  contact_phone: {
    label: 'Contact Phone',
    type: 'text',
    description: 'Support / contact phone shown to end users',
  },
};

// The display order we want on the page
const SETTING_KEYS = Object.keys(SETTING_META);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Settings() {
  // Raw data keyed by setting key
  const [settings, setSettings] = useState<
    Record<string, { value: string; description: string | null; updated_at: string | null }>
  >({});

  // Local edit state (what is currently typed in inputs)
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  // Per-key saving spinner
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Page-level states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Keys the user has touched
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Load settings
  // ---------------------------------------------------------------------------

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('platform_settings')
      .select('*')
      .order('key');

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    const map: Record<string, { value: string; description: string | null; updated_at: string | null }> = {};
    const edits: Record<string, string> = {};

    (data as SettingRow[]).forEach((row) => {
      map[row.key] = {
        value: row.value,
        description: row.description,
        updated_at: row.updated_at,
      };
      edits[row.key] = row.value;
    });

    setSettings(map);
    setEditValues(edits);
    setDirtyKeys(new Set());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // ---------------------------------------------------------------------------
  // Save a single setting
  // ---------------------------------------------------------------------------

  const saveSetting = async (key: string) => {
    setSaving((prev) => ({ ...prev, [key]: true }));
    setError(null);
    setSuccess(null);

    const { error: updateError } = await supabase
      .from('platform_settings')
      .update({ value: editValues[key], updated_at: new Date().toISOString() })
      .eq('key', key);

    if (updateError) {
      setError(`Failed to save "${SETTING_META[key]?.label ?? key}": ${updateError.message}`);
      setSaving((prev) => ({ ...prev, [key]: false }));
      return;
    }

    setSuccess(`"${SETTING_META[key]?.label ?? key}" saved successfully.`);
    setSaving((prev) => ({ ...prev, [key]: false }));
    await loadSettings();
  };

  // ---------------------------------------------------------------------------
  // Toggle maintenance mode
  // ---------------------------------------------------------------------------

  const toggleMaintenanceMode = async () => {
    const current = editValues['maintenance_mode'] === 'true';
    const next = !current;
    const nextStr = String(next);

    setEditValues((prev) => ({ ...prev, maintenance_mode: nextStr }));
    setDirtyKeys((prev) => {
      const s = new Set(prev);
      if (nextStr !== settings['maintenance_mode']?.value) {
        s.add('maintenance_mode');
      } else {
        s.delete('maintenance_mode');
      }
      return s;
    });
  };

  // ---------------------------------------------------------------------------
  // Edit handler for text / number inputs
  // ---------------------------------------------------------------------------

  const handleEdit = (key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }));
    setDirtyKeys((prev) => {
      const s = new Set(prev);
      if (value !== settings[key]?.value) {
        s.add(key);
      } else {
        s.delete(key);
      }
      return s;
    });
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const isMaintenanceMode = editValues['maintenance_mode'] === 'true';

  const renderInput = (key: string, meta: SettingMeta) => {
    if (meta.type === 'toggle') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => toggleMaintenanceMode()}
            style={{
              width: 48,
              height: 26,
              borderRadius: 13,
              background: isMaintenanceMode ? '#ef4444' : '#22c55e',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
            }}
            aria-label="Toggle maintenance mode"
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: isMaintenanceMode ? 26 : 4,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
              }}
            />
          </button>
          <span style={{ fontWeight: 600, color: isMaintenanceMode ? '#ef4444' : '#22c55e' }}>
            {isMaintenanceMode ? 'ENABLED' : 'DISABLED'}
          </span>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type={meta.type === 'number' ? 'number' : 'text'}
          value={editValues[key] ?? ''}
          onChange={(e) => handleEdit(key, e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: 14,
            width: meta.type === 'number' ? 120 : 260,
            outline: 'none',
          }}
        />
        {meta.suffix && (
          <span style={{ color: '#6b7280', fontSize: 14 }}>{meta.suffix}</span>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="page-content">
        <h1 className="page-heading">Platform Settings</h1>
        <p style={{ color: '#6b7280', marginTop: 24 }}>Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 className="page-heading" style={{ margin: 0 }}>Platform Settings</h1>
        <button
          className="dashboard-refresh"
          onClick={loadSettings}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: '#fff',
            cursor: 'pointer',
            fontSize: 13,
            color: '#374151',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Warning banner */}
      <div
        style={{
          background: '#fffbeb',
          border: '1px solid #f59e0b',
          borderRadius: 8,
          padding: '10px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: '#92400e',
          fontSize: 14,
        }}
      >
        <span style={{ fontSize: 18 }}>⚠️</span>
        <span>
          <strong>Changes to platform settings take effect immediately.</strong> Be careful with production values.
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="error-banner"
          style={{
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 16,
            color: '#991b1b',
            fontSize: 14,
          }}
        >
          ❌ {error}
        </div>
      )}

      {/* Success banner */}
      {success && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 16,
            color: '#166534',
            fontSize: 14,
          }}
        >
          ✅ {success}
        </div>
      )}

      {/* Settings cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {SETTING_KEYS.map((key) => {
          const meta = SETTING_META[key];
          const row = settings[key];
          const isDirty = dirtyKeys.has(key);
          const isSaving = saving[key] === true;

          return (
            <div
              key={key}
              className="panel"
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: '18px 22px',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              {/* Left: label + description */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>
                  {meta.label}
                </div>
                <div style={{ color: '#6b7280', fontSize: 13, marginTop: 3 }}>
                  {meta.description || row?.description || '—'}
                </div>
                {row?.updated_at && (
                  <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 6 }}>
                    Last updated: {formatDate(row.updated_at)}
                  </div>
                )}
              </div>

              {/* Right: input + save button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {renderInput(key, meta)}

                {/* Save button — always visible for toggle, shown for others too */}
                <button
                  onClick={() => saveSetting(key)}
                  disabled={!isDirty || isSaving}
                  style={{
                    padding: '7px 18px',
                    borderRadius: 6,
                    border: 'none',
                    background: isDirty && !isSaving ? '#3b82f6' : '#e5e7eb',
                    color: isDirty && !isSaving ? '#fff' : '#9ca3af',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: isDirty && !isSaving ? 'pointer' : 'not-allowed',
                    transition: 'background 0.15s',
                    minWidth: 70,
                  }}
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* About section */}
      <div
        className="panel"
        style={{
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          padding: '20px 24px',
          marginTop: 28,
        }}
      >
        <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#111827' }}>
          About KvikStaff
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {[
            { label: 'Platform Version', value: '1.0.0' },
            { label: 'Environment', value: 'Production' },
            { label: 'Frontend', value: 'React + TypeScript' },
            { label: 'Backend', value: 'Supabase (PostgreSQL)' },
            { label: 'Auth', value: 'Supabase Auth' },
            { label: 'Hosting', value: 'Vercel / CDN' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
