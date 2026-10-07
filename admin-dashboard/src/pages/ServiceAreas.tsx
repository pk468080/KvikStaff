import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Edit3,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'

import { adminAction } from '../lib/adminAction'
import { loadGoogleMaps } from '../lib/googleMaps'
import { supabase } from '../lib/supabase'

declare const google: any

type Service = {
  id: string
  name: string
  is_active: boolean
}

type Area = {
  id: string
  name: string
  city: string
  state: string
  center_latitude: number
  center_longitude: number
  radius_km: number
  is_active: boolean
  service_ids: string[]
  service_names: string[]
  service_count: number
  created_at: string
  updated_at: string
  is_legacy: boolean
}

type Form = {
  id: string
  name: string
  city: string
  state: string
  center_latitude: number
  center_longitude: number
  radius_km: number
  is_active: boolean
  service_ids: string[]
}

const DEFAULT_LOCATION = {
  lat: 28.6139,
  lng: 77.209,
}

const emptyForm: Form = {
  id: '',
  name: '',
  city: 'Delhi',
  state: 'Delhi',
  center_latitude: DEFAULT_LOCATION.lat,
  center_longitude: DEFAULT_LOCATION.lng,
  radius_km: 3,
  is_active: true,
  service_ids: [],
}

function normalizeServiceIds(ids: string[]) {
  return Array.from(new Set(ids)).sort()
}

export default function ServiceAreas() {
  const [services, setServices] = useState<Service[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [form, setForm] = useState<Form>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [serviceSearch, setServiceSearch] = useState('')
  const [areaSearch, setAreaSearch] = useState('')
  const [statusFilter, setStatusFilter] =
    useState<'all' | 'active' | 'inactive'>('all')
  const [error, setError] = useState<string | null>(null)
  const [mapLoading, setMapLoading] = useState(true)
  const [mapError, setMapError] = useState<string | null>(null)

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const circleRef = useRef<any>(null)
  const autocompleteRef = useRef<any>(null)
  const mapInitializedRef = useRef(false)

  const activeServices = useMemo(
    () => services.filter((service) => service.is_active),
    [services],
  )

  const selectedInactiveServices = useMemo(
    () =>
      form.service_ids
        .map((id) => services.find((service) => service.id === id))
        .filter(
          (service): service is Service =>
            Boolean(service && !service.is_active),
        ),
    [form.service_ids, services],
  )

  const filteredServicesForSelection = useMemo(() => {
    const query = serviceSearch.trim().toLowerCase()

    return services
      .filter(
        (service) =>
          service.is_active || form.service_ids.includes(service.id),
      )
      .filter((service) =>
        query ? service.name.toLowerCase().includes(query) : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [services, serviceSearch, form.service_ids])

  const filteredAreas = useMemo(() => {
    const query = areaSearch.trim().toLowerCase()

    return areas.filter((area) => {
      if (statusFilter === 'active' && !area.is_active) return false
      if (statusFilter === 'inactive' && area.is_active) return false

      if (!query) return true

      const serviceText = area.service_names.join(' ')
      const haystack = [
        area.name,
        area.city,
        area.state,
        serviceText,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [areas, areaSearch, statusFilter])

  const activeAreaCount = areas.filter((area) => area.is_active).length

  const inactiveAreaCount = areas.filter(
    (area) => !area.is_active,
  ).length

  const serviceAssignmentCount = areas.reduce(
    (sum, area) => sum + area.service_count,
    0,
  )

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const [servicesResult, areasResult] = await Promise.all([
        supabase
          .from('services')
          .select('id,name,is_active')
          .order('name', { ascending: true }),
        adminAction<Area[]>('admin_list_service_areas_v3'),
      ])

      if (servicesResult.error) throw servicesResult.error
      if (areasResult.error) throw areasResult.error

      setServices(
        (servicesResult.data || []) as Service[],
      )

      setAreas(
        (areasResult.data || []) as Area[],
      )
    } catch (err) {
      console.error(
        '[TempStaff] Failed to load service areas:',
        err,
      )

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load service areas.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function initializeMap() {
      if (
        !mapContainerRef.current ||
        !searchInputRef.current ||
        mapInitializedRef.current
      ) {
        return
      }

      try {
        setMapLoading(true)
        setMapError(null)

        await loadGoogleMaps()

        if (
          cancelled ||
          !mapContainerRef.current ||
          !searchInputRef.current ||
          mapInitializedRef.current
        ) {
          return
        }

        mapInitializedRef.current = true

        const initialCenter = {
          lat: emptyForm.center_latitude,
          lng: emptyForm.center_longitude,
        }

        const map = new google.maps.Map(
          mapContainerRef.current,
          {
            center: initialCenter,
            zoom: 11,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
          },
        )

        mapRef.current = map

        const marker = new google.maps.Marker({
          position: initialCenter,
          map,
          draggable: true,
          title: 'TempStaff service area center',
        })

        markerRef.current = marker

        const circle = new google.maps.Circle({
          map,
          center: initialCenter,
          radius: emptyForm.radius_km * 1000,
          editable: true,
          draggable: false,
          fillOpacity: 0.18,
          strokeWeight: 2,
        })

        circleRef.current = circle

        const autocomplete =
          new google.maps.places.Autocomplete(
            searchInputRef.current,
            {
              fields: [
                'geometry',
                'formatted_address',
                'name',
                'address_components',
              ],
              types: ['geocode'],
            },
          )

        autocompleteRef.current = autocomplete

        autocomplete.addListener(
          'place_changed',
          () => {
            const place =
              autocomplete.getPlace()

            const location =
              place.geometry?.location

            if (!location) {
              setMapError(
                'The selected place does not have a map location.',
              )
              return
            }

            const latitude = location.lat()
            const longitude = location.lng()
            const components =
              place.address_components || []

            let city = ''
            let state = ''

            for (const component of components) {
              const types = component.types || []

              if (
                types.includes('locality')
              ) {
                city =
                  component.long_name
              }

              if (
                types.includes(
                  'administrative_area_level_1',
                )
              ) {
                state =
                  component.long_name
              }
            }

            marker.setPosition(location)
            circle.setCenter(location)
            map.panTo(location)
            map.setZoom(13)

            updateForm({
              name:
                place.name ||
                searchInputRef.current?.value ||
                form.name,

              city:
                city || form.city,

              state:
                state || form.state,

              center_latitude:
                latitude,

              center_longitude:
                longitude,
            })
          },
        )

        marker.addListener(
          'dragend',
          () => {
            const position =
              marker.getPosition()

            if (!position) return

            updateForm({
              center_latitude:
                position.lat(),

              center_longitude:
                position.lng(),
            })
          },
        )

        circle.addListener(
          'radius_changed',
          () => {
            const radiusMeters =
              circle.getRadius()

            if (
              typeof radiusMeters !== 'number'
            ) {
              return
            }

            const radiusKm = Number(
              (
                radiusMeters / 1000
              ).toFixed(2),
            )

            updateForm({
              radius_km: radiusKm,
            })
          },
        )

        setMapLoading(false)
      } catch (err) {
        console.error(
          '[TempStaff] Failed to initialize Google Maps:',
          err,
        )

        if (!cancelled) {
          setMapError(
            err instanceof Error
              ? err.message
              : 'Failed to load Google Maps.',
          )

          setMapLoading(false)
        }
      }
    }

    void initializeMap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (
      !mapInitializedRef.current ||
      !markerRef.current ||
      !circleRef.current ||
      !mapRef.current
    ) {
      return
    }

    const position = {
      lat: Number(
        form.center_latitude,
      ),
      lng: Number(
        form.center_longitude,
      ),
    }

    if (
      !Number.isFinite(position.lat) ||
      !Number.isFinite(position.lng)
    ) {
      return
    }

    markerRef.current.setPosition(
      position,
    )

    circleRef.current.setCenter(
      position,
    )

    circleRef.current.setRadius(
      Number(form.radius_km) * 1000,
    )

    mapRef.current.panTo(position)
  }, [
    form.center_latitude,
    form.center_longitude,
    form.radius_km,
  ])

  function updateForm(
    changes: Partial<Form>,
  ) {
    setForm((current) => ({
      ...current,
      ...changes,
    }))
  }

  function openCreate() {
    setForm({
      ...emptyForm,
      service_ids: [],
    })

    setServiceSearch('')
    setError(null)
    setMapError(null)
    setFormOpen(true)

    window.setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.value = ''
      }
    }, 0)
  }

  function closeForm() {
    if (saving) return

    setFormOpen(false)
    setServiceSearch('')
    setError(null)
    setMapError(null)
  }

  function editArea(area: Area) {
    setForm({
      id: area.id,
      name: area.name,
      city: area.city || '',
      state: area.state || '',
      center_latitude:
        Number(area.center_latitude),
      center_longitude:
        Number(area.center_longitude),
      radius_km:
        Number(area.radius_km),
      is_active:
        area.is_active,
      service_ids:
        normalizeServiceIds(
          area.service_ids || [],
        ),
    })

    setServiceSearch('')
    setError(null)
    setMapError(null)
    setFormOpen(true)

    window.setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.value =
          area.name
      }

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }, 0)
  }

  function toggleService(
    serviceId: string,
  ) {
    setForm((current) => {
      const exists =
        current.service_ids.includes(
          serviceId,
        )

      return {
        ...current,

        service_ids: exists
          ? current.service_ids.filter(
              (id) =>
                id !== serviceId,
            )
          : [
              ...current.service_ids,
              serviceId,
            ],
      }
    })
  }

  function selectAllActiveServices() {
    setForm((current) => ({
      ...current,

      service_ids:
        normalizeServiceIds(
          activeServices.map(
            (service) => service.id,
          ),
        ),
    }))
  }

  function clearServices() {
    setForm((current) => ({
      ...current,
      service_ids: [],
    }))
  }

  async function saveArea() {
    setError(null)

    const name =
      form.name.trim()

    const city =
      form.city.trim()

    const state =
      form.state.trim()

    const latitude =
      Number(form.center_latitude)

    const longitude =
      Number(form.center_longitude)

    const radius =
      Number(form.radius_km)

    const serviceIds =
      normalizeServiceIds(
        form.service_ids,
      )

    if (!name) {
      setError(
        'Please enter an area name.',
      )
      return
    }

    if (!city) {
      setError(
        'Please enter a city.',
      )
      return
    }

    if (!state) {
      setError(
        'Please enter a state.',
      )
      return
    }

    if (serviceIds.length === 0) {
      setError(
        'Select at least one service for this area.',
      )
      return
    }

    if (
      selectedInactiveServices.length >
      0
    ) {
      setError(
        `Remove inactive service${
          selectedInactiveServices.length ===
          1
            ? ''
            : 's'
        }: ${selectedInactiveServices
          .map(
            (service) =>
              service.name,
          )
          .join(', ')}.`,
      )

      return
    }

    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      setError(
        'Latitude must be between -90 and 90.',
      )
      return
    }

    if (
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      setError(
        'Longitude must be between -180 and 180.',
      )
      return
    }

    if (
      !Number.isFinite(radius) ||
      radius <= 0 ||
      radius > 10
    ) {
      setError(
        'Radius must be greater than 0 and no more than 10 km.',
      )
      return
    }

    setSaving(true)

    try {
      const {
        error: actionError,
      } = await adminAction(
        'admin_upsert_service_area_v3',
        {
          p_id:
            form.id || null,

          p_name:
            name,

          p_city:
            city,

          p_state:
            state,

          p_center_latitude:
            latitude,

          p_center_longitude:
            longitude,

          p_radius_km:
            radius,

          p_is_active:
            form.is_active,

          p_service_ids:
            serviceIds,
        },
      )

      if (actionError) {
        throw actionError
      }

      closeForm()

      await loadData()
    } catch (err) {
      console.error(
        '[TempStaff] Failed to save service area:',
        err,
      )

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save service area.',
      )
    } finally {
      setSaving(false)
    }
  }

  function resetFilters() {
    setAreaSearch('')
    setStatusFilter('all')
  }

  const formCoordinates =
    `${Number(form.center_latitude).toFixed(6)}, ${Number(
      form.center_longitude,
    ).toFixed(6)}`

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: '#EAF7F7',
                color: '#007E80',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MapPin size={19} />
            </div>

            <div>
              <h1>
                Service Areas
              </h1>

              <p>
                Define one geographic area
                and publish multiple
                services inside it.
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
          }}
        >
          <button
            className="dashboard-refresh"
            onClick={() =>
              void loadData()
            }
            disabled={loading}
          >
            <RefreshCw
              size={15}
              style={{
                marginRight: 7,
                verticalAlign:
                  'middle',
              }}
            />

            {loading
              ? 'Loading...'
              : 'Refresh'}
          </button>

          <button
            className="dashboard-refresh"
            onClick={openCreate}
            style={{
              background: '#062F52',
              color: '#FFFFFF',
            }}
          >
            <Plus
              size={15}
              style={{
                marginRight: 7,
                verticalAlign:
                  'middle',
              }}
            />

            New area
          </button>
        </div>
      </div>

      {error && !formOpen && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(3, minmax(0, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div className="panel">
          <span
            style={{
              color: '#71818C',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            TOTAL AREAS
          </span>

          <div
            style={{
              fontSize: 30,
              fontWeight: 900,
              marginTop: 6,
              color: '#062F52',
            }}
          >
            {areas.length}
          </div>
        </div>

        <div className="panel">
          <span
            style={{
              color: '#71818C',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            LIVE AREAS
          </span>

          <div
            style={{
              fontSize: 30,
              fontWeight: 900,
              marginTop: 6,
              color: '#087F72',
            }}
          >
            {activeAreaCount}
          </div>

          <div
            style={{
              marginTop: 4,
              color: '#71818C',
              fontSize: 12,
            }}
          >
            {inactiveAreaCount}{' '}
            inactive
          </div>
        </div>

        <div className="panel">
          <span
            style={{
              color: '#71818C',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            SERVICE ASSIGNMENTS
          </span>

          <div
            style={{
              fontSize: 30,
              fontWeight: 900,
              marginTop: 6,
              color: '#062F52',
            }}
          >
            {serviceAssignmentCount}
          </div>

          <div
            style={{
              marginTop: 4,
              color: '#71818C',
              fontSize: 12,
            }}
          >
            Across all geographic
            areas
          </div>
        </div>
      </div>

      {formOpen && (
        <div
          className="panel"
          style={{
            marginBottom: 22,
          }}
        >
          <div className="panel-header">
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: 1,
                  color: '#007E80',
                }}
              >
                {form.id
                  ? 'EDIT AREA'
                  : 'NEW AREA'}
              </div>

              <h2
                style={{
                  margin:
                    '4px 0 3px',
                }}
              >
                {form.id
                  ? `Edit ${
                      form.name ||
                      'service area'
                    }`
                  : 'Create a service area'}
              </h2>

              <p>
                Set the map footprint
                once, then select every
                service available inside it.
              </p>
            </div>

            <button
              type="button"
              className="dashboard-refresh"
              onClick={
                closeForm
              }
              disabled={saving}
            >
              <X
                size={16}
                style={{
                  verticalAlign:
                    'middle',
                }}
              />
            </button>
          </div>

          <div
            style={{
              padding: 20,
            }}
          >
            {error && (
              <div
                className="error-banner"
                style={{
                  marginBottom: 18,
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'minmax(0, 1.05fr) minmax(0, .95fr)',
                gap: 20,
                alignItems:
                  'start',
              }}
            >
              <div>
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
                      Area name
                    </strong>

                    <input
                      value={
                        form.name
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm({
                          name:
                            event
                              .target
                              .value,
                        })
                      }
                      placeholder="e.g. Dwarka Sector 21"
                      style={{
                        width: '100%',
                        marginTop: 6,
                      }}
                      disabled={
                        saving
                      }
                    />
                  </label>

                  <label>
                    <strong>
                      Radius (km)
                    </strong>

                    <input
                      type="number"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={
                        form.radius_km
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm({
                          radius_km:
                            Number(
                              event
                                .target
                                .value,
                            ),
                        })
                      }
                      style={{
                        width: '100%',
                        marginTop: 6,
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
                    marginTop: 12,
                  }}
                >
                  <label>
                    <strong>
                      City
                    </strong>

                    <input
                      value={
                        form.city
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm({
                          city:
                            event
                              .target
                              .value,
                        })
                      }
                      placeholder="Delhi"
                      style={{
                        width: '100%',
                        marginTop: 6,
                      }}
                      disabled={
                        saving
                      }
                    />
                  </label>

                  <label>
                    <strong>
                      State
                    </strong>

                    <input
                      value={
                        form.state
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm({
                          state:
                            event
                              .target
                              .value,
                        })
                      }
                      placeholder="Delhi"
                      style={{
                        width: '100%',
                        marginTop: 6,
                      }}
                      disabled={
                        saving
                      }
                    />
                  </label>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    border:
                      '1px solid #E3EBEF',
                    borderRadius: 18,
                    background:
                      '#FBFDFE',
                    overflow:
                      'hidden',
                  }}
                >
                  <div
                    style={{
                      padding:
                        '14px 16px',
                      borderBottom:
                        '1px solid #E3EBEF',
                      display:
                        'flex',
                      alignItems:
                        'center',
                      justifyContent:
                        'space-between',
                      gap: 12,
                    }}
                  >
                    <div>
                      <strong>
                        Services available in
                        this area
                      </strong>

                      <div
                        style={{
                          marginTop:
                            3,
                          color:
                            '#71818C',
                          fontSize:
                            12,
                        }}
                      >
                        {
                          form
                            .service_ids
                            .length
                        }{' '}
                        selected ·{' '}
                        {
                          activeServices
                            .length
                        }{' '}
                        active services
                      </div>
                    </div>

                    <div
                      style={{
                        display:
                          'flex',
                        gap: 8,
                        flexWrap:
                          'wrap',
                        justifyContent:
                          'flex-end',
                      }}
                    >
                      <button
                        type="button"
                        className="dashboard-refresh"
                        onClick={
                          selectAllActiveServices
                        }
                        disabled={
                          saving ||
                          activeServices.length ===
                            0
                        }
                      >
                        Select all
                      </button>

                      <button
                        type="button"
                        className="dashboard-refresh"
                        onClick={
                          clearServices
                        }
                        disabled={
                          saving ||
                          form
                            .service_ids
                            .length ===
                            0
                        }
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        position:
                          'relative',
                        marginBottom:
                          10,
                      }}
                    >
                      <Search
                        size={16}
                        style={{
                          position:
                            'absolute',
                          left: 11,
                          top: 12,
                          color:
                            '#8194A0',
                        }}
                      />

                      <input
                        value={
                          serviceSearch
                        }
                        onChange={(
                          event,
                        ) =>
                          setServiceSearch(
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="Search services..."
                        style={{
                          width:
                            '100%',
                          paddingLeft:
                            36,
                        }}
                        disabled={
                          saving
                        }
                      />
                    </div>

                    {filteredServicesForSelection.length ===
                    0 ? (
                      <div
                        style={{
                          padding:
                            18,
                          textAlign:
                            'center',
                          color:
                            '#71818C',
                          fontSize:
                            13,
                        }}
                      >
                        No matching
                        services.
                      </div>
                    ) : (
                      <div
                        style={{
                          display:
                            'grid',
                          gridTemplateColumns:
                            'repeat(2, minmax(0, 1fr))',
                          gap: 8,
                          maxHeight:
                            290,
                          overflowY:
                            'auto',
                        }}
                      >
                        {filteredServicesForSelection.map(
                          (
                            service,
                          ) => {
                            const selected =
                              form.service_ids.includes(
                                service.id,
                              )

                            return (
                              <button
                                key={
                                  service.id
                                }
                                type="button"
                                onClick={() =>
                                  toggleService(
                                    service.id,
                                  )
                                }
                                disabled={
                                  saving
                                }
                                style={{
                                  display:
                                    'flex',
                                  alignItems:
                                    'center',
                                  gap: 10,
                                  padding:
                                    '11px 12px',
                                  borderRadius:
                                    14,
                                  border:
                                    selected
                                      ? '1px solid #00A7A7'
                                      : '1px solid #E3EBEF',
                                  background:
                                    selected
                                      ? '#EFFCFA'
                                      : '#FFFFFF',
                                  cursor:
                                    saving
                                      ? 'default'
                                      : 'pointer',
                                  textAlign:
                                    'left',
                                }}
                              >
                                <span
                                  style={{
                                    width:
                                      22,
                                    height:
                                      22,
                                    borderRadius:
                                      7,
                                    border:
                                      selected
                                        ? '1px solid #00A7A7'
                                        : '1px solid #CBD5E1',
                                    background:
                                      selected
                                        ? '#00A7A7'
                                        : '#FFFFFF',
                                    color:
                                      '#FFFFFF',
                                    display:
                                      'inline-flex',
                                    alignItems:
                                      'center',
                                    justifyContent:
                                      'center',
                                    flex:
                                      '0 0 auto',
                                  }}
                                >
                                  {selected && (
                                    <Check
                                      size={
                                        14
                                      }
                                      strokeWidth={
                                        3
                                      }
                                    />
                                  )}
                                </span>

                                <span
                                  style={{
                                    minWidth:
                                      0,
                                    flex: 1,
                                  }}
                                >
                                  <strong
                                    style={{
                                      display:
                                        'block',
                                      color:
                                        '#062F52',
                                      fontSize:
                                        13,
                                    }}
                                  >
                                    {
                                      service.name
                                    }
                                  </strong>

                                  {!service.is_active && (
                                    <span
                                      style={{
                                        color:
                                          '#B45309',
                                        fontSize:
                                          10,
                                        fontWeight:
                                          700,
                                      }}
                                    >
                                      Inactive —
                                      deselect before
                                      saving
                                    </span>
                                  )}
                                </span>
                              </button>
                            )
                          },
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <label
                  style={{
                    display:
                      'flex',
                    alignItems:
                      'center',
                    gap: 10,
                    marginTop:
                      16,
                    cursor:
                      saving
                        ? 'default'
                        : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      form.is_active
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm({
                        is_active:
                          event
                            .target
                            .checked,
                      })
                    }
                    disabled={
                      saving
                    }
                  />

                  <span>
                    <strong>
                      Area is live
                    </strong>

                    <span
                      style={{
                        display:
                          'block',
                        marginTop:
                          2,
                        color:
                          '#71818C',
                        fontSize:
                          12,
                      }}
                    >
                      Customers can
                      book selected
                      services inside
                      this area when
                      enabled.
                    </span>
                  </span>
                </label>
              </div>

              <div>
                <label
                  style={{
                    display:
                      'block',
                  }}
                >
                  <strong>
                    Search map location
                  </strong>

                  <input
                    ref={
                      searchInputRef
                    }
                    placeholder="Search sector, locality, city or address"
                    autoComplete="off"
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

                <div
                  style={{
                    position:
                      'relative',
                    marginTop:
                      12,
                    width:
                      '100%',
                    height:
                      430,
                    borderRadius:
                      18,
                    overflow:
                      'hidden',
                    border:
                      '1px solid #D9E2E7',
                    background:
                      '#F5F7FA',
                  }}
                >
                  <div
                    ref={
                      mapContainerRef
                    }
                    style={{
                      width:
                        '100%',
                      height:
                        '100%',
                    }}
                  />

                  {mapLoading && (
                    <div
                      style={{
                        position:
                          'absolute',
                        inset: 0,
                        display:
                          'flex',
                        alignItems:
                          'center',
                        justifyContent:
                          'center',
                        background:
                          'rgba(255,255,255,.88)',
                        fontWeight:
                          700,
                        color:
                          '#062F52',
                      }}
                    >
                      Loading Google
                      Maps...
                    </div>
                  )}

                  {mapError && (
                    <div
                      className="error-banner"
                      style={{
                        position:
                          'absolute',
                        left:
                          12,
                        right:
                          12,
                        bottom:
                          12,
                        margin:
                          0,
                        background:
                          '#FFFFFF',
                      }}
                    >
                      {mapError}
                    </div>
                  )}

                  <div
                    style={{
                      position:
                        'absolute',
                      top: 12,
                      left: 12,
                      padding:
                        '8px 10px',
                      borderRadius:
                        999,
                      background:
                        'rgba(6,47,82,.90)',
                      color:
                        '#FFFFFF',
                      fontSize:
                        11,
                      fontWeight:
                        800,
                    }}
                  >
                    Drag pin ·
                    resize circle
                  </div>
                </div>

                <div
                  style={{
                    display:
                      'grid',
                    gridTemplateColumns:
                      '1fr 1fr',
                    gap: 10,
                    marginTop:
                      10,
                  }}
                >
                  <div
                    style={{
                      padding:
                        12,
                      borderRadius:
                        14,
                      background:
                        '#F6FAFB',
                      border:
                        '1px solid #E3EBEF',
                    }}
                  >
                    <div
                      style={{
                        color:
                          '#71818C',
                        fontSize:
                          10,
                        fontWeight:
                          800,
                        letterSpacing:
                          0.6,
                      }}
                    >
                      CENTER
                    </div>

                    <div
                      style={{
                        marginTop:
                          4,
                        fontSize:
                          12,
                        color:
                          '#062F52',
                        fontWeight:
                          700,
                      }}
                    >
                      {
                        formCoordinates
                      }
                    </div>
                  </div>

                  <div
                    style={{
                      padding:
                        12,
                      borderRadius:
                        14,
                      background:
                        '#F6FAFB',
                      border:
                        '1px solid #E3EBEF',
                    }}
                  >
                    <div
                      style={{
                        color:
                          '#71818C',
                        fontSize:
                          10,
                        fontWeight:
                          800,
                        letterSpacing:
                          0.6,
                      }}
                    >
                      COVERAGE
                    </div>

                    <div
                      style={{
                        marginTop:
                          4,
                        fontSize:
                          12,
                        color:
                          '#062F52',
                        fontWeight:
                          700,
                      }}
                    >
                      {Number(
                        form.radius_km,
                      ).toFixed(
                        2,
                      )}{' '}
                      km radius
                    </div>
                  </div>
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
                  22,
                paddingTop:
                  18,
                borderTop:
                  '1px solid #E8EEF1',
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
                  void saveArea()
                }
                disabled={
                  saving
                }
                style={{
                  minWidth: 150,
                  background:
                    '#062F52',
                  color:
                    '#FFFFFF',
                }}
              >
                {saving
                  ? 'Saving...'
                  : form.id
                    ? 'Save changes'
                    : 'Create area'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="panel"
        style={{
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display:
              'grid',
            gridTemplateColumns:
              'minmax(260px, 1fr) 170px auto',
            gap: 12,
            alignItems:
              'end',
          }}
        >
          <label>
            <strong>
              Search areas
            </strong>

            <div
              style={{
                position:
                  'relative',
                marginTop:
                  6,
              }}
            >
              <Search
                size={16}
                style={{
                  position:
                    'absolute',
                  left: 11,
                  top: 11,
                  color:
                    '#8194A0',
                }}
              />

              <input
                type="search"
                value={
                  areaSearch
                }
                onChange={(
                  event,
                ) =>
                  setAreaSearch(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Area, city, state or service"
                style={{
                  width:
                    '100%',
                  paddingLeft:
                    36,
                }}
              />
            </div>
          </label>

          <label>
            <strong>
              Status
            </strong>

            <select
              value={
                statusFilter
              }
              onChange={(
                event,
              ) =>
                setStatusFilter(
                  event
                    .target
                    .value as
                    | 'all'
                    | 'active'
                    | 'inactive',
                )
              }
              style={{
                width:
                  '100%',
                marginTop:
                  6,
              }}
            >
              <option value="all">
                All
              </option>

              <option value="active">
                Live
              </option>

              <option value="inactive">
                Inactive
              </option>
            </select>
          </label>

          <button
            className="dashboard-refresh"
            onClick={
              resetFilters
            }
          >
            Reset
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>
              All service areas
            </h2>

            <p>
              {loading
                ? 'Loading areas...'
                : `${filteredAreas.length} of ${areas.length} area${
                    areas.length === 1
                      ? ''
                      : 's'
                  }`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="bookings-empty">
            <strong>
              Loading service areas...
            </strong>

            <span>
              Please wait.
            </span>
          </div>
        ) : filteredAreas.length ===
          0 ? (
          <div className="bookings-empty">
            <strong>
              No service areas found
            </strong>

            <span>
              Try a different
              search or status
              filter.
            </span>
          </div>
        ) : (
          <div className="bookings-table-wrap">
            <table className="bookings-table">
              <thead>
                <tr>
                  <th>
                    Area
                  </th>

                  <th>
                    Coverage
                  </th>

                  <th>
                    Services
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Updated
                  </th>

                  <th>
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredAreas.map(
                  (area) => (
                    <tr
                      key={`${area.is_legacy ? 'legacy' : 'group'}-${area.id}`}
                    >
                      <td>
                        <strong>
                          {area.name}
                        </strong>

                        <div
                          style={{
                            marginTop:
                              3,
                            color:
                              '#71818C',
                            fontSize:
                              12,
                          }}
                        >
                          {area.city},{' '}
                          {area.state}
                        </div>

                        {area.is_legacy && (
                          <span
                            style={{
                              display:
                                'inline-flex',
                              marginTop:
                                7,
                              padding:
                                '4px 7px',
                              borderRadius:
                                999,
                              background:
                                '#FFF7E8',
                              color:
                                '#A75A16',
                              fontSize:
                                9,
                              fontWeight:
                                800,
                              letterSpacing:
                                0.5,
                            }}
                          >
                            LEGACY AREA
                          </span>
                        )}
                      </td>

                      <td>
                        <strong>
                          {Number(
                            area.radius_km,
                          ).toFixed(
                            1,
                          )}{' '}
                          km
                        </strong>

                        <div
                          style={{
                            marginTop:
                              3,
                            color:
                              '#71818C',
                            fontSize:
                              11,
                          }}
                        >
                          {Number(
                            area.center_latitude,
                          ).toFixed(
                            4,
                          )}
                          ,{' '}
                          {Number(
                            area.center_longitude,
                          ).toFixed(
                            4,
                          )}
                        </div>
                      </td>

                      <td>
                        <div
                          style={{
                            display:
                              'flex',
                            flexWrap:
                              'wrap',
                            gap: 6,
                            maxWidth:
                              360,
                          }}
                        >
                          {area.service_names.map(
                            (
                              serviceName,
                            ) => (
                              <span
                                key={`${area.id}-${serviceName}`}
                                style={{
                                  display:
                                    'inline-flex',
                                  alignItems:
                                    'center',
                                  padding:
                                    '5px 8px',
                                  borderRadius:
                                    999,
                                  background:
                                    '#EAF7F7',
                                  color:
                                    '#087F72',
                                  fontSize:
                                    10,
                                  fontWeight:
                                    800,
                                }}
                              >
                                {
                                  serviceName
                                }
                              </span>
                            ),
                          )}

                          {area.service_count ===
                            0 && (
                            <span
                              style={{
                                color:
                                  '#A0ADB5',
                                fontSize:
                                  12,
                              }}
                            >
                              No services
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <span
                          className={
                            area.is_active
                              ? 'booking-status booking-status-paid'
                              : 'booking-status booking-status-cancelled'
                          }
                        >
                          {area.is_active
                            ? 'Live'
                            : 'Inactive'}
                        </span>
                      </td>

                      <td>
                        <span
                          style={{
                            color:
                              '#71818C',
                            fontSize:
                              12,
                          }}
                        >
                          {new Date(
                            area.updated_at,
                          ).toLocaleString()}
                        </span>
                      </td>

                      <td>
                        <button
                          className="dashboard-refresh"
                          onClick={() =>
                            editArea(
                              area,
                            )
                          }
                        >
                          <Edit3
                            size={14}
                            style={{
                              marginRight:
                                6,
                              verticalAlign:
                                'middle',
                            }}
                          />

                          Edit
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}