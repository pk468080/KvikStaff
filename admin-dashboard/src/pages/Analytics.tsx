import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DateRange = 'last7days' | 'last30days' | 'last90days' | 'alltime';

interface Booking {
  id: string;
  status: string;
  total_amount: number | null;
  created_at: string;
  service_id?: string;
}

interface WorkerProfile {
  id: string;
  created_at: string;
  rating: number | null;
  total_completed_jobs: number;
}

interface CustomerProfile {
  id: string;
  created_at: string;
  role: string;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
}

interface Service {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRangeStart(range: DateRange): Date | null {
  if (range === 'alltime') return null;
  const now = new Date();
  const days = range === 'last7days' ? 7 : range === 'last30days' ? 30 : 90;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function inRange(dateStr: string | null | undefined, start: Date | null): boolean {
  if (!dateStr) return false;
  if (!start) return true;
  return new Date(dateStr) >= start;
}

function toDateKey(dateStr: string): string {
  return dateStr.slice(0, 10); // YYYY-MM-DD
}

function groupByDate<T>(
  items: T[],
  getDate: (item: T) => string | null,
  start: Date | null,
): { date: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const item of items) {
    const d = getDate(item);
    if (!d || !inRange(d, start)) continue;
    const key = toDateKey(d);
    map[key] = (map[key] ?? 0) + 1;
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

function groupRevenueByDate(
  payments: Payment[],
  start: Date | null,
): { date: string; amount: number }[] {
  const map: Record<string, number> = {};
  for (const p of payments) {
    if (p.status !== 'paid' || !p.paid_at) continue;
    if (!inRange(p.paid_at, start)) continue;
    const key = toDateKey(p.paid_at);
    map[key] = (map[key] ?? 0) + p.amount;
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }));
}

// ---------------------------------------------------------------------------
// Mini bar chart components
// ---------------------------------------------------------------------------

function CountBarChart({ data }: { data: { date: string; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  if (data.length === 0) {
    return <p style={{ color: '#888', fontSize: 13 }}>No data for this period.</p>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
      {data.map((d) => (
        <div
          key={d.date}
          style={{
            flex: 1,
            background: '#007E80',
            height: `${(d.count / maxCount) * 100}%`,
            minHeight: 2,
            borderRadius: 2,
          }}
          title={`${d.date}: ${d.count}`}
        />
      ))}
    </div>
  );
}

function AmountBarChart({ data }: { data: { date: string; amount: number }[] }) {
  const maxAmount = Math.max(...data.map((d) => d.amount), 1);
  if (data.length === 0) {
    return <p style={{ color: '#888', fontSize: 13 }}>No data for this period.</p>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
      {data.map((d) => (
        <div
          key={d.date}
          style={{
            flex: 1,
            background: '#007E80',
            height: `${(d.amount / maxAmount) * 100}%`,
            minHeight: 2,
            borderRadius: 2,
          }}
          title={`${d.date}: $${d.amount.toFixed(2)}`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Analytics() {
  const [dateRange, setDateRange] = useState<DateRange>('last30days');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Raw data
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [workers, setWorkers] = useState<WorkerProfile[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [
          { data: bookingsData, error: bookingsErr },
          { data: workersData, error: workersErr },
          { data: customersData, error: customersErr },
          { data: paymentsData, error: paymentsErr },
          { data: servicesData, error: servicesErr },
        ] = await Promise.all([
          supabase.from('bookings').select('id, status, total_amount, created_at, service_id'),
          supabase.from('worker_profiles').select('id, created_at, rating, total_completed_jobs'),
          supabase.from('profiles').select('id, created_at, role').eq('role', 'customer'),
          supabase.from('payments').select('id, amount, status, paid_at'),
          supabase.from('services').select('id, name'),
        ]);

        const firstError =
          bookingsErr ?? workersErr ?? customersErr ?? paymentsErr ?? servicesErr;
        if (firstError) throw firstError;

        if (!cancelled) {
          setBookings((bookingsData as Booking[]) ?? []);
          setWorkers((workersData as WorkerProfile[]) ?? []);
          setCustomers((customersData as CustomerProfile[]) ?? []);
          setPayments((paymentsData as Payment[]) ?? []);
          setServices((servicesData as Service[]) ?? []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [dateRange]);

  // -------------------------------------------------------------------------
  // Derived metrics
  // -------------------------------------------------------------------------

  const metrics = useMemo(() => {
    const start = getRangeStart(dateRange);

    // Filtered bookings
    const filteredBookings = bookings.filter((b) => inRange(b.created_at, start));
    const totalBookings = filteredBookings.length;
    const completedBookings = filteredBookings.filter((b) => b.status === 'completed').length;
    const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;

    // Revenue from paid payments in range
    const filteredPaidPayments = payments.filter(
      (p) => p.status === 'paid' && inRange(p.paid_at ?? null, start),
    );
    const totalRevenue = filteredPaidPayments.reduce((sum, p) => sum + p.amount, 0);

    // New workers / customers in range
    const newWorkers = workers.filter((w) => inRange(w.created_at, start)).length;
    const newCustomers = customers.filter((c) => inRange(c.created_at, start)).length;

    // Top 5 services by booking count
    const serviceCountMap: Record<string, number> = {};
    for (const b of filteredBookings) {
      const sid = (b as Booking & { service_id?: string }).service_id;
      if (!sid) continue;
      serviceCountMap[sid] = (serviceCountMap[sid] ?? 0) + 1;
    }
    const serviceNameMap: Record<string, string> = {};
    for (const s of services) {
      serviceNameMap[s.id] = s.name;
    }
    const topServices = Object.entries(serviceCountMap)
      .map(([id, count]) => ({ name: serviceNameMap[id] ?? id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top 5 workers by completed jobs
    const topWorkers = [...workers]
      .sort((a, b) => b.total_completed_jobs - a.total_completed_jobs)
      .slice(0, 5);

    // Trend data
    const bookingsByDay = groupByDate(filteredBookings, (b) => b.created_at, null);
    const revenueByDay = groupRevenueByDate(payments, start);

    return {
      totalRevenue,
      totalBookings,
      completedBookings,
      newWorkers,
      newCustomers,
      completionRate,
      topServices,
      topWorkers,
      bookingsByDay,
      revenueByDay,
    };
  }, [bookings, workers, customers, payments, services, dateRange]);

  // -------------------------------------------------------------------------
  // Range button labels
  // -------------------------------------------------------------------------

  const rangeOptions: { value: DateRange; label: string }[] = [
    { value: 'last7days', label: '7 days' },
    { value: 'last30days', label: '30 days' },
    { value: 'last90days', label: '90 days' },
    { value: 'alltime', label: 'All time' },
  ];

  const maxServiceCount = Math.max(...metrics.topServices.map((s) => s.count), 1);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-heading">
        <div>
          <h1>Analytics</h1>
          <p style={{ color: '#666', marginTop: 4 }}>
            Key metrics and trends for the KvikStaff platform.
          </p>
        </div>

        {/* Date range selector */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {rangeOptions.map((opt) => (
            <button
              key={opt.value}
              className={`dashboard-refresh${dateRange === opt.value ? ' active' : ''}`}
              style={{
                background: dateRange === opt.value ? '#007E80' : undefined,
                color: dateRange === opt.value ? '#fff' : undefined,
              }}
              onClick={() => setDateRange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="error-banner" style={{ marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p style={{ color: '#888', marginBottom: 24 }}>Loading analytics data…</p>
      )}

      {/* KPI stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}
      >
        <StatCard
          label="Total Revenue"
          value={`$${metrics.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color="#007E80"
        />
        <StatCard
          label="Total Bookings"
          value={metrics.totalBookings.toLocaleString()}
          color="#5A67D8"
        />
        <StatCard
          label="Completed Jobs"
          value={metrics.completedBookings.toLocaleString()}
          color="#38A169"
        />
        <StatCard
          label="Completion Rate"
          value={`${metrics.completionRate.toFixed(1)}%`}
          color="#DD6B20"
        />
        <StatCard
          label="New Workers"
          value={metrics.newWorkers.toLocaleString()}
          color="#D53F8C"
        />
        <StatCard
          label="New Customers"
          value={metrics.newCustomers.toLocaleString()}
          color="#3182CE"
        />
      </div>

      {/* Charts row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 24,
          marginBottom: 32,
        }}
      >
        {/* Bookings trend */}
        <div className="panel">
          <div className="panel-header">
            <h2>Bookings Trend</h2>
          </div>
          <div style={{ padding: '16px 20px 20px' }}>
            <CountBarChart data={metrics.bookingsByDay} />
          </div>
        </div>

        {/* Revenue trend */}
        <div className="panel">
          <div className="panel-header">
            <h2>Revenue Trend</h2>
          </div>
          <div style={{ padding: '16px 20px 20px' }}>
            <AmountBarChart data={metrics.revenueByDay} />
          </div>
        </div>
      </div>

      {/* Tables row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 24,
        }}
      >
        {/* Top services */}
        <div className="panel">
          <div className="panel-header">
            <h2>Top 5 Services</h2>
          </div>
          <div style={{ padding: '0 0 4px' }}>
            {metrics.topServices.length === 0 ? (
              <p style={{ color: '#888', padding: '12px 20px', fontSize: 13 }}>
                No service data for this period.
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <Th>Service Name</Th>
                    <Th align="right">Bookings</Th>
                    <Th style={{ width: '40%' }}>Share</Th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.topServices.map((s) => (
                    <tr key={s.name} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <Td>{s.name}</Td>
                      <Td align="right">{s.count}</Td>
                      <Td>
                        <div
                          style={{
                            height: 8,
                            borderRadius: 4,
                            background: '#e5e7eb',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${(s.count / maxServiceCount) * 100}%`,
                              background: '#007E80',
                              borderRadius: 4,
                            }}
                          />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Top workers */}
        <div className="panel">
          <div className="panel-header">
            <h2>Top 5 Workers</h2>
          </div>
          <div style={{ padding: '0 0 4px' }}>
            {metrics.topWorkers.length === 0 ? (
              <p style={{ color: '#888', padding: '12px 20px', fontSize: 13 }}>
                No worker data available.
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <Th>Worker ID</Th>
                    <Th align="right">Completed Jobs</Th>
                    <Th align="right">Rating</Th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.topWorkers.map((w) => (
                    <tr key={w.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <Td>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 12,
                            background: '#f3f4f6',
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}
                        >
                          {w.id.slice(0, 8)}
                        </span>
                      </Td>
                      <Td align="right">{w.total_completed_jobs.toLocaleString()}</Td>
                      <Td align="right">
                        {w.rating !== null ? (
                          <span>
                            ⭐ {w.rating.toFixed(1)}
                          </span>
                        ) : (
                          <span style={{ color: '#aaa' }}>—</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small reusable sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="dashboard-stat-card"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <p style={{ fontSize: 24, fontWeight: 700, color, margin: 0 }}>{value}</p>
    </div>
  );
}

function Th({
  children,
  align,
  style,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  style?: React.CSSProperties;
}) {
  return (
    <th
      style={{
        padding: '10px 20px',
        textAlign: align ?? 'left',
        fontSize: 12,
        fontWeight: 600,
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      style={{
        padding: '10px 20px',
        textAlign: align ?? 'left',
        fontSize: 14,
        color: '#374151',
      }}
    >
      {children}
    </td>
  );
}
