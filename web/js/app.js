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
    let activeSort = 'rating';
    let activeFilters = new Set(['images']);
    let currentQuery = '';
    let pagination = { page: 1, total: 0, hasMore: false, loading: false };

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
        document.getElementById('viewAccount').style.display = view === 'account' ? '' : 'none';

        document.querySelectorAll('.nav-item').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === view);
        });

        if (view === 'favourites') loadFavourites();
        if (view === 'myreviews') loadMyReviews();
        if (view === 'account') updateAccountView();

        // Scroll to top on view change
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateNavAuth() {
        const loggedIn = Auth.isLoggedIn();
        const user = Auth.getUser();
        
        // Update account label/icon state if needed
        const accountLabel = document.getElementById('accountLabel');
        if (loggedIn && user) {
            accountLabel.textContent = user.name.split(' ')[0];
        } else {
            accountLabel.textContent = 'Account';
        }
        
        if (currentView === 'account') updateAccountView();
    }

    function updateAccountView() {
        const loggedIn = Auth.isLoggedIn();
        const user = Auth.getUser();
        const profile = document.getElementById('accountProfile');
        const guest = document.getElementById('accountGuest');
        
        if (loggedIn && user) {
            profile.style.display = 'block';
            guest.style.display = 'none';
            document.getElementById('profileName').textContent = user.name;
            document.getElementById('profileEmail').textContent = user.email;
        } else {
            profile.style.display = 'none';
            guest.style.display = 'block';
        }
    }

    // =========================================
    // Auth Modals
    // =========================================
    function openModal(id) {
        document.getElementById(id).style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Prevent scroll
    }
    function closeModal(id) {
        document.getElementById(id).style.display = 'none';
        document.body.style.overflow = '';
    }

    function setupAuthModals() {
        // Account view buttons
        document.getElementById('btnAccLogin').addEventListener('click', () => openModal('loginModal'));
        document.getElementById('btnAccRegister').addEventListener('click', () => openModal('registerModal'));
        
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
                gtag('event', 'login', { method: 'email' });
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
                gtag('event', 'sign_up', { method: 'email' });
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

    const MATCHA_PLACEHOLDER = `
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:60%;height:60%;opacity:0.8">
            <path d="M20 40 Q 20 80 50 80 Q 80 80 80 40 Z" fill="oklch(75% 0.2 148)" />
            <path d="M80 45 Q 95 45 95 55 Q 95 65 80 65" fill="none" stroke="oklch(44% 0.09 148)" stroke-width="5" />
            <circle cx="40" cy="55" r="3" fill="oklch(12% 0.02 148)" />
            <circle cx="60" cy="55" r="3" fill="oklch(12% 0.02 148)" />
            <path d="M45 65 Q 50 70 55 65" fill="none" stroke="oklch(12% 0.02 148)" stroke-width="2" stroke-linecap="round" />
            <path d="M30 25 Q 35 15 40 25" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="3" stroke-linecap="round" />
            <path d="M50 20 Q 55 10 60 20" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="3" stroke-linecap="round" />
        </svg>
    `;

    // =========================================
    // Place Cards
    // =========================================
    function createPlaceCard(place) {
        const isFav = favouriteIds.has(place.id);
        const ratingHtml = place.averageRating
            ? `${renderStars(place.averageRating)} <span class="rating-value">${place.averageRating}</span> <span class="review-count">(${place.reviewCount})</span>`
            : `<span class="review-count">No reviews yet</span>`;

        const card = document.createElement('div');
        card.className = 'place-card stagger-item';
        card.innerHTML = `
            <div class="place-card-image" style="display:flex;align-items:center;justify-content:center;background:oklch(95% 0.02 148)">
                ${place.imageUrl
                    ? `<img src="${place.imageUrl}" alt="${escapeHtml(place.name)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML=App.placeholder" />`
                    : MATCHA_PLACEHOLDER}
            </div>
            <button class="btn-icon fav-btn ${isFav ? 'active' : ''}" data-id="${place.id}" title="${isFav ? 'Remove' : 'Save'}">
                ${isFav ? '❤️' : '🤍'}
            </button>
            <div class="place-card-body">
                <div class="place-card-header">
                    <div class="place-card-name">${escapeHtml(place.name)}</div>
                </div>
                <div class="place-card-address">📍 ${escapeHtml(place.address || 'Toronto, ON')}</div>
                <div class="place-card-rating">${ratingHtml}</div>
            </div>
        `;

        const openDetails = () => openPlaceModal(place.id);
        card.querySelector('.place-card-image').addEventListener('click', openDetails);
        card.querySelector('.place-card-body').addEventListener('click', openDetails);

        const favBtn = card.querySelector('.fav-btn');
        favBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!Auth.isLoggedIn()) {
                openModal('loginModal');
                return;
            }
            const id = favBtn.dataset.id;
            const isCurrentlyFav = favouriteIds.has(id);
            
            // UI INSTANT Optimistic update
            favBtn.classList.add('heart-pop');
            setTimeout(() => favBtn.classList.remove('heart-pop'), 400);

            if (isCurrentlyFav) {
                favouriteIds.delete(id);
                favBtn.classList.remove('active');
                favBtn.textContent = '🤍';
            } else {
                favouriteIds.add(id);
                favBtn.classList.add('active');
                favBtn.textContent = '❤️';
            }

            try {
                if (isCurrentlyFav) {
                    await API.removeFavourite(id);
                    showToast('Removed from favourites', 'info');
                } else {
                    await API.addFavourite(id);
                    showToast('Saved to favourites!', 'success');
                }
            } catch (err) {
                showToast(err.message, 'error');
                // Revert state ONLY on actual error
                if (isCurrentlyFav) {
                    favouriteIds.add(id);
                    favBtn.classList.add('active');
                    favBtn.textContent = '❤️';
                } else {
                    favouriteIds.delete(id);
                    favBtn.classList.remove('active');
                    favBtn.textContent = '🤍';
                }
            }
        });

        return card;
    }

    function createAdCard() {
        const card = document.createElement('div');
        card.className = 'ad-card stagger-item';
        
        const iframe = document.createElement('iframe');
        iframe.style.width = '300px';
        iframe.style.height = '250px';
        iframe.style.border = 'none';
        iframe.style.overflow = 'hidden';
        
        // Using srcdoc to create a mini-page for each ad
        const adHtml = `
            <html>
                <body style="margin:0;padding:0;display:flex;justify-content:center;align-items:center;">
                    <script type="text/javascript">
                        atOptions = {
                            'key' : '3148dbb04423ae6e3550b96c07cc151b',
                            'format' : 'iframe',
                            'height' : 250,
                            'width' : 300,
                            'params' : {}
                        };
                    </script>
                    <script type="text/javascript" src="https://www.highperformanceformat.com/3148dbb04423ae6e3550b96c07cc151b/invoke.js"></script>
                </body>
            </html>
        `;
        
        iframe.srcdoc = adHtml;
        card.appendChild(iframe);
        
        return card;
    }

    // =========================================
    // Home / Search
    // =========================================
    function buildSearchParams(page = 1) {
        const params = { page, pageSize: 20, sort: activeSort };
        if (currentQuery)                  params.q = currentQuery;
        if (userLocation)                  { params.lat = userLocation.lat; params.lng = userLocation.lng; }
        if (activeFilters.has('images'))   params.hasImage = true;
        if (activeFilters.has('reviewed')) params.hasReviews = true;
        if (activeFilters.has('unreviewed')) params.noReviews = true;
        if (activeFilters.has('top'))      params.minRating = 4;
        return params;
    }

    async function searchPlaces(query, resetGrid = true) {
        if (pagination.loading) return;
        currentQuery = query || '';

        const grid = document.getElementById('placesGrid');
        const title = document.getElementById('placesTitle');

        if (resetGrid) {
            pagination = { page: 1, total: 0, hasMore: false, loading: true };
            grid.innerHTML = '<div class="loading-spinner"></div>';
            title.textContent = !currentQuery ? 'All Spots' : `"${currentQuery}"`;
        } else {
            pagination.loading = true;
            document.getElementById('loadMoreSpinner').style.display = 'block';
        }

        try {
            const data = await API.searchPlaces(buildSearchParams(pagination.page));
            pagination.total = data.total;
            pagination.hasMore = data.hasMore;
            pagination.loading = false;

            document.getElementById('placesCount').textContent =
                `${data.total} spot${data.total !== 1 ? 's' : ''}`;

            if (resetGrid) grid.innerHTML = '';
            document.getElementById('loadMoreSpinner').style.display = 'none';

            if (data.total === 0) {
                grid.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-state-icon">🍵</span>
                        <h3>No spots found</h3>
                        <p>Try a different search term.</p>
                    </div>`;
                return;
            }

            data.items.forEach((place, index) => {
                grid.appendChild(createPlaceCard(place));
                
                // Add AD every 3 items
                const currentPlacesCount = grid.querySelectorAll('.place-card').length;
                if (currentPlacesCount % 3 === 0) {
                    grid.appendChild(createAdCard());
                }
            });
        } catch (err) {
            pagination.loading = false;
            document.getElementById('loadMoreSpinner').style.display = 'none';
            if (resetGrid) grid.innerHTML = `
                <div class="empty-state">
                    <span class="empty-state-icon">⚠️</span>
                    <h3>Error</h3>
                    <p>${escapeHtml(err.message)}</p>
                </div>`;
        }
    }

    function loadNextPage() {
        if (pagination.loading || !pagination.hasMore) return;
        pagination.page++;
        searchPlaces(currentQuery, false);
    }

    function setupInfiniteScroll() {
        const sentinel = document.getElementById('scrollSentinel');
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadNextPage();
        }, { rootMargin: '200px' });
        observer.observe(sentinel);
    }

    function resetSortFilter() {
        activeSort = 'rating';
        activeFilters.clear();
        document.querySelectorAll('#sortPills .pill').forEach(p => p.classList.toggle('active', p.dataset.sort === 'rating'));
        document.querySelectorAll('#filterPills .pill').forEach(p => p.classList.remove('active'));
    }

    function setupSortFilter() {
        document.querySelectorAll('#sortPills .pill').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#sortPills .pill').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                activeSort = btn.dataset.sort;
                if (activeSort === 'distance' && !userLocation) {
                    showToast('Enable location first using "📍 Near Me"', 'info');
                }
                gtag('event', 'sort_places', { sort_by: activeSort });
                pagination.page = 1;
                searchPlaces(currentQuery, true);
            });
        });

        document.querySelectorAll('#filterPills .pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const f = btn.dataset.filter;
                if (activeFilters.has(f)) {
                    activeFilters.delete(f);
                    btn.classList.remove('active');
                } else {
                    activeFilters.add(f);
                    btn.classList.add('active');
                }
                gtag('event', 'filter_places', { filters: [...activeFilters].join(',') });
                pagination.page = 1;
                searchPlaces(currentQuery, true);
            });
        });
    }

    function setupSearch() {
        const input = document.getElementById('searchInput');
        const btn = document.getElementById('btnSearch');
        const locBtn = document.getElementById('btnLocation');

        btn.addEventListener('click', () => {
            resetSortFilter();
            pagination.page = 1;
            searchPlaces(input.value.trim(), true);
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
                    gtag('event', 'use_location_search');
                    if (activeSort !== 'distance') {
                        document.querySelectorAll('#sortPills .pill').forEach(p => p.classList.toggle('active', p.dataset.sort === 'distance'));
                        activeSort = 'distance';
                    }
                    pagination.page = 1;
                    searchPlaces(input.value.trim(), true);
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
            gtag('event', 'view_item', { item_id: place.id, item_name: place.name, item_category: 'matcha_place' });

            const isFav = favouriteIds.has(place.id);
            const ratingHtml = place.averageRating
                ? `${renderStars(place.averageRating)} <span class="rating-value">${place.averageRating}</span> <span class="review-count">(${place.reviewCount} reviews)</span>`
                : '<span class="review-count">No reviews yet — be the first!</span>';

            const mapsBtn = place.googleMapsUrl
                ? `<a href="${place.googleMapsUrl}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">🗺 Google Maps</a>`
                : '';

            content.innerHTML = `
                <div class="place-detail-header">
                    <div class="place-detail-icon" style="display:flex;align-items:center;justify-content:center;background:oklch(95% 0.02 148)">
                        ${place.imageUrl
                            ? `<img src="${place.imageUrl}" alt="${escapeHtml(place.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" onerror="this.parentElement.innerHTML=App.placeholder" />`
                            : MATCHA_PLACEHOLDER}
                    </div>
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
                        gtag('event', 'remove_from_wishlist', { item_id: place.id, item_name: place.name });
                    } else {
                        await API.addFavourite(place.id);
                        favouriteIds.add(place.id);
                        btn.className = 'btn btn-outline btn-sm';
                        btn.textContent = '❤️ In Favourites';
                        showToast('Added to favourites!', 'success');
                        gtag('event', 'add_to_wishlist', { item_id: place.id, item_name: place.name });
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

            const btn = document.getElementById('submitReviewBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-inline"></span> Submitting…';

            try {
                await API.createReview(placeId, selectedRating, body || "");
                userReviewedPlaces.add(placeId);
                showToast('Review submitted!', 'success');
                gtag('event', 'submit_review', { place_id: placeId, rating: selectedRating });

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
        setupSortFilter();
        setupInfiniteScroll();

        // Bottom Nav switching
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => switchView(item.dataset.view));
        });

        // Search toggle (for mobile quick access)
        document.getElementById('btnSearchToggle').addEventListener('click', () => {
            if (currentView !== 'home') switchView('home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            document.getElementById('searchInput').focus();
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

        // Initial load — all places ordered by rating
        await searchPlaces('', true);
    }

    document.addEventListener('DOMContentLoaded', init);

    // Export App to window for inline onclick handlers in generated HTML
    window.App = { showToast, searchPlaces, openPlaceModal, placeholder: MATCHA_PLACEHOLDER };

    return { showToast, searchPlaces, openPlaceModal };
})();
