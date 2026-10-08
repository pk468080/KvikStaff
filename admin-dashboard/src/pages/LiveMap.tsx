import { useEffect, useState, useRef } from 'react'
import { adminAction } from '../lib/adminAction'
import { loadGoogleMaps } from '../lib/googleMaps'

type LiveData = {
  workers: Array<{
    worker_id: string
    name: string
    status: string
    latitude: number
    longitude: number
    last_seen: string
  }>
  bookings: Array<{
    booking_id: string
    status: string
    latitude: number
    longitude: number
    worker_id: string | null
    service_name: string
  }>
}

export default function LiveMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<any>(null)
  const [data, setData] = useState<LiveData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const markersRef = useRef<any[]>([])

  useEffect(() => {
    async function initMap() {
      try {
        await loadGoogleMaps()
        if (mapRef.current && !map) {
          const m = new (window as any).google.maps.Map(mapRef.current, {
            center: { lat: 28.6139, lng: 77.2090 }, // Default to Delhi
            zoom: 11,
          })
          setMap(m)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load map')
      }
    }
    initMap()
  }, [map])

  const fetchData = async () => {
    setLoading(true)
    const { data: result, error: rpcError } = await adminAction<LiveData>('admin_get_live_map_data')
    if (rpcError) {
      setError(rpcError.message)
    } else if (result) {
      setData(result)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!map || !data) return

    // Clear old markers
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    const bounds = new (window as any).google.maps.LatLngBounds()
    let hasPoints = false

    data.workers.forEach(w => {
      if (w.latitude == null || w.longitude == null) return
      const position = { lat: w.latitude, lng: w.longitude }
      const marker = new (window as any).google.maps.Marker({
        position,
        map,
        title: `${w.name} (${w.status})`,
        icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'
      })
      markersRef.current.push(marker)
      bounds.extend(position)
      hasPoints = true
    })

    data.bookings.forEach(b => {
      if (b.latitude == null || b.longitude == null) return
      const position = { lat: b.latitude, lng: b.longitude }
      const marker = new (window as any).google.maps.Marker({
        position,
        map,
        title: `${b.service_name} (${b.status})`,
        icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
      })
      markersRef.current.push(marker)
      bounds.extend(position)
      hasPoints = true
    })

    if (hasPoints) {
      map.fitBounds(bounds)
    }
  }, [map, data])

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 0 }}>
      <div className="page-heading" style={{ padding: '20px' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>Live Map</h1>
          <p style={{ color: '#666', marginTop: 4 }}>Track active workers and ongoing bookings in real-time.</p>
        </div>
        <button 
          onClick={fetchData} 
          disabled={loading}
          style={{
            background: '#000',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '4px',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ margin: '0 20px 20px', padding: '12px', background: '#fee2e2', color: '#dc2626', borderRadius: '4px' }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, margin: '0 20px 20px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', minHeight: 400 }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}
