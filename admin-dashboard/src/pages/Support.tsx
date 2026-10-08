import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketCategory = 'booking' | 'payment' | 'worker' | 'refund' | 'technical';

interface SupportTicket {
  id: string;
  user_id: string;
  category: TicketCategory;
  subject: string;
  description: string;
  status: TicketStatus;
  booking_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: '#f59e0b',
  in_progress: '#3b82f6',
  resolved: '#10b981',
  closed: '#6b7280',
};

const STATUS_BG: Record<TicketStatus, string> = {
  open: '#fef3c7',
  in_progress: '#dbeafe',
  resolved: '#d1fae5',
  closed: '#f3f4f6',
};

const STATUS_TEXT: Record<TicketStatus, string> = {
  open: '#92400e',
  in_progress: '#1e40af',
  resolved: '#065f46',
  closed: '#374151',
};

const CATEGORY_ICONS: Record<TicketCategory, string> = {
  booking: '▣',
  payment: '₹',
  worker: '♙',
  refund: '↩',
  technical: '⚙',
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  booking: 'Booking',
  payment: 'Payment',
  worker: 'Worker',
  refund: 'Refund',
  technical: 'Technical',
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

// ─── Helper utilities ─────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="panel"
      style={{
        flex: '1 1 140px',
        padding: '1.25rem 1.5rem',
        borderTop: `4px solid ${color}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}
    >
      <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 500 }}>
        {label}
      </span>
      <span style={{ fontSize: '2rem', fontWeight: 700, color: '#111827' }}>
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className="booking-status"
      style={{
        backgroundColor: STATUS_BG[status],
        color: STATUS_TEXT[status],
        border: `1px solid ${STATUS_COLORS[status]}33`,
        fontSize: '0.72rem',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: '9999px',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: '50%',
          backgroundColor: STATUS_COLORS[status],
          marginRight: 5,
          verticalAlign: 'middle',
        }}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

function CategoryBadge({ category }: { category: TicketCategory }) {
  return (
    <span
      style={{
        fontSize: '0.72rem',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: '9999px',
        backgroundColor: '#f3f4f6',
        color: '#374151',
        border: '1px solid #e5e7eb',
        whiteSpace: 'nowrap',
      }}
    >
      {CATEGORY_ICONS[category]} {CATEGORY_LABELS[category]}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Support() {
  // ── Data state ──
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── Filter / search state ──
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TicketCategory>('all');

  // ── Pagination ──
  const [page, setPage] = useState(1);

  // ── Detail panel state ──
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [newStatus, setNewStatus] = useState<TicketStatus>('open');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [adminNote, setAdminNote] = useState('');

  // ── Profile lookup map ──
  const profileMap = useMemo(() => {
    const map: Record<string, Profile> = {};
    profiles.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [profiles]);

  // ─── Load data ───────────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [ticketsRes, profilesRes] = await Promise.all([
        supabase
          .from('support_tickets')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name, email, phone, role'),
      ]);

      if (ticketsRes.error) throw ticketsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      setTickets((ticketsRes.data as SupportTicket[]) ?? []);
      setProfiles((profilesRes.data as Profile[]) ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load support tickets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // ─── Sync newStatus when selectedTicket changes ───────────────────────────

  useEffect(() => {
    if (selectedTicket) {
      setNewStatus(selectedTicket.status);
      setAdminNote('');
    }
  }, [selectedTicket?.id]);

  // ─── Filtered & paginated tickets ────────────────────────────────────────

  const filteredTickets = useMemo(() => {
    const q = search.toLowerCase().trim();
    return tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (q) {
        const profile = profileMap[t.user_id];
        const customerName = (profile?.full_name ?? '').toLowerCase();
        const customerEmail = (profile?.email ?? '').toLowerCase();
        if (
          !t.subject.toLowerCase().includes(q) &&
          !t.description.toLowerCase().includes(q) &&
          !customerName.includes(q) &&
          !customerEmail.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [tickets, search, statusFilter, categoryFilter, profileMap]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE));
  const pagedTickets = filteredTickets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Stats ────────────────────────────────────────────────────────────────

  const stats = useMemo(
    () => ({
      total: tickets.length,
      open: tickets.filter((t) => t.status === 'open').length,
      in_progress: tickets.filter((t) => t.status === 'in_progress').length,
      resolved: tickets.filter((t) => t.status === 'resolved').length,
    }),
    [tickets],
  );

  // ─── Actions ─────────────────────────────────────────────────────────────

  function handleReset() {
    setSearch('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setPage(1);
  }

  function handleViewTicket(ticket: SupportTicket) {
    setSelectedTicket((prev) => (prev?.id === ticket.id ? null : ticket));
    setSuccess('');
    setError('');
  }

  async function handleUpdateStatus() {
    if (!selectedTicket) return;
    setUpdatingStatus(true);
    setError('');
    setSuccess('');
    try {
      // Use direct Supabase table update (no RPC for this action)
      const { error: updateError } = await supabase
        .from('support_tickets')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', selectedTicket.id);

      if (updateError) throw updateError;

      // Update local state
      setTickets((prev) =>
        prev.map((t) =>
          t.id === selectedTicket.id
            ? { ...t, status: newStatus, updated_at: new Date().toISOString() }
            : t,
        ),
      );
      setSelectedTicket((prev) =>
        prev ? { ...prev, status: newStatus, updated_at: new Date().toISOString() } : prev,
      );
      setSuccess(`Ticket status updated to "${STATUS_LABELS[newStatus]}" successfully.`);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update ticket status.');
    } finally {
      setUpdatingStatus(false);
    }
  }

  function handleAddNote() {
    if (!adminNote.trim()) return;
    setSuccess(`Note recorded: "${adminNote.trim()}"`);
    setAdminNote('');
  }

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, categoryFilter]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="page-content">
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <h1 className="page-heading" style={{ margin: 0 }}>
          Support Tickets
        </h1>
        <button
          className="dashboard-refresh"
          onClick={loadData}
          disabled={loading}
          title="Refresh"
        >
          {loading ? '⟳ Loading…' : '⟳ Refresh'}
        </button>
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="error-banner" style={{ marginBottom: '1rem' }}>
          ⚠ {error}
        </div>
      )}
      {success && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: 8,
            backgroundColor: '#d1fae5',
            color: '#065f46',
            border: '1px solid #6ee7b7',
            fontSize: '0.875rem',
          }}
        >
          ✓ {success}
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.5rem',
        }}
      >
        <StatCard label="Total Tickets" value={stats.total} color="#6366f1" />
        <StatCard label="Open" value={stats.open} color={STATUS_COLORS.open} />
        <StatCard label="In Progress" value={stats.in_progress} color={STATUS_COLORS.in_progress} />
        <StatCard label="Resolved" value={stats.resolved} color={STATUS_COLORS.resolved} />
      </div>

      {/* ── Filter Bar ── */}
      <div
        className="panel"
        style={{
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="Search by subject, description or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 220px',
            padding: '0.45rem 0.75rem',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          style={{
            padding: '0.45rem 0.75rem',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
            background: '#fff',
          }}
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
          style={{
            padding: '0.45rem 0.75rem',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
            background: '#fff',
          }}
        >
          <option value="all">All Categories</option>
          <option value="booking">▣ Booking</option>
          <option value="payment">₹ Payment</option>
          <option value="worker">♙ Worker</option>
          <option value="refund">↩ Refund</option>
          <option value="technical">⚙ Technical</option>
        </select>

        <button
          onClick={handleReset}
          style={{
            padding: '0.45rem 1rem',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: '#f9fafb',
            fontSize: '0.875rem',
            cursor: 'pointer',
            color: '#374151',
          }}
        >
          ✕ Reset
        </button>

        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#6b7280' }}>
          {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''} found
        </span>
      </div>

      {/* ── Ticket List ── */}
      {loading ? (
        <div
          className="panel"
          style={{ padding: '2.5rem', textAlign: 'center', color: '#6b7280' }}
        >
          Loading tickets…
        </div>
      ) : pagedTickets.length === 0 ? (
        <div
          className="panel"
          style={{ padding: '2.5rem', textAlign: 'center', color: '#6b7280' }}
        >
          No support tickets match your filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {pagedTickets.map((ticket) => {
            const profile = profileMap[ticket.user_id];
            const customerName = profile?.full_name ?? profile?.email ?? ticket.user_id.slice(0, 8);
            const isSelected = selectedTicket?.id === ticket.id;

            return (
              <div key={ticket.id}>
                {/* ── Ticket Row Card ── */}
                <div
                  className="panel"
                  style={{
                    padding: '0.875rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                    borderLeft: isSelected
                      ? `4px solid ${STATUS_COLORS[ticket.status]}`
                      : '4px solid transparent',
                    transition: 'border-left 0.15s',
                  }}
                >
                  {/* Status + Category */}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', minWidth: 180 }}>
                    <StatusBadge status={ticket.status} />
                    <CategoryBadge category={ticket.category} />
                  </div>

                  {/* Subject */}
                  <div style={{ flex: '1 1 200px' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        color: '#111827',
                        display: 'block',
                      }}
                    >
                      {ticket.subject}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                      {customerName}
                    </span>
                  </div>

                  {/* Date */}
                  <span
                    style={{
                      fontSize: '0.78rem',
                      color: '#6b7280',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatDate(ticket.created_at)}
                  </span>

                  {/* View button */}
                  <button
                    onClick={() => handleViewTicket(ticket)}
                    style={{
                      padding: '0.35rem 0.9rem',
                      borderRadius: 6,
                      border: `1px solid ${isSelected ? STATUS_COLORS[ticket.status] : '#d1d5db'}`,
                      background: isSelected ? STATUS_BG[ticket.status] : '#f9fafb',
                      color: isSelected ? STATUS_TEXT[ticket.status] : '#374151',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                    }}
                  >
                    {isSelected ? '▲ Close' : '▼ View'}
                  </button>
                </div>

                {/* ── Expanded Detail Panel ── */}
                {isSelected && selectedTicket && (
                  <div
                    className="panel"
                    style={{
                      padding: '1.5rem',
                      marginTop: '-0.125rem',
                      borderTop: `2px solid ${STATUS_COLORS[selectedTicket.status]}44`,
                      background: '#fafafa',
                    }}
                  >
                    {/* Title row */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '1rem',
                        gap: '1rem',
                      }}
                    >
                      <div>
                        <h2
                          style={{
                            margin: 0,
                            fontSize: '1.05rem',
                            fontWeight: 700,
                            color: '#111827',
                          }}
                        >
                          {selectedTicket.subject}
                        </h2>
                        <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.5rem' }}>
                          <StatusBadge status={selectedTicket.status} />
                          <CategoryBadge category={selectedTicket.category} />
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedTicket(null)}
                        style={{
                          padding: '0.3rem 0.75rem',
                          borderRadius: 6,
                          border: '1px solid #d1d5db',
                          background: '#fff',
                          color: '#374151',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        ✕ Close
                      </button>
                    </div>

                    {/* Description */}
                    <div
                      style={{
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        padding: '0.875rem 1rem',
                        fontSize: '0.875rem',
                        color: '#374151',
                        lineHeight: 1.65,
                        marginBottom: '1.25rem',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {selectedTicket.description}
                    </div>

                    {/* Metadata Grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: '0.75rem',
                        marginBottom: '1.25rem',
                      }}
                    >
                      {[
                        {
                          label: 'Category',
                          value: `${CATEGORY_ICONS[selectedTicket.category]} ${CATEGORY_LABELS[selectedTicket.category]}`,
                        },
                        { label: 'Status', value: STATUS_LABELS[selectedTicket.status] },
                        {
                          label: 'Booking ID',
                          value: selectedTicket.booking_id
                            ? selectedTicket.booking_id.slice(0, 8) + '…'
                            : '—',
                        },
                        { label: 'Submitted', value: formatDate(selectedTicket.created_at) },
                        { label: 'Last Updated', value: formatDate(selectedTicket.updated_at) },
                        {
                          label: 'Resolved At',
                          value: selectedTicket.resolved_at
                            ? formatDate(selectedTicket.resolved_at)
                            : '—',
                        },
                        {
                          label: 'Customer Email',
                          value: profileMap[selectedTicket.user_id]?.email ?? '—',
                        },
                        {
                          label: 'Customer Phone',
                          value: profileMap[selectedTicket.user_id]?.phone ?? '—',
                        },
                      ].map(({ label, value }) => (
                        <div
                          key={label}
                          style={{
                            background: '#fff',
                            border: '1px solid #e5e7eb',
                            borderRadius: 8,
                            padding: '0.625rem 0.875rem',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              color: '#9ca3af',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              marginBottom: '0.2rem',
                            }}
                          >
                            {label}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#111827', fontWeight: 500 }}>
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ── Status Update ── */}
                    <div
                      style={{
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        padding: '1rem 1.25rem',
                        marginBottom: '1rem',
                      }}
                    >
                      <p
                        style={{
                          margin: '0 0 0.75rem',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          color: '#374151',
                        }}
                      >
                        Update Status
                      </p>
                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value as TicketStatus)}
                          style={{
                            padding: '0.45rem 0.75rem',
                            borderRadius: 6,
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem',
                            background: '#fff',
                            flex: '1 1 160px',
                          }}
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                        <button
                          onClick={handleUpdateStatus}
                          disabled={updatingStatus || newStatus === selectedTicket.status}
                          style={{
                            padding: '0.45rem 1.25rem',
                            borderRadius: 6,
                            border: 'none',
                            background:
                              updatingStatus || newStatus === selectedTicket.status
                                ? '#e5e7eb'
                                : '#4f46e5',
                            color:
                              updatingStatus || newStatus === selectedTicket.status
                                ? '#9ca3af'
                                : '#fff',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor:
                              updatingStatus || newStatus === selectedTicket.status
                                ? 'not-allowed'
                                : 'pointer',
                            transition: 'background 0.15s',
                          }}
                        >
                          {updatingStatus ? 'Updating…' : 'Update Status'}
                        </button>
                      </div>
                    </div>

                    {/* ── Admin Note ── */}
                    <div
                      style={{
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        padding: '1rem 1.25rem',
                      }}
                    >
                      <p
                        style={{
                          margin: '0 0 0.75rem',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          color: '#374151',
                        }}
                      >
                        Add Admin Note
                      </p>
                      <textarea
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        placeholder="Write an internal note about this ticket…"
                        rows={3}
                        style={{
                          width: '100%',
                          padding: '0.6rem 0.75rem',
                          borderRadius: 6,
                          border: '1px solid #d1d5db',
                          fontSize: '0.875rem',
                          resize: 'vertical',
                          boxSizing: 'border-box',
                          outline: 'none',
                          fontFamily: 'inherit',
                          marginBottom: '0.75rem',
                        }}
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={!adminNote.trim()}
                        style={{
                          padding: '0.45rem 1.25rem',
                          borderRadius: 6,
                          border: 'none',
                          background: !adminNote.trim() ? '#e5e7eb' : '#059669',
                          color: !adminNote.trim() ? '#9ca3af' : '#fff',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          cursor: !adminNote.trim() ? 'not-allowed' : 'pointer',
                          transition: 'background 0.15s',
                        }}
                      >
                        Add Note
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '1.5rem',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              background: page === 1 ? '#f9fafb' : '#fff',
              color: page === 1 ? '#d1d5db' : '#374151',
              fontWeight: 600,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
            }}
          >
            ← Prev
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .reduce<(number | '…')[]>((acc, p, idx, arr) => {
              if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
              acc.push(p);
              return acc;
            }, [])
            .map((item, idx) =>
              item === '…' ? (
                <span key={`ellipsis-${idx}`} style={{ padding: '0 0.25rem', color: '#9ca3af' }}>
                  …
                </span>
              ) : (
                <button
                  key={item}
                  onClick={() => setPage(item as number)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: 6,
                    border: `1px solid ${item === page ? '#4f46e5' : '#d1d5db'}`,
                    background: item === page ? '#4f46e5' : '#fff',
                    color: item === page ? '#fff' : '#374151',
                    fontWeight: item === page ? 700 : 400,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    minWidth: 36,
                  }}
                >
                  {item}
                </button>
              ),
            )}

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              background: page === totalPages ? '#f9fafb' : '#fff',
              color: page === totalPages ? '#d1d5db' : '#374151',
              fontWeight: 600,
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Next →
          </button>

          <span style={{ fontSize: '0.8rem', color: '#6b7280', marginLeft: '0.5rem' }}>
            Page {page} of {totalPages}
          </span>
        </div>
      )}
    </div>
  );
}
