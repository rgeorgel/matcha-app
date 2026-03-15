const API = (() => {
    const BASE = '/api';

    function getToken() {
        return localStorage.getItem('matcha_token');
    }

    function getHeaders(auth = false) {
        const h = { 'Content-Type': 'application/json' };
        if (auth) {
            const t = getToken();
            if (t) h['Authorization'] = `Bearer ${t}`;
        }
        return h;
    }

    async function request(method, path, body = null, auth = false) {
        const opts = { method, headers: getHeaders(auth) };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(BASE + path, opts);
        if (res.status === 204) return null;
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
        return data;
    }

    return {
        // Auth
        register: (name, email, password) => request('POST', '/auth/register', { name, email, password }),
        login: (email, password) => request('POST', '/auth/login', { email, password }),

        // Places
        searchPlaces: (q, lat, lng) => {
            const params = new URLSearchParams();
            if (q) params.append('q', q);
            if (lat) params.append('lat', lat);
            if (lng) params.append('lng', lng);
            return request('GET', `/places/search?${params}`);
        },
        getPlace: (id) => request('GET', `/places/${id}`),
        getPlaceReviews: (id, page = 1) => request('GET', `/places/${id}/reviews?page=${page}&pageSize=10`),

        // Reviews
        createReview: (placeId, rating, body) => request('POST', `/reviews?placeId=${placeId}`, { rating, body }, true),
        getMyReviews: () => request('GET', '/reviews/mine', null, true),

        // Favourites
        getFavourites: () => request('GET', '/favourites', null, true),
        addFavourite: (placeId) => request('POST', `/favourites/${placeId}`, null, true),
        removeFavourite: (placeId) => request('DELETE', `/favourites/${placeId}`, null, true),

        // Admin
        adminLogin: (email, password) => request('POST', '/admin/login', { email, password }),
        adminStats: (token) => fetch(BASE + '/admin/stats', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
        adminUsers: (token, q, page) => {
            const p = new URLSearchParams({ page, pageSize: 20 });
            if (q) p.append('q', q);
            return fetch(`${BASE}/admin/users?${p}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
        },
        adminDeleteUser: (token, id) => fetch(`${BASE}/admin/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }),
        adminReviews: (token, status, q, page) => {
            const p = new URLSearchParams({ page, pageSize: 20 });
            if (status) p.append('status', status);
            if (q) p.append('q', q);
            return fetch(`${BASE}/admin/reviews?${p}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
        },
        adminToggleReview: (token, id, status) => fetch(`${BASE}/admin/reviews/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status })
        }).then(r => r.json()),
        adminPlaces: (token, q, page) => {
            const p = new URLSearchParams({ page, pageSize: 20 });
            if (q) p.append('q', q);
            return fetch(`${BASE}/admin/places?${p}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
        },
    };
})();
