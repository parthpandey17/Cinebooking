const normalizeUrl = (value) => value.trim().replace(/\/+$/, '')

const envUrl = normalizeUrl(
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_SERVER_URL ||
    ''
)

const productionUrl = normalizeUrl(
    import.meta.env.VITE_PRODUCTION_API_URL ||
    'https://cinebooking-production.up.railway.app'
)

export const apiBaseUrl = import.meta.env.DEV
    ? envUrl || 'http://localhost:8080'
    : envUrl && !envUrl.includes('localhost')
        ? envUrl
        : productionUrl