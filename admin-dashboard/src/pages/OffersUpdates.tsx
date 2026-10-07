import { useEffect, useMemo, useState } from 'react'
import { Edit3, Image as ImageIcon, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react'

import { supabase } from '../lib/supabase'

type ContentType = 'offer' | 'update'

type Service = {
  id: string
  name: string
  is_active: boolean
}

type ContentItem = {
  id: string
  type: ContentType
  title: string
  subtitle: string | null
  cta_text: string | null
  body: string | null
  service_id: string | null
  service_name: string | null
  image_url: string | null
  sort_order: number
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
  discount_type: 'percent' | 'fixed' | null
  discount_value: number | null
  discount_currency: string | null
  minimum_hours: number | null
  maximum_discount_amount: number | null
  priority: number | null
  stackable_with_duration_discount: boolean
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function formatDate(value: string | null) {
  if (!value) return 'Always'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function toLocalDateTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalDateTime(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function createImagePath(type: ContentType, fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg'
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return `${type}s/${id}.${extension}`
}

export default function OffersUpdates() {
  const [items, setItems] = useState<ContentItem[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [tab, setTab] = useState<'all' | ContentType>('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ContentItem | null>(null)
  const [type, setType] = useState<ContentType>('offer')
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [body, setBody] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [isActive, setIsActive] = useState(true)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [hasDiscount, setHasDiscount] = useState(false)
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')
  const [discountValue, setDiscountValue] = useState('')
  const [discountCurrency, setDiscountCurrency] = useState('INR')
  const [minimumHours, setMinimumHours] = useState('0')
  const [maximumDiscountAmount, setMaximumDiscountAmount] = useState('')
  const [priority, setPriority] = useState('0')
  const [stackableWithDurationDiscount, setStackableWithDurationDiscount] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter(item => {
      if (tab !== 'all' && item.type !== tab) return false
      if (!query) return true
      return [item.title, item.subtitle, item.body, item.service_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [items, tab, search])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [{ data: offers, error: offersError }, { data: updates, error: updatesError }, { data: serviceRows, error: servicesError }, { data: ruleRows, error: rulesError }] = await Promise.all([
        supabase.from('home_promotions').select('id,title,subtitle,cta_text,service_id,image_url,sort_order,is_active,starts_at,ends_at,created_at,updated_at').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
        supabase.from('home_updates').select('id,title,body,cta_text,service_id,image_url,sort_order,is_active,starts_at,ends_at,created_at,updated_at').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
        supabase.from('services').select('id,name,is_active').order('name', { ascending: true }),
        supabase.from('promotion_rules').select('promotion_id,discount_type,discount_value,discount_currency,minimum_hours,maximum_discount_amount,priority,stackable_with_duration_discount,is_active'),
      ])

      if (offersError) throw offersError
      if (updatesError) throw updatesError
      if (servicesError) throw servicesError
      if (rulesError) throw rulesError

      const serviceList = (serviceRows || []) as Service[]
      const byService = new Map(serviceList.map(service => [service.id, service.name]))
      const rulesByPromotion = new Map((ruleRows || []).map(row => [row.promotion_id, row]))

      const offerItems: ContentItem[] = (offers || []).map(row => {
        const rule = rulesByPromotion.get(row.id)
        return {
        id: row.id,
        type: 'offer',
        title: row.title,
        subtitle: row.subtitle,
        cta_text: row.cta_text,
        body: null,
        service_id: row.service_id,
        service_name: row.service_id ? byService.get(row.service_id) || null : null,
        image_url: row.image_url,
        sort_order: Number(row.sort_order || 0),
        is_active: Boolean(row.is_active),
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        discount_type: rule?.discount_type || null,
        discount_value: rule?.discount_value == null ? null : Number(rule.discount_value),
        discount_currency: rule?.discount_currency || null,
        minimum_hours: rule?.minimum_hours == null ? null : Number(rule.minimum_hours),
        maximum_discount_amount: rule?.maximum_discount_amount == null ? null : Number(rule.maximum_discount_amount),
        priority: rule?.priority == null ? null : Number(rule.priority),
        stackable_with_duration_discount: Boolean(rule?.stackable_with_duration_discount),
      }
      })

      const updateItems: ContentItem[] = (updates || []).map(row => ({
        id: row.id,
        type: 'update',
        title: row.title,
        subtitle: null,
        cta_text: row.cta_text,
        body: row.body,
        service_id: row.service_id,
        service_name: row.service_id ? byService.get(row.service_id) || null : null,
        image_url: row.image_url,
        sort_order: Number(row.sort_order || 0),
        is_active: Boolean(row.is_active),
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        discount_type: null,
        discount_value: null,
        discount_currency: null,
        minimum_hours: null,
        maximum_discount_amount: null,
        priority: null,
        stackable_with_duration_discount: false,
      }))

      setServices(serviceList)
      setItems([...offerItems, ...updateItems].sort((a, b) => a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at)))
    } catch (err) {
      console.error('Failed to load offers and updates:', err)
      setError(err instanceof Error ? err.message : 'Failed to load offers and updates.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function clearForm() {
    if (imagePreview?.startsWith('blob:')) window.URL.revokeObjectURL(imagePreview)
    setEditing(null)
    setType('offer')
    setTitle('')
    setSubtitle('')
    setBody('')
    setCtaText('')
    setServiceId('')
    setSortOrder('0')
    setIsActive(true)
    setStartsAt('')
    setEndsAt('')
    setHasDiscount(false)
    setDiscountType('percent')
    setDiscountValue('')
    setDiscountCurrency('INR')
    setMinimumHours('0')
    setMaximumDiscountAmount('')
    setPriority('0')
    setStackableWithDurationDiscount(false)
    setImageFile(null)
    setImagePreview(null)
    setFormError(null)
  }

  function openCreate(nextType: ContentType) {
    clearForm()
    setType(nextType)
    setModalOpen(true)
  }

  function openEdit(item: ContentItem) {
    clearForm()
    setEditing(item)
    setType(item.type)
    setTitle(item.title)
    setSubtitle(item.subtitle || '')
    setBody(item.body || '')
    setCtaText(item.cta_text || '')
    setServiceId(item.service_id || '')
    setSortOrder(String(item.sort_order))
    setIsActive(item.is_active)
    setStartsAt(toLocalDateTime(item.starts_at))
    setEndsAt(toLocalDateTime(item.ends_at))
    setHasDiscount(item.type === 'offer' && item.discount_type !== null)
    setDiscountType(item.discount_type || 'percent')
    setDiscountValue(item.discount_value == null ? '' : String(item.discount_value))
    setDiscountCurrency(item.discount_currency || 'INR')
    setMinimumHours(item.minimum_hours == null ? '0' : String(item.minimum_hours))
    setMaximumDiscountAmount(item.maximum_discount_amount == null ? '' : String(item.maximum_discount_amount))
    setPriority(item.priority == null ? '0' : String(item.priority))
    setStackableWithDurationDiscount(Boolean(item.stackable_with_duration_discount))
    setImagePreview(item.image_url)
    setModalOpen(true)
  }

  function handleImageChange(file: File | null) {
    if (!file) {
      if (imagePreview?.startsWith('blob:')) window.URL.revokeObjectURL(imagePreview)
      setImageFile(null)
      setImagePreview(null)
      return
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setFormError('Use a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setFormError('Image must be 5 MB or smaller.')
      return
    }
    if (imagePreview?.startsWith('blob:')) window.URL.revokeObjectURL(imagePreview)
    setFormError(null)
    setImageFile(file)
    setImagePreview(window.URL.createObjectURL(file))
  }

  async function uploadImage(file: File) {
    const path = createImagePath(type, file.name)
    const { error: uploadError } = await supabase.storage.from('home-content-images').upload(path, file, { upsert: false, contentType: file.type })
    if (uploadError) throw uploadError
    const { data } = supabase.storage.from('home-content-images').getPublicUrl(path)
    return data.publicUrl
  }

  async function save() {
    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setFormError('Title is required.')
      return
    }
    const order = Number(sortOrder)
    if (!Number.isFinite(order) || order < 0) {
      setFormError('Display order must be a non-negative number.')
      return
    }
    if (type === 'offer' && hasDiscount) {
      const value = Number(discountValue)
      const minHours = Number(minimumHours)
      const promoPriority = Number(priority)
      const maxDiscount = maximumDiscountAmount.trim() === '' ? null : Number(maximumDiscountAmount)
      if (!Number.isFinite(value) || value <= 0) {
        setFormError('Enter a valid discount value.')
        return
      }
      if (discountType === 'percent' && value > 100) {
        setFormError('Percentage discount cannot exceed 100%.')
        return
      }
      if (discountType === 'fixed' && !discountCurrency.trim()) {
        setFormError('Currency is required for a fixed discount.')
        return
      }
      if (!Number.isFinite(minHours) || minHours < 0) {
        setFormError('Minimum hours must be 0 or greater.')
        return
      }
      if (!Number.isFinite(promoPriority)) {
        setFormError('Priority must be a valid number.')
        return
      }
      if (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) {
        setFormError('Maximum discount must be greater than 0.')
        return
      }
      if (discountType === 'fixed' && maxDiscount !== null) {
        setFormError('Maximum discount only applies to percentage promotions.')
        return
      }
    }
    if (startsAt && endsAt) {
      const start = new Date(startsAt).getTime()
      const end = new Date(endsAt).getTime()
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        setFormError('End time must be later than start time.')
        return
      }
    }

    setSaving(true)
    setFormError(null)
    try {
      let imageUrl = editing?.image_url || null
      if (imageFile) imageUrl = await uploadImage(imageFile)

      if (type === 'offer') {
        const payload = {
          title: cleanTitle,
          subtitle: subtitle.trim() || null,
          cta_text: ctaText.trim() || null,
          service_id: serviceId || null,
          image_url: imageUrl,
          sort_order: order,
          is_active: isActive,
          starts_at: fromLocalDateTime(startsAt),
          ends_at: fromLocalDateTime(endsAt),
        }

        let promotionId = editing?.id || null
        if (editing) {
          const result = await supabase.from('home_promotions').update(payload).eq('id', editing.id)
          if (result.error) throw result.error
        } else {
          const result = await supabase.from('home_promotions').insert(payload).select('id').single()
          if (result.error) throw result.error
          promotionId = result.data.id
        }

        if (!promotionId) throw new Error('Promotion id is missing after save.')

        if (hasDiscount) {
          const value = Number(discountValue)
          const minHours = Number(minimumHours)
          const maxDiscount = maximumDiscountAmount.trim() === '' ? null : Number(maximumDiscountAmount)
          const rulePayload = {
            promotion_id: promotionId,
            discount_type: discountType,
            discount_value: value,
            discount_currency: discountType === 'fixed' ? discountCurrency.trim().toUpperCase() : null,
            minimum_hours: minHours,
            maximum_discount_amount: discountType === 'percent' ? maxDiscount : null,
            priority: Number(priority),
            stackable_with_duration_discount: stackableWithDurationDiscount,
            is_active: isActive,
            updated_at: new Date().toISOString(),
          }
          const ruleResult = await supabase.from('promotion_rules').upsert(rulePayload, { onConflict: 'promotion_id' })
          if (ruleResult.error) throw ruleResult.error
        } else {
          const ruleResult = await supabase.from('promotion_rules').delete().eq('promotion_id', promotionId)
          if (ruleResult.error) throw ruleResult.error
        }
      } else {
        const payload = {
          title: cleanTitle,
          body: body.trim() || null,
          cta_text: ctaText.trim() || null,
          service_id: serviceId || null,
          image_url: imageUrl,
          sort_order: order,
          is_active: isActive,
          starts_at: fromLocalDateTime(startsAt),
          ends_at: fromLocalDateTime(endsAt),
        }

        const result = editing
          ? await supabase.from('home_updates').update(payload).eq('id', editing.id)
          : await supabase.from('home_updates').insert(payload)
        if (result.error) throw result.error
      }

      setModalOpen(false)
      clearForm()
      await load()
    } catch (err) {
      console.error('Failed to save home content:', err)
      setFormError(err instanceof Error ? err.message : 'Failed to save content.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(item: ContentItem) {
    try {
      const result = item.type === 'offer'
        ? await supabase.from('home_promotions').update({ is_active: !item.is_active }).eq('id', item.id)
        : await supabase.from('home_updates').update({ is_active: !item.is_active }).eq('id', item.id)
      if (result.error) throw result.error
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update content.')
    }
  }

  async function remove(item: ContentItem) {
    if (!window.confirm(`Delete this ${item.type}?`)) return
    try {
      const result = item.type === 'offer'
        ? await supabase.from('home_promotions').delete().eq('id', item.id)
        : await supabase.from('home_updates').delete().eq('id', item.id)
      if (result.error) throw result.error
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete content.')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 22 }}>
        <div>
          <div className="page-eyebrow">HOME CMS</div>
          <h1 style={{ margin: '5px 0 6px' }}>Offers & Updates</h1>
          <p style={{ margin: 0, color: '#71818C' }}>Manage the content customers see on the Home Screen. Offers can now carry server-enforced automatic discount rules. Booking totals are calculated by the backend; this page only configures the rule.</p>
        </div>
        <button className="dashboard-refresh" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} style={{ marginRight: 6 }} /> Refresh
        </button>
      </div>

      {error && <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: '#FEF2F2', color: '#B91C1C' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {(['all', 'offer', 'update'] as const).map(value => (
          <button key={value} type="button" onClick={() => setTab(value)} style={{ border: '1px solid #D9E5E8', borderRadius: 999, padding: '9px 14px', background: tab === value ? '#062F52' : '#FFF', color: tab === value ? '#FFF' : '#456174', fontWeight: 800, cursor: 'pointer' }}>
            {value === 'all' ? 'All' : value === 'offer' ? 'Offers' : 'Updates'}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search content..." style={{ marginLeft: 'auto', minWidth: 240 }} />
        <button className="dashboard-refresh" onClick={() => openCreate('offer')}><Plus size={15} style={{ marginRight: 6 }} /> New offer</button>
        <button className="dashboard-refresh" onClick={() => openCreate('update')}><Plus size={15} style={{ marginRight: 6 }} /> New update</button>
      </div>

      {loading ? <div style={{ padding: 30, color: '#71818C' }}>Loading home content...</div> : visibleItems.length === 0 ? (
        <div style={{ padding: 40, background: '#FFF', border: '1px solid #E3EBEF', borderRadius: 16, textAlign: 'center', color: '#71818C' }}>No content found.</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {visibleItems.map(item => (
            <div key={`${item.type}-${item.id}`} style={{ display: 'grid', gridTemplateColumns: '150px 1fr auto', gap: 16, alignItems: 'center', padding: 14, background: '#FFF', border: '1px solid #E3EBEF', borderRadius: 16 }}>
              <div style={{ width: 150, height: 96, borderRadius: 12, background: '#F2F8F9', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.image_url ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <ImageIcon size={28} color="#7A939E" />}
              </div>
              <div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 10, fontWeight: 900, letterSpacing: .6, background: item.type === 'offer' ? '#FFF4E7' : '#EAF5F7', color: item.type === 'offer' ? '#A85E00' : '#007E80' }}>{item.type === 'offer' ? 'OFFER' : 'UPDATE'}</span>
                  <span style={{ fontSize: 11, color: item.is_active ? '#007E80' : '#9AAAB2', fontWeight: 800 }}>{item.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                </div>
                <h3 style={{ margin: 0, color: '#062F52' }}>{item.title}</h3>
                {item.subtitle && <div style={{ marginTop: 4, color: '#456174' }}>{item.subtitle}</div>}
                {item.body && <div style={{ marginTop: 4, color: '#456174' }}>{item.body}</div>}
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: '#71818C' }}>
                  <span>Order {item.sort_order}</span>
                  {item.service_name && <span>Service: {item.service_name}</span>}
                  {item.type === 'offer' && item.discount_type && <span style={{ color: '#007E80', fontWeight: 900 }}>{item.discount_type === 'percent' ? `${item.discount_value}% off` : `${item.discount_currency || 'INR'} ${item.discount_value} off`}{item.minimum_hours && item.minimum_hours > 0 ? ` · min ${item.minimum_hours}h` : ''}</span>}
                  <span>From: {formatDate(item.starts_at)}</span>
                  <span>To: {formatDate(item.ends_at)}</span>
                  {item.cta_text && <span>CTA: {item.cta_text}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="dashboard-refresh" onClick={() => openEdit(item)}><Edit3 size={14} style={{ marginRight: 6 }} /> Edit</button>
                <button className="dashboard-refresh" onClick={() => void toggleActive(item)}>{item.is_active ? 'Disable' : 'Publish'}</button>
                <button className="dashboard-refresh" onClick={() => void remove(item)} style={{ color: '#B91C1C' }}><Trash2 size={14} style={{ marginRight: 6 }} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,47,82,.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}>
          <div style={{ width: 'min(1000px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#FFF', borderRadius: 20, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <div className="page-eyebrow">{editing ? 'EDIT' : 'CREATE'}</div>
                <h2 style={{ margin: '5px 0 0' }}>{editing ? `Edit ${type}` : `New ${type}`}</h2>
              </div>
              <button type="button" onClick={() => { setModalOpen(false); clearForm() }} style={{ border: 'none', background: '#F2F6F7', width: 38, height: 38, borderRadius: 10, cursor: 'pointer' }}><X size={17} /></button>
            </div>

            {formError && <div style={{ marginBottom: 15, padding: 12, borderRadius: 12, background: '#FEF2F2', color: '#B91C1C' }}>{formError}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr', gap: 22 }}>
              <div>
                <div style={{ marginBottom: 13 }}>
                  <label>Content type</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 7 }}>
                    {(['offer', 'update'] as ContentType[]).map(value => (
                      <button key={value} type="button" onClick={() => !editing && setType(value)} disabled={Boolean(editing)} style={{ flex: 1, padding: '11px 12px', borderRadius: 10, border: '1px solid #D9E5E8', background: type === value ? '#062F52' : '#FFF', color: type === value ? '#FFF' : '#456174', fontWeight: 800 }}>{value === 'offer' ? 'Offer / promotion banner' : 'Customer update'}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 13 }}><label>Title *</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder={type === 'offer' ? 'Example: Book staff for your next event' : 'Example: New service available'} /></div>
                {type === 'offer' ? <div style={{ marginBottom: 13 }}><label>Subtitle</label><textarea rows={3} value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Supporting offer text shown on the Home Screen" /></div> : <div style={{ marginBottom: 13 }}><label>Update details</label><textarea rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Explain the update to customers" /></div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 13 }}>
                  <div><label>CTA text</label><input value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="Book now / Explore" /></div>
                  <div><label>Linked service</label><select value={serviceId} onChange={e => setServiceId(e.target.value)}><option value="">No specific service</option>{services.filter(s => s.is_active).map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></div>
                </div>
                {type === 'offer' && <div style={{ margin: '16px 0', padding: 15, borderRadius: 14, border: '1px solid #DCE8EB', background: '#FAFCFD' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div><strong>Automatic discount</strong><div style={{ marginTop: 3, color: '#71818C', fontSize: 11 }}>Server-enforced pricing rule for eligible bookings.</div></div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800 }}><input type="checkbox" checked={hasDiscount} onChange={e => setHasDiscount(e.target.checked)} disabled={saving} /> Enabled</label>
                  </div>
                  {hasDiscount && <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label>Discount type</label><select value={discountType} onChange={e => setDiscountType(e.target.value as 'percent' | 'fixed')} disabled={saving}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select></div>
                      <div><label>{discountType === 'percent' ? 'Discount %' : 'Discount amount'}</label><input type="number" min="0" step="0.01" value={discountValue} onChange={e => setDiscountValue(e.target.value)} placeholder={discountType === 'percent' ? '10' : '200'} /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: discountType === 'fixed' ? '1fr 1fr' : '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
                      {discountType === 'fixed' && <div><label>Currency</label><input value={discountCurrency} onChange={e => setDiscountCurrency(e.target.value.toUpperCase())} maxLength={3} /></div>}
                      <div><label>Minimum hours</label><input type="number" min="0" step="0.01" value={minimumHours} onChange={e => setMinimumHours(e.target.value)} /></div>
                      {discountType === 'percent' && <div><label>Maximum discount (optional)</label><input type="number" min="0" step="0.01" value={maximumDiscountAmount} onChange={e => setMaximumDiscountAmount(e.target.value)} placeholder="No cap" /></div>}
                      <div><label>Priority</label><input type="number" step="1" value={priority} onChange={e => setPriority(e.target.value)} /></div>
                    </div>
                    <label style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}><input type="checkbox" checked={stackableWithDurationDiscount} onChange={e => setStackableWithDurationDiscount(e.target.checked)} disabled={saving} /> Stack with service-duration discount</label>
                  </>}
                </div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 13 }}>
                  <div><label>Display order</label><input type="number" min="0" value={sortOrder} onChange={e => setSortOrder(e.target.value)} /></div>
                  <div><label>Starts at</label><input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} /></div>
                  <div><label>Ends at</label><input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} /></div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Publish / active</label>
                {type === 'offer' && <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: '#EEF6F7', color: '#4B6877', fontSize: 12, lineHeight: 17 }}>Automatic discount rules are enforced by the server pricing engine. A non-stackable promotion replaces the normal service-duration discount; a stackable promotion is applied on top of it.</div>}
              </div>

              <div>
                <label>Home image</label>
                <div style={{ marginTop: 7, minHeight: 250, borderRadius: 16, border: '1px dashed #B8D2D9', background: '#F7FBFC', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {imagePreview ? <><img src={imagePreview} alt="Preview" style={{ width: '100%', height: 250, objectFit: 'contain', padding: 10 }} /><button type="button" onClick={() => handleImageChange(null)} disabled={saving} style={{ position: 'absolute', right: 9, top: 9, width: 34, height: 34, border: 0, borderRadius: 10, background: 'rgba(6,47,82,.88)', color: '#FFF' }}><X size={16} /></button></> : <label style={{ width: '100%', minHeight: 250, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Upload size={28} color="#007E80" /><strong style={{ marginTop: 10 }}>Upload image</strong><span style={{ marginTop: 5, color: '#71818C', fontSize: 12 }}>JPG, PNG or WebP · max 5 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => handleImageChange(e.target.files?.[0] || null)} style={{ display: 'none' }} /></label>}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button className="dashboard-refresh" onClick={() => { setModalOpen(false); clearForm() }} disabled={saving}>Cancel</button>
              <button className="dashboard-refresh" onClick={() => void save()} disabled={saving} style={{ background: '#062F52', color: '#FFF', minWidth: 150 }}>{saving ? 'Saving...' : editing ? 'Save changes' : `Create ${type}`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
