/* =========================================
   Rate Matcha — Main Application
   ========================================= */

const App = (() => {
    // State
    let currentView = 'home';
    let currentPlace = null;
    let userLocation = null;
    let favouriteIds = new Set();
    let reviewPage = 1;
    let reviewTotal = 0;
    let selectedRating = 0;
    let userReviewedPlaces = new Set();

    // =========================================
    // Toast Notifications
    // =========================================
    function showToast(msg, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = { success: '✓', error: '✕', info: 'ℹ' };
        toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 200);
        }, 3500);
    }

    // =========================================
    // Star Rendering
    // =========================================
    function renderStars(rating, max = 5) {
        if (!rating) return '<span class="stars" style="color:#d1d5db">☆☆☆☆☆</span>';
        let stars = '';
        for (let i = 1; i <= max; i++) {
            stars += i <= Math.round(rating) ? '★' : '☆';
        }
        return `<span class="stars">${stars}</span>`;
    }

    function renderStarPicker(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        for (let i = 1; i <= 5; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = '★';
            btn.dataset.value = i;
            btn.className = i <= selectedRating ? 'filled' : '';
            btn.addEventListener('mouseenter', () => {
                container.querySelectorAll('button').forEach((b, idx) => {
                    b.className = idx < i ? 'filled' : '';
                });
            });
            btn.addEventListener('mouseleave', () => {
                container.querySelectorAll('button').forEach((b, idx) => {
                    b.className = idx < selectedRating ? 'filled' : '';
                });
            });
            btn.addEventListener('click', () => {
                selectedRating = i;
                container.querySelectorAll('button').forEach((b, idx) => {
                    b.className = idx < selectedRating ? 'filled' : '';
                });
            });
            container.appendChild(btn);
        }
    }

    // =========================================
    // Navigation
    // =========================================
    function switchView(view) {
        currentView = view;
        document.getElementById('viewHome').style.display = view === 'home' ? '' : 'none';
        document.getElementById('viewFavourites').style.display = view === 'favourites' ? '' : 'none';
        document.getElementById('viewMyReviews').style.display = view === 'myreviews' ? '' : 'none';

        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === view);
        });

        if (view === 'favourites') loadFavourites();
        if (view === 'myreviews') loadMyReviews();
    }

    function updateNavAuth() {
        const loggedIn = Auth.isLoggedIn();
        const user = Auth.getUser();
        document.getElementById('navAuth').style.display = loggedIn ? 'none' : '';
        document.getElementById('navUser').style.display = loggedIn ? '' : 'none';
        document.getElementById('tabFavourites').style.display = loggedIn ? '' : 'none';
        document.getElementById('tabMyReviews').style.display = loggedIn ? '' : 'none';
        if (loggedIn && user) {
            document.getElementById('userGreeting').textContent = `Hi, ${user.name.split(' ')[0]} 👋`;
        }
    }

    // =========================================
    // Auth Modals
    // =========================================
    function openModal(id) {
        document.getElementById(id).style.display = 'flex';
    }
    function closeModal(id) {
        document.getElementById(id).style.display = 'none';
    }

    function setupAuthModals() {
        document.getElementById('btnLogin').addEventListener('click', () => openModal('loginModal'));
        document.getElementById('btnRegister').addEventListener('click', () => openModal('registerModal'));
        document.getElementById('closeLoginModal').addEventListener('click', () => closeModal('loginModal'));
        document.getElementById('closeRegisterModal').addEventListener('click', () => closeModal('registerModal'));
        document.getElementById('switchToRegister').addEventListener('click', (e) => {
            e.preventDefault();
            closeModal('loginModal');
            openModal('registerModal');
        });
        document.getElementById('switchToLogin').addEventListener('click', (e) => {
            e.preventDefault();
            closeModal('registerModal');
            openModal('loginModal');
        });

        // Close modals on overlay click
        ['loginModal', 'registerModal', 'placeModal'].forEach(id => {
            document.getElementById(id).addEventListener('click', (e) => {
                if (e.target === e.currentTarget) closeModal(id);
            });
        });

        document.getElementById('btnLogout').addEventListener('click', () => {
            Auth.clear();
            favouriteIds = new Set();
            userReviewedPlaces = new Set();
            updateNavAuth();
            if (currentView !== 'home') switchView('home');
            showToast('Logged out. See you next time!', 'info');
        });

        // Login form
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-inline"></span> Logging in…';
            try {
                const res = await API.login(email, password);
                Auth.save(res.token, { name: res.name, email: res.email, userId: res.userId });
                closeModal('loginModal');
                updateNavAuth();
                await loadFavouriteIds();
                showToast(`Welcome back, ${res.name}!`, 'success');
                document.getElementById('loginForm').reset();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Log In';
            }
        });

        // Register form
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('regName').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const password = document.getElementById('regPassword').value;
            if (password.length < 8) {
                showToast('Password must be at least 8 characters.', 'error');
                return;
            }
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-inline"></span> Creating account…';
            try {
                const res = await API.register(name, email, password);
                Auth.save(res.token, { name: res.name, email: res.email, userId: res.userId });
                closeModal('registerModal');
                updateNavAuth();
                await loadFavouriteIds();
                showToast(`Welcome to Rate Matcha, ${res.name}!`, 'success');
                document.getElementById('registerForm').reset();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Create Account';
            }
        });
    }

    // =========================================
    // Favourite IDs (for heart icons)
    // =========================================
    async function loadFavouriteIds() {
        if (!Auth.isLoggedIn()) return;
        try {
            const favs = await API.getFavourites();
            favouriteIds = new Set(favs.map(f => f.id));
        } catch (_) { /* silent */ }
    }

    // =========================================
    // Place Cards
    // =========================================
    function createPlaceCard(place) {
        const isFav = favouriteIds.has(place.id);
        const ratingHtml = place.averageRating
            ? `${renderStars(place.averageRating)} <span class="rating-value">${place.averageRating}</span> <span class="review-count">(${place.reviewCount})</span>`
            : `<span class="review-count" style="color:var(--text-light)">No reviews yet</span>`;

        const card = document.createElement('div');
        card.className = 'place-card';
        card.innerHTML = `
            <div class="place-card-image">🍵</div>
            <div class="place-card-body">
                <div class="place-card-header">
                    <div class="place-card-name">${escapeHtml(place.name)}</div>
                    <button class="btn-icon fav-btn ${isFav ? 'active' : ''}" data-id="${place.id}" title="${isFav ? 'Remove from favourites' : 'Add to favourites'}">
                        ${isFav ? '❤️' : '🤍'}
                    </button>
                </div>
                <div class="place-card-address">📍 ${escapeHtml(place.address || 'Toronto, ON')}</div>
                <div class="place-card-rating">${ratingHtml}</div>
                <div class="place-card-footer">
                    <button class="btn btn-primary btn-sm view-details-btn" data-id="${place.id}">View Details</button>
                </div>
            </div>
        `;

        card.querySelector('.view-details-btn').addEventListener('click', () => openPlaceModal(place.id));

        const favBtn = card.querySelector('.fav-btn');
        favBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!Auth.isLoggedIn()) {
                openModal('loginModal');
                return;
            }
            const id = favBtn.dataset.id;
            const wasActive = favBtn.classList.contains('active');
            try {
                if (wasActive) {
                    await API.removeFavourite(id);
                    favouriteIds.delete(id);
                    favBtn.classList.remove('active');
                    favBtn.textContent = '🤍';
                    favBtn.title = 'Add to favourites';
                    showToast('Removed from favourites', 'info');
                } else {
                    await API.addFavourite(id);
                    favouriteIds.add(id);
                    favBtn.classList.add('active');
                    favBtn.textContent = '❤️';
                    favBtn.title = 'Remove from favourites';
                    showToast('Added to favourites!', 'success');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        });

        return card;
    }

    // =========================================
    // Home / Search
    // =========================================
    async function searchPlaces(query, lat, lng) {
        const grid = document.getElementById('placesGrid');
        const countEl = document.getElementById('placesCount');
        const title = document.getElementById('placesTitle');
        grid.innerHTML = '<div class="loading-spinner"></div>';
        title.textContent = query === 'matcha' ? 'Matcha Spots in Toronto' : `Results for "${query}"`;

        try {
            const places = await API.searchPlaces(query, lat, lng);
            grid.innerHTML = '';
            countEl.textContent = `${places.length} spot${places.length !== 1 ? 's' : ''}`;

            if (places.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-state-icon">🍵</span>
                        <h3>No spots found</h3>
                        <p>Try a different search term or browse all Toronto matcha cafes.</p>
                    </div>`;
                return;
            }

            places.forEach(place => grid.appendChild(createPlaceCard(place)));
        } catch (err) {
            grid.innerHTML = `
                <div class="empty-state">
                    <span class="empty-state-icon">⚠️</span>
                    <h3>Could not load places</h3>
                    <p>${escapeHtml(err.message)}</p>
                </div>`;
        }
    }

    function setupSearch() {
        const input = document.getElementById('searchInput');
        const btn = document.getElementById('btnSearch');
        const locBtn = document.getElementById('btnLocation');

        btn.addEventListener('click', () => {
            const q = input.value.trim() || 'matcha';
            searchPlaces(q, userLocation?.lat, userLocation?.lng);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btn.click();
        });

        locBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                showToast('Geolocation is not supported by your browser.', 'error');
                return;
            }
            locBtn.disabled = true;
            locBtn.textContent = '…';
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    locBtn.disabled = false;
                    locBtn.textContent = '📍 Near Me';
                    showToast('Location found! Showing nearby spots.', 'success');
                    searchPlaces(input.value.trim() || 'matcha', userLocation.lat, userLocation.lng);
                },
                () => {
                    locBtn.disabled = false;
                    locBtn.textContent = '📍 Near Me';
                    showToast('Could not get your location.', 'error');
                }
            );
        });
    }

    // =========================================
    // Place Detail Modal
    // =========================================
    async function openPlaceModal(placeId) {
        const modal = document.getElementById('placeModal');
        const content = document.getElementById('placeModalContent');
        selectedRating = 0;
        reviewPage = 1;
        currentPlace = placeId;
        modal.style.display = 'flex';
        content.innerHTML = '<div class="loading-spinner"></div>';

        try {
            const [place, reviewsData] = await Promise.all([
                API.getPlace(placeId),
                API.getPlaceReviews(placeId, 1)
            ]);
            reviewTotal = reviewsData.total;

            const isFav = favouriteIds.has(place.id);
            const ratingHtml = place.averageRating
                ? `${renderStars(place.averageRating)} <span class="rating-value">${place.averageRating}</span> <span class="review-count">(${place.reviewCount} reviews)</span>`
                : '<span class="review-count">No reviews yet — be the first!</span>';

            const mapsBtn = place.googleMapsUrl
                ? `<a href="${place.googleMapsUrl}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">🗺 Google Maps</a>`
                : '';

            content.innerHTML = `
                <div class="place-detail-header">
                    <div class="place-detail-icon">🍵</div>
                    <div class="place-detail-info">
                        <div class="place-detail-name">${escapeHtml(place.name)}</div>
                        <div class="place-detail-address">📍 ${escapeHtml(place.address || 'Toronto, ON')}</div>
                        <div class="place-detail-meta">
                            <div class="place-card-rating">${ratingHtml}</div>
                        </div>
                    </div>
                </div>
                <div class="place-detail-actions">
                    <button class="btn ${isFav ? 'btn-outline' : 'btn-primary'} btn-sm" id="modalFavBtn">
                        ${isFav ? '❤️ In Favourites' : '🤍 Add to Favourites'}
                    </button>
                    ${mapsBtn}
                </div>
                <hr class="place-detail-divider">
                <div class="reviews-section">
                    <h3>Reviews <span id="reviewCountBadge" style="font-weight:400;color:var(--text-light);font-size:0.875rem">${reviewTotal > 0 ? `(${reviewTotal})` : ''}</span></h3>
                    <div id="reviewsList"></div>
                    <div id="reviewPagination"></div>
                </div>
                <div id="reviewFormContainer"></div>
            `;

            renderReviews(reviewsData.items);
            renderPagination(reviewsData.total, reviewsData.page, reviewsData.pageSize, placeId);
            renderReviewForm(placeId, reviewsData.items);

            // Fav button in modal
            document.getElementById('modalFavBtn').addEventListener('click', async () => {
                if (!Auth.isLoggedIn()) { openModal('loginModal'); return; }
                const btn = document.getElementById('modalFavBtn');
                const wasFav = favouriteIds.has(place.id);
                try {
                    if (wasFav) {
                        await API.removeFavourite(place.id);
                        favouriteIds.delete(place.id);
                        btn.className = 'btn btn-primary btn-sm';
                        btn.textContent = '🤍 Add to Favourites';
                        showToast('Removed from favourites', 'info');
                    } else {
                        await API.addFavourite(place.id);
                        favouriteIds.add(place.id);
                        btn.className = 'btn btn-outline btn-sm';
                        btn.textContent = '❤️ In Favourites';
                        showToast('Added to favourites!', 'success');
                    }
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });

        } catch (err) {
            content.innerHTML = `
                <div class="empty-state">
                    <span class="empty-state-icon">⚠️</span>
                    <h3>Failed to load place</h3>
                    <p>${escapeHtml(err.message)}</p>
                </div>`;
        }
    }

    function renderReviews(reviews) {
        const list = document.getElementById('reviewsList');
        if (!list) return;
        if (!reviews || reviews.length === 0) {
            list.innerHTML = '<p class="no-reviews-msg">No reviews yet. Be the first to share your experience!</p>';
            return;
        }
        list.innerHTML = reviews.map(r => `
            <div class="review-item">
                <div class="review-header">
                    <div style="display:flex;align-items:center;gap:0.5rem">
                        <span class="review-author">${escapeHtml(r.userName)}</span>
                        ${renderStars(r.rating)}
                        <span class="rating-value" style="font-size:0.8rem">${r.rating}/5</span>
                    </div>
                    <span class="review-date">${formatDate(r.createdAt)}</span>
                </div>
                <div class="review-body">${escapeHtml(r.body)}</div>
            </div>
        `).join('');
    }

    function renderPagination(total, page, pageSize, placeId) {
        const container = document.getElementById('reviewPagination');
        if (!container || total <= pageSize) return;
        const totalPages = Math.ceil(total / pageSize);
        container.innerHTML = `
            <div class="pagination">
                <button class="btn btn-outline btn-sm" ${page <= 1 ? 'disabled' : ''} id="prevPage">← Prev</button>
                <span>Page ${page} of ${totalPages}</span>
                <button class="btn btn-outline btn-sm" ${page >= totalPages ? 'disabled' : ''} id="nextPage">Next →</button>
            </div>`;

        document.getElementById('prevPage')?.addEventListener('click', async () => {
            if (reviewPage > 1) {
                reviewPage--;
                const data = await API.getPlaceReviews(placeId, reviewPage);
                renderReviews(data.items);
                renderPagination(data.total, data.page, data.pageSize, placeId);
            }
        });
        document.getElementById('nextPage')?.addEventListener('click', async () => {
            const totalPages = Math.ceil(reviewTotal / pageSize);
            if (reviewPage < totalPages) {
                reviewPage++;
                const data = await API.getPlaceReviews(placeId, reviewPage);
                renderReviews(data.items);
                renderPagination(data.total, data.page, data.pageSize, placeId);
            }
        });
    }

    function renderReviewForm(placeId, existingReviews) {
        const container = document.getElementById('reviewFormContainer');
        if (!container) return;

        if (!Auth.isLoggedIn()) {
            container.innerHTML = `
                <div class="review-form">
                    <p style="text-align:center;font-size:0.875rem">
                        <a href="#" id="loginToReview">Log in</a> or <a href="#" id="registerToReview">sign up</a> to leave a review.
                    </p>
                </div>`;
            document.getElementById('loginToReview')?.addEventListener('click', (e) => { e.preventDefault(); openModal('loginModal'); });
            document.getElementById('registerToReview')?.addEventListener('click', (e) => { e.preventDefault(); openModal('registerModal'); });
            return;
        }

        const user = Auth.getUser();
        const alreadyReviewed = existingReviews?.some(r => r.userId === user?.userId) || userReviewedPlaces.has(placeId);

        if (alreadyReviewed) {
            container.innerHTML = `
                <div class="review-form">
                    <p style="text-align:center;font-size:0.875rem;color:var(--matcha-dark)">✓ You have already reviewed this place.</p>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="review-form">
                <h3>Write a Review</h3>
                <div class="form-group">
                    <label>Your Rating</label>
                    <div class="star-picker" id="starPicker"></div>
                </div>
                <div class="form-group">
                    <label>Your Review</label>
                    <textarea id="reviewBody" placeholder="Share your experience — what did you order, what did you love?" rows="4"></textarea>
                </div>
                <button class="btn btn-primary" id="submitReviewBtn">Submit Review</button>
            </div>`;

        renderStarPicker('starPicker');

        document.getElementById('submitReviewBtn').addEventListener('click', async () => {
            const body = document.getElementById('reviewBody').value.trim();
            if (selectedRating === 0) { showToast('Please select a star rating.', 'error'); return; }
            if (!body) { showToast('Please write a review.', 'error'); return; }

            const btn = document.getElementById('submitReviewBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-inline"></span> Submitting…';

            try {
                await API.createReview(placeId, selectedRating, body);
                userReviewedPlaces.add(placeId);
                showToast('Review submitted!', 'success');

                // Reload reviews
                const data = await API.getPlaceReviews(placeId, 1);
                reviewPage = 1;
                reviewTotal = data.total;
                const badge = document.getElementById('reviewCountBadge');
                if (badge) badge.textContent = `(${reviewTotal})`;
                renderReviews(data.items);
                renderPagination(data.total, data.page, data.pageSize, placeId);
                container.innerHTML = `
                    <div class="review-form">
                        <p style="text-align:center;font-size:0.875rem;color:var(--matcha-dark)">✓ Thank you for your review!</p>
                    </div>`;
            } catch (err) {
                showToast(err.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Submit Review';
            }
        });
    }

    // =========================================
    // Favourites View
    // =========================================
    async function loadFavourites() {
        const grid = document.getElementById('favsGrid');
        if (!Auth.isLoggedIn()) {
            grid.innerHTML = `
                <div class="empty-state">
                    <span class="empty-state-icon">❤️</span>
                    <h3>Sign in to see your favourites</h3>
                </div>`;
            return;
        }
        grid.innerHTML = '<div class="loading-spinner"></div>';
        try {
            const favs = await API.getFavourites();
            favouriteIds = new Set(favs.map(f => f.id));
            grid.innerHTML = '';
            if (favs.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-state-icon">🤍</span>
                        <h3>No favourites yet</h3>
                        <p>Browse matcha spots and tap the heart to save your favourites.</p>
                    </div>`;
                return;
            }
            favs.forEach(place => grid.appendChild(createPlaceCard(place)));
        } catch (err) {
            grid.innerHTML = `<div class="empty-state"><h3>Error loading favourites</h3><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    // =========================================
    // My Reviews View
    // =========================================
    async function loadMyReviews() {
        const container = document.getElementById('myReviewsList');
        if (!Auth.isLoggedIn()) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-state-icon">📝</span>
                    <h3>Sign in to see your reviews</h3>
                </div>`;
            return;
        }
        container.innerHTML = '<div class="loading-spinner" style="display:block;margin:3rem auto"></div>';
        try {
            const reviews = await API.getMyReviews();
            userReviewedPlaces = new Set(reviews.map(r => r.placeId));

            if (reviews.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-state-icon">📝</span>
                        <h3>No reviews yet</h3>
                        <p>Visit a matcha spot and share your experience!</p>
                    </div>`;
                return;
            }

            container.innerHTML = `<div class="reviews-list-stacked">${reviews.map(r => `
                <div class="review-card">
                    <div class="review-place">${escapeHtml(r.placeName)}</div>
                    <div class="review-header" style="margin-bottom:0.5rem">
                        <div style="display:flex;align-items:center;gap:0.5rem">
                            ${renderStars(r.rating)}
                            <span class="rating-value">${r.rating}/5</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:0.5rem">
                            <span class="review-status-badge ${r.status}">${r.status}</span>
                            <span class="review-date">${formatDate(r.createdAt)}</span>
                        </div>
                    </div>
                    <div class="review-body">${escapeHtml(r.body)}</div>
                </div>
            `).join('')}</div>`;
        } catch (err) {
            container.innerHTML = `<div class="empty-state"><h3>Error loading reviews</h3><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    // =========================================
    // Utility
    // =========================================
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // =========================================
    // Init
    // =========================================
    async function init() {
        updateNavAuth();
        setupAuthModals();
        setupSearch();

        // Nav tab switching
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => switchView(tab.dataset.view));
        });

        // Close place modal
        document.getElementById('closePlaceModal').addEventListener('click', () => closeModal('placeModal'));

        // Try silent geolocation
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => { userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
                () => { /* silent fail */ }
            );
        }

        // Load favourite IDs if logged in
        if (Auth.isLoggedIn()) {
            await loadFavouriteIds();
        }

        // Initial search
        await searchPlaces('matcha', userLocation?.lat, userLocation?.lng);
    }

    document.addEventListener('DOMContentLoaded', init);

    return { showToast, searchPlaces, openPlaceModal };
})();
