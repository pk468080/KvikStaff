import { useEffect, useMemo, useState } from 'react'
import {
  Edit3,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Star,
  Upload,
  X,
} from 'lucide-react'

import { supabase } from '../lib/supabase'
import { adminAction } from '../lib/adminAction'

type Category = {
  id: string
  name: string
  slug: string
  description: string | null
  display_order: number
  is_active: boolean
}

type Service = {
  id: string
  name: string
  description: string | null
  image_url: string | null
  is_active: boolean
  worker_count: number
  hourly_price: number | null
  currency: string
  category_id: string | null
  category_name: string | null
  display_order: number
  is_featured: boolean
}

type PriceHistoryRow = {
  id: string
  price: number
  currency: string
  effective_from: string
  effective_to: string | null
  is_active: boolean
}

type ServiceFormMode = 'create' | 'edit'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'category'
  )
}

function createImagePath(
  serviceName: string,
  serviceId?: string,
  fileName?: string
) {
  const extension =
    fileName?.split('.').pop()?.toLowerCase() || 'jpg'

  const safeName =
    serviceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'service'

  const uniqueId =
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 10)}`

  const folder = serviceId
    ? `services/${serviceId}`
    : 'services'

  return `${folder}/${uniqueId}-${safeName}.${extension}`
}

function isServiceImageUrl(url: string | null) {
  return Boolean(
    url &&
      url.includes(
        '/storage/v1/object/public/service-images/'
      )
  )
}

function getStoragePathFromServiceImageUrl(
  url: string | null
) {
  if (!url || !isServiceImageUrl(url)) {
    return null
  }

  const marker =
    '/storage/v1/object/public/service-images/'

  const index = url.indexOf(marker)

  if (index === -1) {
    return null
  }

  return decodeURIComponent(
    url.slice(index + marker.length)
  )
}

function formatDate(value: string | null) {
  if (!value) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function Services() {
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] =
    useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] =
    useState<string | null>(null)
  const [error, setError] =
    useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<
    'all' | 'active' | 'inactive'
  >('all')

  const [formOpen, setFormOpen] =
    useState(false)
  const [formMode, setFormMode] =
    useState<ServiceFormMode>('create')
  const [saving, setSaving] =
    useState(false)
  const [formError, setFormError] =
    useState<string | null>(null)

  const [editingService, setEditingService] =
    useState<Service | null>(null)
  const [serviceName, setServiceName] =
    useState('')
  const [description, setDescription] =
    useState('')
  const [hourlyPrice, setHourlyPrice] =
    useState('')
  const [currency, setCurrency] =
    useState('INR')
  const [categoryId, setCategoryId] =
    useState('')
  const [displayOrder, setDisplayOrder] =
    useState('0')
  const [isFeatured, setIsFeatured] =
    useState(false)
  const [isActive, setIsActive] =
    useState(true)

  const [imageFile, setImageFile] =
    useState<File | null>(null)
  const [imagePreview, setImagePreview] =
    useState<string | null>(null)

  const [priceHistoryOpen, setPriceHistoryOpen] =
    useState(false)
  const [priceHistoryLoading, setPriceHistoryLoading] =
    useState(false)
  const [priceHistory, setPriceHistory] =
    useState<PriceHistoryRow[]>([])

  const [newCategoryName, setNewCategoryName] =
    useState('')
  const [addingCategory, setAddingCategory] =
    useState(false)

  function revokePreview() {
    if (
      imagePreview &&
      imagePreview.startsWith('blob:')
    ) {
      window.URL.revokeObjectURL(imagePreview)
    }
  }

  function clearImagePreview() {
    revokePreview()
    setImageFile(null)
    setImagePreview(null)
  }

  function resetForm() {
    clearImagePreview()
    setEditingService(null)
    setServiceName('')
    setDescription('')
    setHourlyPrice('')
    setCurrency('INR')
    setCategoryId('')
    setDisplayOrder('0')
    setIsFeatured(false)
    setIsActive(true)
    setFormError(null)
    setPriceHistoryOpen(false)
    setPriceHistory([])
    setNewCategoryName('')
  }

  function closeForm() {
    if (saving) {
      return
    }

    setFormOpen(false)
    resetForm()
  }

  function openCreateForm() {
    resetForm()

    const generalCategory =
      categories.find(
        (category) =>
          category.slug === 'general'
      )

    setCategoryId(
      generalCategory?.id || ''
    )

    setFormMode('create')
    setFormOpen(true)
  }

  function openEditForm(service: Service) {
    resetForm()

    setFormMode('edit')
    setEditingService(service)
    setServiceName(service.name)
    setDescription(service.description || '')
    setHourlyPrice(
      service.hourly_price === null
        ? ''
        : String(service.hourly_price)
    )
    setCurrency(service.currency || 'INR')
    setCategoryId(service.category_id || '')
    setDisplayOrder(
      String(service.display_order)
    )
    setIsFeatured(service.is_featured)
    setIsActive(service.is_active)
    setImagePreview(service.image_url)
    setFormOpen(true)
  }

  async function loadCategories(): Promise<Category[]> {
    const { data, error } =
      await supabase
        .from('service_categories')
        .select(`
          id,
          name,
          slug,
          description,
          display_order,
          is_active
        `)
        .order('display_order', {
          ascending: true,
        })
        .order('name', {
          ascending: true,
        })

    if (error) {
      throw error
    }

    const nextCategories =
      (data || []) as Category[]

    setCategories(nextCategories)

    return nextCategories
  }

  async function loadServices() {
    setLoading(true)
    setError(null)

    try {
      const loadedCategories =
        await loadCategories()

      const {
        data: serviceRows,
        error: servicesError,
      } = await supabase
        .from('services')
        .select(`
          id,
          name,
          description,
          image_url,
          is_active,
          category_id,
          display_order,
          is_featured,
          service_variants (
            id,
            name,
            billing_type,
            is_active,
            sort_order,
            service_variant_prices (
              price,
              currency,
              effective_from,
              effective_to,
              is_active
            )
          )
        `)
        .order('display_order', {
          ascending: true,
        })
        .order('name', {
          ascending: true,
        })

      if (servicesError) {
        throw servicesError
      }

      const {
        data: workerServices,
        error: workerServicesError,
      } = await supabase
        .from('worker_services')
        .select(`
          worker_id,
          service_id
        `)

      if (workerServicesError) {
        throw workerServicesError
      }

      const workerCounts =
        new Map<string, number>()

      for (
        const row of workerServices || []
      ) {
        if (!row.service_id) {
          continue
        }

        workerCounts.set(
          row.service_id,
          (workerCounts.get(
            row.service_id
          ) || 0) + 1
        )
      }

      const now = Date.now()

      const result: Service[] = (
        serviceRows || []
      ).map((service) => {
        const variants =
          (service as {
            service_variants?: Array<{
              billing_type: string
              is_active: boolean
              sort_order: number
              service_variant_prices?:
                Array<{
                  price: number | string
                  currency: string
                  effective_from: string | null
                  effective_to: string | null
                  is_active: boolean
                }>
            }>
          }).service_variants || []

        const hourlyVariant =
          variants
            .filter(
              (variant) =>
                variant.billing_type ===
                  'hourly' &&
                variant.is_active
            )
            .sort(
              (a, b) =>
                a.sort_order -
                b.sort_order
            )[0]

        const currentPrice =
          hourlyVariant
            ?.service_variant_prices
            ?.filter((price) => {
              if (!price.is_active) {
                return false
              }

              const effectiveFrom =
                price.effective_from
                  ? new Date(
                      price.effective_from
                    ).getTime()
                  : Number.NEGATIVE_INFINITY

              const effectiveTo =
                price.effective_to
                  ? new Date(
                      price.effective_to
                    ).getTime()
                  : Number.POSITIVE_INFINITY

              return (
                effectiveFrom <= now &&
                now < effectiveTo
              )
            })
            .sort((a, b) => {
              const aTime =
                a.effective_from
                  ? new Date(
                      a.effective_from
                    ).getTime()
                  : Number.NEGATIVE_INFINITY

              const bTime =
                b.effective_from
                  ? new Date(
                      b.effective_from
                    ).getTime()
                  : Number.NEGATIVE_INFINITY

              return bTime - aTime
            })?.[0]

        const category =
          loadedCategories.find(
            (item) =>
              item.id ===
              (service as {
                category_id?: string | null
              }).category_id
          )

        return {
          id: service.id,
          name: service.name,
          description:
            service.description,
          image_url:
            (
              service as {
                image_url?: string | null
              }
            ).image_url || null,
          is_active: Boolean(
            service.is_active
          ),
          worker_count:
            workerCounts.get(service.id) ||
            0,
          hourly_price: currentPrice
            ? Number(currentPrice.price)
            : null,
          currency:
            currentPrice?.currency ||
            'INR',
          category_id:
            (
              service as {
                category_id?: string | null
              }
            ).category_id || null,
          category_name:
            category?.name || null,
          display_order:
            Number(
              (
                service as {
                  display_order?: number
                }
              ).display_order || 0
            ),
          is_featured: Boolean(
            (
              service as {
                is_featured?: boolean
              }
            ).is_featured
          ),
        }
      })

      setServices(result)
    } catch (err) {
      console.error(
        'Failed to load services:',
        err
      )

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load services.'
      )

      setServices([])
    } finally {
      setLoading(false)
    }
  }

  function handleImageChange(
    file: File | null
  ) {
    if (!file) {
      clearImagePreview()
      return
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setFormError(
        'Use a JPG, PNG, or WebP image.'
      )
      return
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setFormError(
        'Image must be 5 MB or smaller.'
      )
      return
    }

    revokePreview()

    setFormError(null)
    setImageFile(file)
    setImagePreview(
      window.URL.createObjectURL(file)
    )
  }

  async function addCategory() {
    const name = newCategoryName.trim()

    if (!name) {
      setFormError(
        'Enter a category name.'
      )
      return
    }

    setAddingCategory(true)
    setFormError(null)

    try {
      const slug = slugify(name)

      const { data, error } =
        await supabase
          .from('service_categories')
          .insert({
            name,
            slug,
            display_order:
              categories.length * 10 + 10,
            is_active: true,
          })
          .select(`
            id,
            name,
            slug,
            description,
            display_order,
            is_active
          `)
          .single()

      if (error) {
        throw error
      }

      const category =
        data as Category

      setCategories((current) =>
        [...current, category].sort(
          (a, b) =>
            a.display_order -
              b.display_order ||
            a.name.localeCompare(
              b.name
            )
        )
      )

      setCategoryId(category.id)
      setNewCategoryName('')
    } catch (err) {
      console.error(
        'Failed to add category:',
        err
      )

      setFormError(
        err instanceof Error
          ? err.message
          : 'Failed to add category.'
      )
    } finally {
      setAddingCategory(false)
    }
  }

  async function loadPriceHistory(
    service: Service
  ) {
    setPriceHistoryLoading(true)
    setFormError(null)

    try {
      const {
        data: variantRows,
        error: variantError,
      } = await supabase
        .from('service_variants')
        .select(`
          id,
          billing_type,
          sort_order
        `)
        .eq('service_id', service.id)
        .eq('billing_type', 'hourly')
        .order('sort_order', {
          ascending: true,
        })
        .limit(1)

      if (variantError) {
        throw variantError
      }

      const variantId =
        variantRows?.[0]?.id

      if (!variantId) {
        setPriceHistory([])
        return
      }

      const {
        data: priceRows,
        error: priceError,
      } = await supabase
        .from('service_variant_prices')
        .select(`
          id,
          price,
          currency,
          effective_from,
          effective_to,
          is_active
        `)
        .eq(
          'service_variant_id',
          variantId
        )
        .order('effective_from', {
          ascending: false,
        })

      if (priceError) {
        throw priceError
      }

      setPriceHistory(
        (priceRows || []).map(
          (row) => ({
            id: row.id,
            price: Number(row.price),
            currency: row.currency,
            effective_from:
              row.effective_from,
            effective_to:
              row.effective_to,
            is_active:
              Boolean(row.is_active),
          })
        )
      )
    } catch (err) {
      console.error(
        'Failed to load price history:',
        err
      )

      setFormError(
        err instanceof Error
          ? err.message
          : 'Failed to load price history.'
      )
    } finally {
      setPriceHistoryLoading(false)
    }
  }

  async function saveService() {
    const name = serviceName.trim()
    const descriptionValue =
      description.trim()
    const price = Number(hourlyPrice)
    const normalizedCurrency =
      currency.trim().toUpperCase()
    const order = Number(displayOrder)

    if (!name) {
      setFormError(
        'Service name is required.'
      )
      return
    }

    if (!Number.isFinite(price) || price < 0) {
      setFormError(
        'Enter a valid hourly price.'
      )
      return
    }

    if (!normalizedCurrency) {
      setFormError(
        'Currency is required.'
      )
      return
    }

    if (!Number.isInteger(order) || order < 0) {
      setFormError(
        'Display order must be a whole number greater than or equal to 0.'
      )
      return
    }

    setSaving(true)
    setFormError(null)
    setError(null)

    let uploadedPath:
      string | null = null
    let uploadedImageUrl:
      string | null = null

    try {
      if (imageFile) {
        uploadedPath =
          createImagePath(
            name,
            editingService?.id,
            imageFile.name
          )

        const {
          error: uploadError,
        } = await supabase.storage
          .from('service-images')
          .upload(
            uploadedPath,
            imageFile,
            {
              cacheControl: '3600',
              contentType:
                imageFile.type,
              upsert: false,
            }
          )

        if (uploadError) {
          throw uploadError
        }

        const {
          data: publicUrlData,
        } = supabase.storage
          .from('service-images')
          .getPublicUrl(
            uploadedPath
          )

        uploadedImageUrl =
          publicUrlData.publicUrl
      }

      if (formMode === 'create') {
        const {
          error: rpcError,
        } = await adminAction(
          'admin_create_service',
          {
            p_name: name,
            p_description:
              descriptionValue || null,
            p_hourly_price: price,
            p_currency:
              normalizedCurrency,
            p_image_url:
              uploadedImageUrl,
            p_is_active:
              isActive,
            p_category_id:
              categoryId || null,
            p_display_order:
              order,
            p_is_featured:
              isFeatured,
          }
        )

        if (rpcError) {
          throw rpcError
        }
      } else {
        if (!editingService) {
          throw new Error(
            'No service selected for editing.'
          )
        }

        const {
          error: catalogError,
        } = await adminAction(
          'admin_update_service_catalog',
          {
            p_service_id:
              editingService.id,
            p_name: name,
            p_description:
              descriptionValue || null,
            p_image_url:
              uploadedImageUrl,
            p_is_active:
              isActive,
            p_category_id:
              categoryId || null,
            p_display_order:
              order,
            p_is_featured:
              isFeatured,
          }
        )

        if (catalogError) {
          throw catalogError
        }

        const {
          error: priceError,
        } = await adminAction(
          'admin_update_current_hourly_service_price',
          {
            p_service_id:
              editingService.id,
            p_price: price,
            p_currency:
              normalizedCurrency,
          }
        )

        if (priceError) {
          throw priceError
        }

        if (
          uploadedImageUrl &&
          editingService.image_url
        ) {
          const oldPath =
            getStoragePathFromServiceImageUrl(
              editingService.image_url
            )

          if (oldPath) {
            const {
              error:
                removeError,
            } =
              await supabase.storage
                .from(
                  'service-images'
                )
                .remove([
                  oldPath,
                ])

            if (removeError) {
              console.warn(
                'New image saved, but old service image could not be removed:',
                removeError
              )
            }
          }
        }
      }

      setFormOpen(false)
      resetForm()
      await loadServices()
    } catch (err) {
      console.error(
        'Failed to save service:',
        err
      )

      if (uploadedPath) {
        const {
          error: cleanupError,
        } = await supabase.storage
          .from('service-images')
          .remove([uploadedPath])

        if (cleanupError) {
          console.error(
            'Failed to clean up uploaded service image:',
            cleanupError
          )
        }
      }

      setFormError(
        err instanceof Error
          ? err.message
          : 'Failed to save service.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function setServiceActive(
    service: Service
  ) {
    const nextState =
      !service.is_active

    const action = nextState
      ? 'activate'
      : 'deactivate'

    const confirmed =
      window.confirm(
        nextState
          ? `Activate ${service.name}?`
          : `Deactivate ${service.name}?`
      )

    if (!confirmed) {
      return
    }

    setProcessingId(service.id)
    setError(null)

    const {
      error: rpcError,
    } = await adminAction(
      'admin_set_service_active',
      {
        p_service_id: service.id,
        p_is_active: nextState,
      }
    )

    setProcessingId(null)

    if (rpcError) {
      console.error(
        `Failed to ${action} service:`,
        rpcError
      )

      setError(
        `Failed to ${action} service: ${rpcError.message}`
      )

      return
    }

    await loadServices()
  }

  useEffect(() => {
    void loadServices()

    return () => {
      revokePreview()
    }
  }, [])

  const filteredServices =
    useMemo(() => {
      const normalizedSearch =
        search.trim().toLowerCase()

      return services.filter(
        (service) => {
          const matchesStatus =
            status === 'all' ||
            (status ===
              'active' &&
              service.is_active) ||
            (status ===
              'inactive' &&
              !service.is_active)

          if (!matchesStatus) {
            return false
          }

          if (!normalizedSearch) {
            return true
          }

          return [
            service.name,
            service.description,
            service.id,
            service.category_name,
          ].some(
            (value) =>
              value
                ?.toLowerCase()
                .includes(
                  normalizedSearch
                )
          )
        }
      )
    }, [services, search, status])

  const activeCount =
    services.filter(
      (service) =>
        service.is_active
    ).length

  const inactiveCount =
    services.filter(
      (service) =>
        !service.is_active
    ).length

  const featuredCount =
    services.filter(
      (service) =>
        service.is_featured
    ).length

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h1>Services</h1>
          <p>
            Manage services, hourly pricing, images,
            categories, and discovery settings.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <button
            className="dashboard-refresh"
            onClick={() =>
              void loadServices()
            }
            disabled={loading}
          >
            <RefreshCw
              size={15}
              style={{
                marginRight: 7,
                verticalAlign: -2,
              }}
            />
            {loading
              ? 'Loading...'
              : 'Refresh'}
          </button>

          <button
            className="dashboard-refresh"
            onClick={
              openCreateForm
            }
            style={{
              display:
                'inline-flex',
              alignItems:
                'center',
              background:
                '#062F52',
              color:
                '#FFFFFF',
            }}
          >
            <Plus
              size={16}
              style={{
                marginRight: 6,
              }}
            />
            Add service
          </button>
        </div>
      </div>

      {error && (
        <div
          className="error-banner"
          style={{
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(4, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          ['Total services', services.length],
          ['Active', activeCount],
          ['Inactive', inactiveCount],
          ['Featured', featuredCount],
        ].map(
          ([label, value]) => (
            <div
              className="panel"
              key={label as string}
            >
              <strong>
                {label as string}
              </strong>

              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  marginTop: 6,
                }}
              >
                {value as number}
              </div>
            </div>
          )
        )}
      </div>

      <div
        className="panel"
        style={{
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(260px, 1fr) 180px auto',
            gap: 12,
            alignItems:
              'end',
          }}
        >
          <label>
            <strong>
              Search
            </strong>

            <input
              type="search"
              value={search}
              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }
              placeholder="Service, category or ID"
              style={{
                width: '100%',
                marginTop: 6,
              }}
            />
          </label>

          <label>
            <strong>
              Status
            </strong>

            <select
              value={status}
              onChange={(
                event
              ) =>
                setStatus(
                  event.target
                    .value as
                    | 'all'
                    | 'active'
                    | 'inactive'
                )
              }
              style={{
                width: '100%',
                marginTop: 6,
              }}
            >
              <option value="all">
                All
              </option>
              <option value="active">
                Active
              </option>
              <option value="inactive">
                Inactive
              </option>
            </select>
          </label>

          <button
            className="dashboard-refresh"
            onClick={() => {
              setSearch('')
              setStatus(
                'all'
              )
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>
              All services
            </h2>

            <p>
              {loading
                ? 'Loading services...'
                : `${filteredServices.length} of ${services.length} service${
                    services.length === 1
                      ? ''
                      : 's'
                  }`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="bookings-empty">
            <strong>
              Loading services...
            </strong>

            <span>
              Please wait.
            </span>
          </div>
        ) : filteredServices.length ===
          0 ? (
          <div className="bookings-empty">
            <strong>
              No services found
            </strong>

            <span>
              Try changing the
              search or status
              filter.
            </span>
          </div>
        ) : (
          <div className="bookings-table-wrap">
            <table className="bookings-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Service</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Price</th>
                  <th>Workers</th>
                  <th>Image</th>
                  <th>Featured</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredServices.map(
                  (service) => (
                    <tr
                      key={
                        service.id
                      }
                    >
                      <td>
                        <strong>
                          {
                            service.display_order
                          }
                        </strong>
                      </td>

                      <td>
                        <strong>
                          {
                            service.name
                          }
                        </strong>
                      </td>

                      <td>
                        {service.category_name ||
                          'General'}
                      </td>

                      <td>
                        <span
                          className={
                            service.is_active
                              ? 'booking-status booking-status-paid'
                              : 'booking-status booking-status-cancelled'
                          }
                        >
                          {service.is_active
                            ? 'Active'
                            : 'Inactive'}
                        </span>
                      </td>

                      <td>
                        {service.hourly_price ===
                        null
                          ? 'Not set'
                          : `${service.currency} ${service.hourly_price}/hr`}
                      </td>

                      <td>
                        <strong>
                          {
                            service.worker_count
                          }
                        </strong>
                      </td>

                      <td>
                        {service.image_url ? (
                          <img
                            src={
                              service.image_url
                            }
                            alt={
                              service.name
                            }
                            style={{
                              width:
                                52,
                              height:
                                52,
                              borderRadius:
                                12,
                              objectFit:
                                'cover',
                              border:
                                '1px solid #E3EBEF',
                              display:
                                'block',
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              display:
                                'inline-flex',
                              width:
                                52,
                              height:
                                52,
                              borderRadius:
                                12,
                              background:
                                '#E8F8F8',
                              color:
                                '#007E80',
                              alignItems:
                                'center',
                              justifyContent:
                                'center',
                            }}
                          >
                            <ImageIcon
                              size={
                                18
                              }
                            />
                          </span>
                        )}
                      </td>

                      <td>
                        {service.is_featured ? (
                          <Star
                            size={
                              18
                            }
                            fill="currentColor"
                            color="#FF9B32"
                          />
                        ) : (
                          <span
                            style={{
                              color:
                                '#A8B6BE',
                            }}
                          >
                            —
                          </span>
                        )}
                      </td>

                      <td>
                        <div
                          style={{
                            display:
                              'flex',
                            gap: 8,
                          }}
                        >
                          <button
                            className="dashboard-refresh"
                            type="button"
                            onClick={() =>
                              openEditForm(
                                service
                              )
                            }
                            style={{
                              display:
                                'inline-flex',
                              alignItems:
                                'center',
                            }}
                          >
                            <Edit3
                              size={
                                14
                              }
                              style={{
                                marginRight:
                                  6,
                              }}
                            />
                            Edit
                          </button>

                          <button
                            className="dashboard-refresh"
                            type="button"
                            disabled={
                              processingId ===
                              service.id
                            }
                            onClick={() =>
                              void setServiceActive(
                                service
                              )
                            }
                          >
                            {processingId ===
                            service.id
                              ? 'Saving...'
                              : service.is_active
                                ? 'Deactivate'
                                : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="service-form-title"
          style={{
            position: 'fixed',
            inset: 0,
            background:
              'rgba(7, 28, 43, 0.42)',
            display: 'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            padding: 20,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width:
                'min(900px, 100%)',
              maxHeight:
                '92vh',
              overflowY:
                'auto',
              background:
                '#FFFFFF',
              borderRadius:
                22,
              boxShadow:
                '0 24px 70px rgba(6, 47, 82, 0.20)',
              padding: 24,
            }}
          >
            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'flex-start',
                gap: 20,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize:
                      11,
                    fontWeight:
                      900,
                    letterSpacing:
                      1,
                    color:
                      '#007E80',
                  }}
                >
                  SERVICE CATALOG
                </div>

                <h2
                  id="service-form-title"
                  style={{
                    margin:
                      '5px 0 4px',
                    color:
                      '#062F52',
                  }}
                >
                  {formMode ===
                  'create'
                    ? 'Add a new service'
                    : `Edit ${editingService?.name || 'service'}`}
                </h2>

                <p
                  style={{
                    margin: 0,
                    color:
                      '#71818C',
                  }}
                >
                  {formMode ===
                  'create'
                    ? 'Create the service, Hourly pricing, image, and discovery settings.'
                    : 'Update service details, image, category, pricing, order, or featured status.'}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeForm
                }
                disabled={
                  saving
                }
                aria-label="Close"
                style={{
                  width:
                    40,
                  height:
                    40,
                  borderRadius:
                    12,
                  border:
                    '1px solid #E3EBEF',
                  background:
                    '#F7FAFB',
                  cursor:
                    'pointer',
                }}
              >
                <X
                  size={
                    18
                  }
                  color="#456174"
                />
              </button>
            </div>

            {formError && (
              <div
                className="error-banner"
                style={{
                  marginTop:
                    18,
                }}
              >
                {formError}
              </div>
            )}

            <div
              style={{
                display:
                  'grid',
                gridTemplateColumns:
                  'minmax(0, 1.25fr) minmax(260px, .75fr)',
                gap: 20,
                marginTop:
                  22,
              }}
            >
              <div>
                <label
                  style={{
                    display:
                      'block',
                    marginBottom:
                      14,
                  }}
                >
                  <strong>
                    Service name
                  </strong>

                  <input
                    value={
                      serviceName
                    }
                    onChange={(
                      event
                    ) =>
                      setServiceName(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="e.g. Waiter"
                    style={{
                      width:
                        '100%',
                      marginTop:
                        6,
                    }}
                    disabled={
                      saving
                    }
                  />
                </label>

                <label
                  style={{
                    display:
                      'block',
                    marginBottom:
                      14,
                  }}
                >
                  <strong>
                    Description
                  </strong>

                  <textarea
                    value={
                      description
                    }
                    onChange={(
                      event
                    ) =>
                      setDescription(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="Describe the service."
                    rows={4}
                    style={{
                      width:
                        '100%',
                      marginTop:
                        6,
                      resize:
                        'vertical',
                    }}
                    disabled={
                      saving
                    }
                  />
                </label>

                <div
                  style={{
                    display:
                      'grid',
                    gridTemplateColumns:
                      '1.4fr .8fr',
                    gap: 12,
                  }}
                >
                  <label>
                    <strong>
                      Hourly price
                    </strong>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        hourlyPrice
                      }
                      onChange={(
                        event
                      ) =>
                        setHourlyPrice(
                          event
                            .target
                            .value
                        )
                      }
                      placeholder="100"
                      style={{
                        width:
                          '100%',
                        marginTop:
                          6,
                      }}
                      disabled={
                        saving
                      }
                    />
                  </label>

                  <label>
                    <strong>
                      Currency
                    </strong>

                    <input
                      value={
                        currency
                      }
                      maxLength={
                        3
                      }
                      onChange={(
                        event
                      ) =>
                        setCurrency(
                          event
                            .target
                            .value
                            .toUpperCase()
                        )
                      }
                      placeholder="INR"
                      style={{
                        width:
                          '100%',
                        marginTop:
                          6,
                      }}
                      disabled={
                        saving
                      }
                    />
                  </label>
                </div>

                <div
                  style={{
                    display:
                      'grid',
                    gridTemplateColumns:
                      '1fr 1fr',
                    gap: 12,
                    marginTop:
                      14,
                  }}
                >
                  <label>
                    <strong>
                      Category
                    </strong>

                    <select
                      value={
                        categoryId
                      }
                      onChange={(
                        event
                      ) =>
                        setCategoryId(
                          event
                            .target
                            .value
                        )
                      }
                      style={{
                        width:
                          '100%',
                        marginTop:
                          6,
                      }}
                      disabled={
                        saving
                      }
                    >
                      <option value="">
                        General
                      </option>

                      {categories
                        .filter(
                          (
                            category
                          ) =>
                            category.is_active
                        )
                        .map(
                          (
                            category
                          ) => (
                            <option
                              key={
                                category.id
                              }
                              value={
                                category.id
                              }
                            >
                              {
                                category.name
                              }
                            </option>
                          )
                        )}
                    </select>
                  </label>

                  <label>
                    <strong>
                      Display order
                    </strong>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={
                        displayOrder
                      }
                      onChange={(
                        event
                      ) =>
                        setDisplayOrder(
                          event
                            .target
                            .value
                        )
                      }
                      style={{
                        width:
                          '100%',
                        marginTop:
                          6,
                      }}
                      disabled={
                        saving
                      }
                    />
                  </label>
                </div>

                <div
                  style={{
                    marginTop:
                      14,
                    padding:
                      13,
                    borderRadius:
                      14,
                    border:
                      '1px solid #E3EBEF',
                    background:
                      '#F7FAFB',
                  }}
                >
                  <strong>
                    Add category
                  </strong>

                  <div
                    style={{
                      display:
                        'flex',
                      gap: 8,
                      marginTop:
                        8,
                    }}
                  >
                    <input
                      value={
                        newCategoryName
                      }
                      onChange={(
                        event
                      ) =>
                        setNewCategoryName(
                          event
                            .target
                            .value
                        )
                      }
                      placeholder="e.g. Hospitality"
                      style={{
                        flex: 1,
                      }}
                      disabled={
                        addingCategory ||
                        saving
                      }
                    />

                    <button
                      type="button"
                      className="dashboard-refresh"
                      onClick={() =>
                        void addCategory()
                      }
                      disabled={
                        addingCategory ||
                        saving
                      }
                    >
                      {addingCategory
                        ? 'Adding...'
                        : 'Add'}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display:
                      'flex',
                    gap: 18,
                    flexWrap:
                      'wrap',
                    marginTop:
                      18,
                  }}
                >
                  <label
                    style={{
                      display:
                        'flex',
                      alignItems:
                        'center',
                      gap: 8,
                      cursor:
                        'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        isFeatured
                      }
                      onChange={(
                        event
                      ) =>
                        setIsFeatured(
                          event
                            .target
                            .checked
                        )
                      }
                      disabled={
                        saving
                      }
                    />
                    <span>
                      Featured service
                    </span>
                  </label>

                  <label
                    style={{
                      display:
                        'flex',
                      alignItems:
                        'center',
                      gap: 8,
                      cursor:
                        'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        isActive
                      }
                      onChange={(
                        event
                      ) =>
                        setIsActive(
                          event
                            .target
                            .checked
                        )
                      }
                      disabled={
                        saving
                      }
                    />
                    <span>
                      Active / published
                    </span>
                  </label>
                </div>

                {formMode ===
                  'edit' && (
                  <>
                    <button
                      type="button"
                      className="dashboard-refresh"
                      onClick={() => {
                        if (
                          editingService
                        ) {
                          setPriceHistoryOpen(
                            (current) =>
                              !current
                          )

                          if (
                            !priceHistoryOpen
                          ) {
                            void loadPriceHistory(
                              editingService
                            )
                          }
                        }
                      }}
                      style={{
                        marginTop:
                          16,
                        display:
                          'inline-flex',
                        alignItems:
                          'center',
                      }}
                    >
                      {priceHistoryOpen
                        ? 'Hide price history'
                        : 'View price history'}
                    </button>

                    {priceHistoryOpen && (
                      <div
                        style={{
                          marginTop:
                            12,
                          border:
                            '1px solid #E3EBEF',
                          borderRadius:
                            14,
                          overflow:
                            'hidden',
                        }}
                      >
                        {priceHistoryLoading ? (
                          <div
                            style={{
                              padding:
                                14,
                              color:
                                '#71818C',
                            }}
                          >
                            Loading price history...
                          </div>
                        ) : priceHistory.length ===
                          0 ? (
                          <div
                            style={{
                              padding:
                                14,
                              color:
                                '#71818C',
                            }}
                          >
                            No price history found.
                          </div>
                        ) : (
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
                                    'Price',
                                    'From',
                                    'To',
                                    'Status',
                                  ].map(
                                    (
                                      heading
                                    ) => (
                                      <th
                                        key={
                                          heading
                                        }
                                        style={{
                                          padding:
                                            '9px 10px',
                                          textAlign:
                                            'left',
                                          fontSize:
                                            11,
                                          color:
                                            '#71818C',
                                          borderBottom:
                                            '1px solid #E3EBEF',
                                        }}
                                      >
                                        {
                                          heading
                                        }
                                      </th>
                                    )
                                  )}
                                </tr>
                              </thead>

                              <tbody>
                                {priceHistory.map(
                                  (
                                    row
                                  ) => (
                                    <tr
                                      key={
                                        row.id
                                      }
                                    >
                                      <td
                                        style={{
                                          padding:
                                            '9px 10px',
                                          fontWeight:
                                            800,
                                          color:
                                            '#062F52',
                                        }}
                                      >
                                        {
                                          row.currency
                                        }{' '}
                                        {
                                          row.price
                                        }
                                        /hr
                                      </td>

                                      <td
                                        style={{
                                          padding:
                                            '9px 10px',
                                          fontSize:
                                            11,
                                          color:
                                            '#456174',
                                        }}
                                      >
                                        {formatDate(
                                          row.effective_from
                                        )}
                                      </td>

                                      <td
                                        style={{
                                          padding:
                                            '9px 10px',
                                          fontSize:
                                            11,
                                          color:
                                            '#456174',
                                        }}
                                      >
                                        {formatDate(
                                          row.effective_to
                                        )}
                                      </td>

                                      <td
                                        style={{
                                          padding:
                                            '9px 10px',
                                          fontSize:
                                            11,
                                          fontWeight:
                                            800,
                                          color:
                                            row.is_active
                                              ? '#007E80'
                                              : '#71818C',
                                        }}
                                      >
                                        {row.is_active
                                          ? 'Current'
                                          : 'Historical'}
                                      </td>
                                    </tr>
                                  )
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <strong>
                  Service image
                </strong>

                <div
                  style={{
                    marginTop:
                      7,
                    minHeight:
                      320,
                    border:
                      '1px dashed #B8D2D9',
                    borderRadius:
                      18,
                    background:
                      '#F7FBFC',
                    display:
                      'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'center',
                    overflow:
                      'hidden',
                    position:
                      'relative',
                  }}
                >
                  {imagePreview ? (
                    <>
                      <img
                        src={
                          imagePreview
                        }
                        alt="Service preview"
                        style={{
                          width:
                            '100%',
                          height:
                            320,
                          objectFit:
                            'cover',
                        }}
                      />

                      <button
                        type="button"
                        onClick={() =>
                          handleImageChange(
                            null
                          )
                        }
                        disabled={
                          saving
                        }
                        style={{
                          position:
                            'absolute',
                          top: 10,
                          right: 10,
                          width:
                            36,
                          height:
                            36,
                          borderRadius:
                            12,
                          border:
                            '1px solid rgba(255,255,255,.8)',
                          background:
                            'rgba(6,47,82,.86)',
                          color:
                            '#FFF',
                          cursor:
                            'pointer',
                        }}
                        aria-label="Remove image"
                      >
                        <X
                          size={
                            17
                          }
                        />
                      </button>
                    </>
                  ) : (
                    <label
                      style={{
                        width:
                          '100%',
                        minHeight:
                          320,
                        padding:
                          24,
                        display:
                          'flex',
                        flexDirection:
                          'column',
                        alignItems:
                          'center',
                        justifyContent:
                          'center',
                        textAlign:
                          'center',
                        cursor:
                          saving
                            ? 'default'
                            : 'pointer',
                      }}
                    >
                      <Upload
                        size={
                          30
                        }
                        color="#007E80"
                      />

                      <strong
                        style={{
                          marginTop:
                            12,
                          color:
                            '#062F52',
                        }}
                      >
                        {formMode ===
                        'edit'
                          ? 'Replace service image'
                          : 'Upload service image'}
                      </strong>

                      <span
                        style={{
                          marginTop:
                            6,
                          fontSize:
                            13,
                          color:
                            '#71818C',
                        }}
                      >
                        JPG, PNG, or WebP
                        · max 5 MB
                      </span>

                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(
                          event
                        ) =>
                          handleImageChange(
                            event
                              .target
                              .files?.[0] ||
                              null
                          )
                        }
                        disabled={
                          saving
                        }
                        style={{
                          display:
                            'none',
                        }}
                      />
                    </label>
                  )}
                </div>

                <div
                  style={{
                    marginTop:
                      10,
                    padding:
                      12,
                    borderRadius:
                      14,
                    background:
                      '#EEF6F7',
                    color:
                      '#4B6877',
                    fontSize:
                      11,
                    lineHeight:
                      17,
                  }}
                >
                  Images are stored in
                  Supabase Storage. The
                  Customer App can use the
                  saved image URL without
                  bundling the image into the
                  mobile build.
                </div>
              </div>
            </div>

            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'flex-end',
                gap: 10,
                marginTop:
                  24,
              }}
            >
              <button
                type="button"
                className="dashboard-refresh"
                onClick={
                  closeForm
                }
                disabled={
                  saving
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="dashboard-refresh"
                onClick={() =>
                  void saveService()
                }
                disabled={
                  saving
                }
                style={{
                  minWidth:
                    160,
                  background:
                    '#062F52',
                  color:
                    '#FFFFFF',
                }}
              >
                {saving
                  ? 'Saving...'
                  : formMode ===
                    'create'
                    ? 'Create service'
                    : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
