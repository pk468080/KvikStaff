import { useEffect, useMemo, useState } from 'react'
import {
  Edit3,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'

import { supabase } from '../lib/supabase'

type Service = {
  id: string
  name: string
  is_active: boolean
}

type DiscountTier = {
  id: string
  service_id: string
  name: string
  min_hours: number
  max_hours: number | null
  discount_percent: number
  priority: number
  effective_from: string
  effective_to: string | null
  is_active: boolean
  created_at: string
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Open-ended'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function toLocalDateTime(value: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (value: number) =>
    String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(
    date.getMonth() + 1,
  )}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function fromLocalDateTime(value: string) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString()
}

export default function ServiceDiscounts() {
  const [services, setServices] =
    useState<Service[]>([])

  const [tiers, setTiers] =
    useState<DiscountTier[]>([])

  const [selectedServiceId, setSelectedServiceId] =
    useState('')

  const [search, setSearch] = useState('')

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [formError, setFormError] =
    useState<string | null>(null)

  const [modalOpen, setModalOpen] =
    useState(false)

  const [editing, setEditing] =
    useState<DiscountTier | null>(null)

  const [name, setName] = useState('')

  const [minHours, setMinHours] =
    useState('1')

  const [maxHours, setMaxHours] =
    useState('')

  const [discountPercent, setDiscountPercent] =
    useState('10')

  const [priority, setPriority] =
    useState('0')

  const [effectiveFrom, setEffectiveFrom] =
    useState('')

  const [effectiveTo, setEffectiveTo] =
    useState('')

  const [isActive, setIsActive] =
    useState(true)

  const filteredServices = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase()

    if (!query) {
      return services
    }

    return services.filter(service =>
      service.name
        .toLowerCase()
        .includes(query),
    )
  }, [services, search])

  const selectedService = useMemo(
    () =>
      services.find(
        service =>
          service.id ===
          selectedServiceId,
      ) ?? null,
    [services, selectedServiceId],
  )

  async function loadServices() {
    const {
      data,
      error,
    } = await supabase
      .from('services')
      .select(
        'id,name,is_active',
      )
      .order('name', {
        ascending: true,
      })

    if (error) {
      throw error
    }

    const next =
      (data || []) as Service[]

    setServices(next)

    if (
      !selectedServiceId &&
      next.length > 0
    ) {
      const firstActive =
        next.find(
          service =>
            service.is_active,
        )

      setSelectedServiceId(
        firstActive?.id ||
          next[0].id,
      )
    }
  }

  async function loadTiers(
  serviceId: string,
) {
  if (!serviceId) {
    setTiers([])
    return
  }

  const {
    data,
    error,
  } = await supabase
    .from('service_discount_tiers')
    .select(`
      id,
      service_id,
      name,
      min_hours,
      max_hours,
      discount_percent,
      priority,
      effective_from,
      effective_to,
      is_active,
      created_at
    `)
    .eq(
      'service_id',
      serviceId,
    )
    .order('priority', {
      ascending: false,
    })
    .order('min_hours', {
      ascending: false,
    })
    .order('effective_from', {
      ascending: false,
    })

  if (error) {
    throw error
  }

  type RawDiscountTier = {
    id: string
    service_id: string
    name: string
    min_hours: number | string
    max_hours: number | string | null
    discount_percent: number | string
    priority: number | string
    effective_from: string
    effective_to: string | null
    is_active: boolean
    created_at: string
  }

  const rows =
    (data || []) as unknown as RawDiscountTier[]

  const normalized: DiscountTier[] =
    rows.map(row => ({
      id: row.id,
      service_id: row.service_id,
      name: row.name,
      min_hours: Number(
        row.min_hours,
      ),
      max_hours:
        row.max_hours == null
          ? null
          : Number(
              row.max_hours,
            ),
      discount_percent: Number(
        row.discount_percent,
      ),
      priority: Number(
        row.priority,
      ),
      effective_from:
        row.effective_from,
      effective_to:
        row.effective_to,
      is_active:
        Boolean(row.is_active),
      created_at:
        row.created_at,
    }))

  setTiers(normalized)
}
  async function refresh() {
    setLoading(true)
    setError(null)

    try {
      await loadServices()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load services.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (!selectedServiceId) {
      return
    }

    void loadTiers(
      selectedServiceId,
    ).catch(err => {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load discount tiers.',
      )
    })
  }, [selectedServiceId])

  function clearForm() {
    setEditing(null)
    setName('')
    setMinHours('1')
    setMaxHours('')
    setDiscountPercent('10')
    setPriority('0')
    setEffectiveFrom('')
    setEffectiveTo('')
    setIsActive(true)
    setFormError(null)
  }

  function openCreate() {
    clearForm()

    setEffectiveFrom(
      toLocalDateTime(
        new Date().toISOString(),
      ),
    )

    setModalOpen(true)
  }

  function openEdit(
    tier: DiscountTier,
  ) {
    clearForm()

    setEditing(tier)
    setName(tier.name)
    setMinHours(
      String(tier.min_hours),
    )
    setMaxHours(
      tier.max_hours == null
        ? ''
        : String(tier.max_hours),
    )
    setDiscountPercent(
      String(
        tier.discount_percent,
      ),
    )
    setPriority(
      String(tier.priority),
    )
    setEffectiveFrom(
      toLocalDateTime(
        tier.effective_from,
      ),
    )
    setEffectiveTo(
      toLocalDateTime(
        tier.effective_to,
      ),
    )
    setIsActive(
      tier.is_active,
    )

    setModalOpen(true)
  }

  function closeModal() {
    if (saving) {
      return
    }

    setModalOpen(false)
    clearForm()
  }

  async function saveTier() {
    if (!selectedServiceId) {
      setFormError(
        'Select a service first.',
      )
      return
    }

    const cleanName =
      name.trim()

    const min =
      Number(minHours)

    const max =
      maxHours.trim()
        ? Number(maxHours)
        : null

    const percent =
      Number(discountPercent)

    const priorityValue =
      Number(priority)

    const start =
      effectiveFrom
        ? fromLocalDateTime(
            effectiveFrom,
          )
        : null

    const end =
      effectiveTo
        ? fromLocalDateTime(
            effectiveTo,
          )
        : null

    if (!cleanName) {
      setFormError(
        'Discount name is required.',
      )
      return
    }

    if (
      !Number.isFinite(min) ||
      min < 0
    ) {
      setFormError(
        'Minimum hours must be 0 or greater.',
      )
      return
    }

    if (
      max !== null &&
      (!Number.isFinite(max) ||
        max <= min)
    ) {
      setFormError(
        'Maximum hours must be greater than minimum hours.',
      )
      return
    }

    if (
      !Number.isFinite(percent) ||
      percent <= 0 ||
      percent > 100
    ) {
      setFormError(
        'Discount percent must be greater than 0 and at most 100.',
      )
      return
    }

    if (
      !Number.isInteger(
        priorityValue,
      )
    ) {
      setFormError(
        'Priority must be a whole number.',
      )
      return
    }

    if (!start) {
      setFormError(
        'Effective from is required.',
      )
      return
    }

    if (
      end &&
      new Date(end) <=
        new Date(start)
    ) {
      setFormError(
        'Effective to must be later than effective from.',
      )
      return
    }

    setSaving(true)
    setFormError(null)
    setError(null)

    try {
      if (editing) {
        const {
          error: updateError,
        } = await supabase
          .from(
            'service_discount_tiers',
          )
          .update({
            name: cleanName,
            min_hours: min,
            max_hours: max,
            discount_percent:
              percent,
            priority:
              priorityValue,
            effective_from:
              start,
            effective_to:
              end,
            is_active:
              isActive,
          })
          .eq(
            'id',
            editing.id,
          )

        if (updateError) {
          throw updateError
        }
      } else {
        const {
          error: insertError,
        } = await supabase
          .from(
            'service_discount_tiers',
          )
          .insert({
            service_id:
              selectedServiceId,
            name: cleanName,
            min_hours: min,
            max_hours: max,
            discount_percent:
              percent,
            priority:
              priorityValue,
            effective_from:
              start,
            effective_to:
              end,
            is_active:
              isActive,
          })

        if (insertError) {
          throw insertError
        }
      }

      await loadTiers(
        selectedServiceId,
      )

      setModalOpen(false)
      clearForm()
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Failed to save discount tier.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function removeTier(
    tier: DiscountTier,
  ) {
    const confirmed =
      window.confirm(
        `Delete “${tier.name}” for ${selectedService?.name || 'this service'}?`,
      )

    if (!confirmed) {
      return
    }

    setError(null)

    try {
      const {
        error: deleteError,
      } = await supabase
        .from(
          'service_discount_tiers',
        )
        .delete()
        .eq(
          'id',
          tier.id,
        )

      if (deleteError) {
        throw deleteError
      }

      await loadTiers(
        selectedServiceId,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to delete discount tier.',
      )
    }
  }

  async function toggleTier(
    tier: DiscountTier,
  ) {
    setError(null)

    try {
      const {
        error: updateError,
      } = await supabase
        .from(
          'service_discount_tiers',
        )
        .update({
          is_active:
            !tier.is_active,
        })
        .eq(
          'id',
          tier.id,
        )

      if (updateError) {
        throw updateError
      }

      await loadTiers(
        selectedServiceId,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update discount tier.',
      )
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            PRICING CONTROL
          </div>

          <h1 className="page-title">
            Duration Discounts
          </h1>

          <p className="page-subtitle">
            Configure hourly duration
            discounts dynamically.
            Customer pricing uses these
            tiers in real time.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
          }}
        >
          <button
            className="secondary-button"
            onClick={() =>
              void refresh()
            }
            disabled={loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            className="primary-button"
            onClick={openCreate}
            disabled={
              !selectedServiceId
            }
          >
            <Plus size={16} />
            Add discount tier
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            '300px 1fr',
          gap: 20,
        }}
      >
        <div className="panel-card">
          <div
            style={{
              padding: 18,
              borderBottom:
                '1px solid #E5E7EB',
            }}
          >
            <div className="page-eyebrow">
              SERVICES
            </div>

            <input
              className="input"
              style={{
                marginTop: 10,
              }}
              placeholder="Search services..."
              value={search}
              onChange={event =>
                setSearch(
                  event.target.value,
                )
              }
            />
          </div>

          <div
            style={{
              maxHeight: 560,
              overflowY: 'auto',
              padding: 8,
            }}
          >
            {loading ? (
              <div
                style={{
                  padding: 20,
                  color: '#64748B',
                }}
              >
                Loading services...
              </div>
            ) : filteredServices.length ===
              0 ? (
              <div
                style={{
                  padding: 20,
                  color: '#64748B',
                }}
              >
                No services found.
              </div>
            ) : (
              filteredServices.map(
                service => (
                  <button
                    key={
                      service.id
                    }
                    type="button"
                    onClick={() =>
                      setSelectedServiceId(
                        service.id,
                      )
                    }
                    style={{
                      width:
                        '100%',
                      textAlign:
                        'left',
                      border: 0,
                      borderRadius:
                        12,
                      padding:
                        '13px 14px',
                      marginBottom:
                        4,
                      cursor:
                        'pointer',
                      backgroundColor:
                        service.id ===
                        selectedServiceId
                          ? '#EAF7F7'
                          : 'transparent',
                      color:
                        '#062F52',
                    }}
                  >
                    <div
                      style={{
                        fontWeight:
                          800,
                        fontSize:
                          14,
                      }}
                    >
                      {
                        service.name
                      }
                    </div>

                    <div
                      style={{
                        marginTop:
                          4,
                        fontSize:
                          11,
                        color:
                          service.is_active
                            ? '#087F72'
                            : '#94A3B8',
                      }}
                    >
                      {service.is_active
                        ? 'Active'
                        : 'Inactive'}
                    </div>
                  </button>
                ),
              )
            )}
          </div>
        </div>

        <div className="panel-card">
          <div
            style={{
              padding: 18,
              borderBottom:
                '1px solid #E5E7EB',
            }}
          >
            <div className="page-eyebrow">
              SELECTED SERVICE
            </div>

            <h2
              style={{
                margin:
                  '5px 0 0',
                fontSize: 22,
                color:
                  '#062F52',
              }}
            >
              {selectedService
                ?.name ||
                'Select a service'}
            </h2>
          </div>

          <div
            style={{
              overflowX:
                'auto',
            }}
          >
            <table
              style={{
                width:
                  '100%',
                borderCollapse:
                  'collapse',
              }}
            >
              <thead>
                <tr>
                  {[
                    'Name',
                    'Hours',
                    'Discount',
                    'Priority',
                    'Validity',
                    'Status',
                    'Actions',
                  ].map(
                    heading => (
                      <th
                        key={
                          heading
                        }
                        style={{
                          textAlign:
                            'left',
                          padding:
                            '12px 14px',
                          fontSize:
                            11,
                          letterSpacing:
                            0.5,
                          color:
                            '#64748B',
                          borderBottom:
                            '1px solid #E5E7EB',
                        }}
                      >
                        {
                          heading
                        }
                      </th>
                    ),
                  )}
                </tr>
              </thead>

              <tbody>
                {tiers.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan={
                        7
                      }
                      style={{
                        padding:
                          32,
                        textAlign:
                          'center',
                        color:
                          '#64748B',
                      }}
                    >
                      No duration
                      discounts
                      configured
                      for this
                      service.
                    </td>
                  </tr>
                ) : (
                  tiers.map(
                    tier => (
                      <tr
                        key={
                          tier.id
                        }
                      >
                        <td
                          style={{
                            padding:
                              '14px',
                            borderBottom:
                              '1px solid #F1F5F9',
                          }}
                        >
                          <div
                            style={{
                              fontWeight:
                                800,
                              color:
                                '#062F52',
                            }}
                          >
                            {
                              tier.name
                            }
                          </div>
                        </td>

                        <td
                          style={{
                            padding:
                              '14px',
                            borderBottom:
                              '1px solid #F1F5F9',
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {tier.min_hours}
                          h{' '}
                          →
                          {' '}
                          {tier.max_hours ==
                          null
                            ? '∞'
                            : `${tier.max_hours}h`}
                        </td>

                        <td
                          style={{
                            padding:
                              '14px',
                            borderBottom:
                              '1px solid #F1F5F9',
                            fontWeight:
                              800,
                          }}
                        >
                          {
                            tier.discount_percent
                          }
                          %
                        </td>

                        <td
                          style={{
                            padding:
                              '14px',
                            borderBottom:
                              '1px solid #F1F5F9',
                          }}
                        >
                          {
                            tier.priority
                          }
                        </td>

                        <td
                          style={{
                            padding:
                              '14px',
                            borderBottom:
                              '1px solid #F1F5F9',
                            minWidth:
                              190,
                          }}
                        >
                          <div>
                            {formatDate(
                              tier.effective_from,
                            )}
                          </div>
                          <div
                            style={{
                              marginTop:
                                3,
                              color:
                                '#64748B',
                              fontSize:
                                11,
                            }}
                          >
                            to{' '}
                            {formatDate(
                              tier.effective_to,
                            )}
                          </div>
                        </td>

                        <td
                          style={{
                            padding:
                              '14px',
                            borderBottom:
                              '1px solid #F1F5F9',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              void toggleTier(
                                tier,
                              )
                            }
                            style={{
                              border: 0,
                              cursor:
                                'pointer',
                              borderRadius:
                                999,
                              padding:
                                '6px 10px',
                              fontWeight:
                                800,
                              fontSize:
                                11,
                              background:
                                tier.is_active
                                  ? '#DDF7F0'
                                  : '#F1F5F9',
                              color:
                                tier.is_active
                                  ? '#087F72'
                                  : '#64748B',
                            }}
                          >
                            {tier.is_active
                              ? 'Active'
                              : 'Inactive'}
                          </button>
                        </td>

                        <td
                          style={{
                            padding:
                              '14px',
                            borderBottom:
                              '1px solid #F1F5F9',
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          <div
                            style={{
                              display:
                                'flex',
                              gap: 6,
                            }}
                          >
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() =>
                                openEdit(
                                  tier,
                                )
                              }
                            >
                              <Edit3
                                size={
                                  14
                                }
                              />
                              Edit
                            </button>

                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() =>
                                void removeTier(
                                  tier,
                                )
                              }
                            >
                              <Trash2
                                size={
                                  14
                                }
                              />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(2, 15, 27, 0.55)',
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            padding: 20,
            zIndex: 100,
          }}
        >
          <div
            style={{
              width:
                'min(680px, 100%)',
              maxHeight:
                '90vh',
              overflowY:
                'auto',
              background:
                '#FFFFFF',
              borderRadius:
                18,
              boxShadow:
                '0 24px 80px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                display:
                  'flex',
                alignItems:
                  'center',
                justifyContent:
                  'space-between',
                padding:
                  '18px 20px',
                borderBottom:
                  '1px solid #E5E7EB',
              }}
            >
              <div>
                <div className="page-eyebrow">
                  PRICING TIER
                </div>
                <h2
                  style={{
                    margin:
                      '4px 0 0',
                    color:
                      '#062F52',
                  }}
                >
                  {editing
                    ? 'Edit duration discount'
                    : 'Create duration discount'}
                </h2>
              </div>

              <button
                className="secondary-button"
                type="button"
                onClick={
                  closeModal
                }
                disabled={
                  saving
                }
              >
                <X
                  size={16}
                />
              </button>
            </div>

            <div
              style={{
                padding: 20,
                display:
                  'grid',
                gridTemplateColumns:
                  '1fr 1fr',
                gap: 14,
              }}
            >
              <label className="field">
                <span>
                  Discount name
                </span>
                <input
                  className="input"
                  value={
                    name
                  }
                  onChange={event =>
                    setName(
                      event.target.value,
                    )
                  }
                  placeholder="10% for 4+ hours"
                />
              </label>

              <label className="field">
                <span>
                  Discount %
                </span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={
                    discountPercent
                  }
                  onChange={event =>
                    setDiscountPercent(
                      event.target.value,
                    )
                  }
                />
              </label>

              <label className="field">
                <span>
                  Minimum hours
                </span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.5"
                  value={
                    minHours
                  }
                  onChange={event =>
                    setMinHours(
                      event.target.value,
                    )
                  }
                />
              </label>

              <label className="field">
                <span>
                  Maximum hours
                  (optional)
                </span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.5"
                  value={
                    maxHours
                  }
                  onChange={event =>
                    setMaxHours(
                      event.target.value,
                    )
                  }
                  placeholder="Open ended"
                />
              </label>

              <label className="field">
                <span>
                  Priority
                </span>
                <input
                  className="input"
                  type="number"
                  step="1"
                  value={
                    priority
                  }
                  onChange={event =>
                    setPriority(
                      event.target.value,
                    )
                  }
                />
              </label>

              <label
                className="field checkbox-field"
              >
                <input
                  type="checkbox"
                  checked={
                    isActive
                  }
                  onChange={event =>
                    setIsActive(
                      event.target.checked,
                    )
                  }
                />
                <span>
                  Active
                </span>
              </label>

              <label className="field">
                <span>
                  Effective from
                </span>
                <input
                  className="input"
                  type="datetime-local"
                  value={
                    effectiveFrom
                  }
                  onChange={event =>
                    setEffectiveFrom(
                      event.target.value,
                    )
                  }
                />
              </label>

              <label className="field">
                <span>
                  Effective to
                  (optional)
                </span>
                <input
                  className="input"
                  type="datetime-local"
                  value={
                    effectiveTo
                  }
                  onChange={event =>
                    setEffectiveTo(
                      event.target.value,
                    )
                  }
                />
              </label>
            </div>

            {formError && (
              <div
                className="error-banner compact"
                style={{
                  margin:
                    '0 20px 16px',
                }}
              >
                {formError}
              </div>
            )}

            <div
              className="modal-footer"
              style={{
                padding:
                  '0 20px 20px',
              }}
            >
              <button
                className="secondary-button"
                onClick={
                  closeModal
                }
                disabled={
                  saving
                }
              >
                Cancel
              </button>

              <button
                className="primary-button"
                onClick={() =>
                  void saveTier()
                }
                disabled={
                  saving
                }
              >
                {saving
                  ? 'Saving...'
                  : editing
                    ? 'Save changes'
                    : 'Create discount'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}