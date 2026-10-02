const API_KEY = import.meta.env.VITE_API_KEY;

export async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});

    // Add API key automatically
    if (API_KEY) {
        headers.set("X-API-Key", API_KEY);
    }

    // Don't manually set Content-Type for FormData
    if (!(options.body instanceof FormData)) {
        if (!headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });

    // API authentication failed
    if (response.status === 401) {
        throw new Error("API authentication failed. Invalid or missing API key.");
    }

    if (response.status === 403) {
        throw new Error("API access forbidden. API key may be disabled or expired.");
    }

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
    }

    return response;
}