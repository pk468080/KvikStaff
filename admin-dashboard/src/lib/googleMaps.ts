let mapsPromise: Promise<void> | null = null

declare global {
  interface Window {
    google?: {
      maps?: unknown
    }
  }
}

export function loadGoogleMaps(): Promise<void> {
  if (mapsPromise) {
    return mapsPromise
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return Promise.reject(
      new Error(
        'VITE_GOOGLE_MAPS_API_KEY is missing. Add the Google Maps Web API key to admin-dashboard/.env and restart Vite.'
      )
    )
  }

  if (window.google?.maps) {
    mapsPromise = Promise.resolve()
    return mapsPromise
  }

  mapsPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(
      'tempstaff-google-maps-script'
    )

    if (existingScript) {
      existingScript.addEventListener(
        'load',
        () => resolve(),
        { once: true }
      )

      existingScript.addEventListener(
        'error',
        () =>
          reject(
            new Error(
              'Google Maps failed to load. Check the API key restrictions and enabled APIs.'
            )
          ),
        { once: true }
      )

      return
    }

    const script = document.createElement('script')

    script.id = 'tempstaff-google-maps-script'

    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&libraries=places&v=weekly`

    script.async = true
    script.defer = true

    script.onload = () => resolve()

    script.onerror = () =>
      reject(
        new Error(
          'Google Maps failed to load. Check billing, API restrictions, allowed website referrers, and enabled APIs.'
        )
      )

    document.head.appendChild(script)
  })

  return mapsPromise
}