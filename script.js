// Detect if running on a real local dev server (localhost or LAN IP)
// IMPORTANT: Empty hostname ('') means file:// protocol — use production URL in that case.
const isLocal = (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '::1' ||
    window.location.hostname.startsWith('192.168.') ||
    window.location.hostname.startsWith('10.') ||
    window.location.hostname.startsWith('172.')
);

// By default, connect to the fully-connected production database on Render.com.
// To use a local backend running on port 5000, add '?local=true' to the URL (e.g., http://localhost:3000/?local=true).
const PRODUCTION_API = 'https://store-api-backend-cic4.onrender.com';
const isLocalForced = new URLSearchParams(window.location.search).get('local') === 'true';
const API_URL = isLocalForced ? 'http://localhost:5000' : PRODUCTION_API;


let products = []; // Fetched from Database now for True Sync
let adminActiveTab = 'Active';
let adminPrintActiveTab = 'Active';

function switchAdminOrderTab(tab) {
    adminActiveTab = tab;
    // Update tab UI state
    document.querySelectorAll('.admin-tab[id^="tab-"]').forEach(btn => {
        if (!btn.id.startsWith('tab-Print-')) btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`tab-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');
    updateAdminDashboard();
}

function switchAdminPrintTab(tab) {
    adminPrintActiveTab = tab;
    // Update tab UI state for prints
    document.querySelectorAll('.admin-tab[id^="tab-Print-"]').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tab-Print-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');
    updateAdminDashboard();
}


async function fetchProductsFromDB() {
    try {
        const response = await fetch(`${API_URL}/api/products`);
        if (response.ok) {
            products = await response.json();
            // Re-sync UI with new DB state while RESPECTING active filters
            if (currentUser) {
                if (currentUser.role === 'student') {
                    filterProducts();
                    updatePrintUI();
                }
                if (currentUser.role === 'admin') updateAdminDashboard();
            }
        }
    } catch(err) { console.error("Stock Sync Error", err); }
}

const bundles = [
    { id: "b1", name: "CSE 3rd Semester Kit", price: 350, originalPrice: 400, img: "🎒", items: ["DS Lab Manual", "OOP Lab Manual", "2 Blue Books", "1 Graph Set"] },
    { id: "b2", name: "1st Year Starter Pack", price: 1200, originalPrice: 1350, img: "📦", items: ["Calculator", "ED Kit", "Physics Record", "Chemistry Record"] },
];

let usersDB = [
    //{ name: "John Doe", email: "john@college.edu", usn: "1RV20CS001", pwd: "password123", role: "student", points: 250, referralCode: "JOHN123", refUsed: null },
    //{ name: "Jane Smith", email: "jane@college.edu", usn: "1RV20CS002", pwd: "password123", role: "student", points: 800, referralCode: "JANE456", refUsed: null },
    { name: "Admin Manager", email: "admin@college.edu", usn: "admin", pwd: "admin", role: "admin", points: 0, referralCode: "ADMIN", refUsed: null }
];

let globalOrders = [];
let notifyRequests = [];
let systemNotifs = [];
let printRequests = [];

// Metrics trackers
let adminNotifsSentCounter = 0;
let cart = [];
let currentUser = null;

// --- Initialization ---
async function syncPointsToDb() {
    if (!currentUser || currentUser.role === 'admin') return;
    try {
        await fetch(`${API_URL}/api/update-points`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentUser.email, points: currentUser.points })
        });
    } catch(e) { } // Fire and forget background sync
}

document.addEventListener('DOMContentLoaded', () => {
    const saved = sessionStorage.getItem('StoreCurrentUser');
    if (saved) {
        currentUser = JSON.parse(saved);
        // Sync UI for current user role IMMEDIATELY so they don't see the wrong dash or empty links
        setupEnvironment(); 

        // Background Sync: Refresh all data collections
        Promise.all([
            fetchProductsFromDB(), // Added back!
            refreshUsersDatabase(), 
            refreshOrdersDatabase(), 
            refreshNotificationsDatabase(), 
            refreshPrintsDatabase()
        ]).catch(err => console.error("Initial Sync Issue", err));
        
        // Hide auth if our early inline script didn't catch it for some reason
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
    } else {
        // No session, show the login UI
        document.documentElement.classList.remove('is-authenticated');
        document.getElementById('authSection').classList.add('active');
        document.getElementById('authSection').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }

    // Health Check: Verify Backend Sync
    console.log(`🔍 Checking Sync Connection with ${API_URL}...`);
    fetch(`${API_URL}/api/products`).then(r => {
        if(r.ok) console.log("✅ Sync Connection established successfully!");
        else console.error("❌ Sync Connection failed: Backend returned an error.");
    }).catch(e => {
        console.error("❌ Sync Connection CRITICAL ERROR: Backend seems to be OFFLINE. Please run 'node server.js' in the backend directory.");
        showToast("Backend connection failed! Is the server running?", "error");
    });

    // Dynamic Multi-Tab Polling Sync
    setInterval(() => {
        if (currentUser) {
            fetchProductsFromDB(); // Real-time stock sync
            refreshOrdersDatabase();
            refreshUsersDatabase(); // Sync points & leaderboard real-time
            if (currentUser.role === 'admin') refreshAdminAnalytics(); 
            refreshNotificationsDatabase();
            refreshPrintsDatabase();
        }
    }, 5000);

    const printInputs = ['printTotalPages', 'printPages', 'printCopies', 'printFormatType'];
    printInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.oninput = updatePrintPricePreview;
    });
    updatePrintPricePreview();
});

// Click away listener for dropdowns
document.addEventListener('click', (e) => {
    const isAcc = e.target.closest('.account-icon');
    const isNotif = e.target.closest('.notification-icon');

    if (!isAcc) {
        let accDrop = document.getElementById('accountDropdown');
        if (accDrop && accDrop.classList.contains('active')) accDrop.classList.remove('active');
    }
    if (!isNotif) {
        let notifDrop = document.getElementById('notifDropdown');
        if (notifDrop && notifDrop.classList.contains('active')) notifDrop.classList.remove('active');
    }
});

// --- Auth System ---
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));

    if (tab === 'login') {
        document.getElementById('tabLogin').classList.add('active');
        document.getElementById('loginForm').classList.add('active');
    } else {
        document.getElementById('tabSignup').classList.add('active');
        document.getElementById('signupForm').classList.add('active');
    }
}


async function handleLogin(e) {
    e.preventDefault();
    const loginId = document.getElementById('loginId').value.trim();
    const loginPwd = document.getElementById('loginPwd').value;

    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginId, pwd: loginPwd })
        });

        const data = await response.json();
        if (response.ok) {
            // FIX #1: API /api/login returns no 'message' field — use a default string
            showToast(data.message || "Login successful!", "success");
            loginUser(data.user);
        } else {
            showToast(data.error || "Invalid credentials.", "error");
        }
    } catch (err) {
        showToast("Backend Server is Offline!", "error");
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const usn = document.getElementById('regUsn').value.trim();
    const pwd = document.getElementById('regPwd').value;
    const refCode = document.getElementById('regReferral').value.trim().toUpperCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast("Please use a valid email address.", "error"); return;
    }

    try {
        const response = await fetch(`${API_URL}/api/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, usn, pwd, refCode })
        });

        const data = await response.json();
        if (response.ok) {
            showToast(data.message, "success");
            loginUser(data.user);
        } else {
            showToast(data.error, "error");
        }
    } catch (err) {
        showToast("Cannot speak to the Backend!", "error");
    }
}

function generateReferralCode(name) {
    const prefix = name.substring(0, 4).toUpperCase().replace(/\s/g, '');
    const rand = Math.floor(100 + Math.random() * 900);
    return `${prefix}${rand}`;
}

async function refreshUsersDatabase() {
    try {
        const response = await fetch(`${API_URL}/api/users`);
        if (response.ok) {
            const dbUsers = await response.json();
            const admin = { name: "Admin Manager", email: "admin@college.edu", usn: "admin", pwd: "admin", role: "admin", points: 0, referralCode: "ADMIN", refUsed: null };
            usersDB = [admin, ...dbUsers]; // Re-sync the core array instantly
            
            if (currentUser && currentUser.role === 'student') {
                const liveSync = usersDB.find(u => u.email === currentUser.email);
                if (liveSync) {
                    currentUser.points = liveSync.points;
                    sessionStorage.setItem('StoreCurrentUser', JSON.stringify(currentUser));
                    renderLeaderboard();
                    if (document.getElementById('accountDropdown').classList.contains('active')) renderAccountDropdown();
                } else {
                    // Critical security: User exists in local storage but not in DB (deleted)
                    console.warn("Account terminated. Logging out...");
                    logout(); 
                }
            }
            if (currentUser && currentUser.role === 'admin') updateAdminDashboard();
        }
    } catch(err) {
        console.error("Leaderboard Sync Failed", err);
    }
}

async function refreshOrdersDatabase() {
    try {
        const response = await fetch(`${API_URL}/api/orders`);
        if (response.ok) {
            globalOrders = await response.json();
            if (currentUser && currentUser.role === 'student') updateStudentDashboard();
            if (currentUser && currentUser.role === 'admin') updateAdminDashboard();
        }
    } catch(err) {
        console.error("Orders Sync Failed", err);
    }
}

async function refreshNotificationsDatabase() {
    try {
        const response = await fetch(`${API_URL}/api/notifications`);
        if (response.ok) {
            const fetched = await response.json();
            if (JSON.stringify(fetched) !== JSON.stringify(systemNotifs)) {
                // FIX #3: Also match notifications broadcast to 'all' users
                const newForMe = fetched.filter(f =>
                    (f.userId === currentUser.email || f.userId === 'all') &&
                    !systemNotifs.some(old => old.id === f.id)
                );
                const isInitialLoad = systemNotifs.length === 0;
                systemNotifs = fetched;

                updateNotificationsBadge();
                if (document.getElementById('notifDropdown').classList.contains('active')) renderNotifDropdown();

                if (!isInitialLoad) {
                    newForMe.forEach(n => {
                        if (n.alertStr) {
                            try { triggerVisualAlertModal(JSON.parse(n.alertStr)); }
                            catch(parseErr) { showToast(`New Alert: ${n.title}`, 'info'); }
                        } else {
                            showToast(`New Alert: ${n.title}`, 'info');
                        }
                    });
                }
            }
        }
    } catch(err) { /* Silently fail for background polling */ }
}

async function refreshPrintsDatabase() {
    try {
        const response = await fetch(`${API_URL}/api/prints`);
        if (response.ok) {
            printRequests = await response.json();
            if (currentUser && currentUser.role === 'student') updatePrintUI();
            if (currentUser && currentUser.role === 'admin') updateAdminDashboard();
        }
    } catch(err) {}
}

function loginUser(user) {
    currentUser = user;
    sessionStorage.setItem('StoreCurrentUser', JSON.stringify(user));
    
    document.getElementById('authSection').classList.remove('active');
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    
    // Auto-sync the frontend database array right before rendering!
    Promise.all([refreshUsersDatabase(), refreshOrdersDatabase(), refreshNotificationsDatabase(), refreshPrintsDatabase()]).then(() => {
        setupEnvironment();
    });
    
    document.getElementById('loginForm').reset();
    document.getElementById('signupForm').reset();
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('StoreCurrentUser');
    document.documentElement.classList.remove('is-authenticated'); // Remove flicker-fix
    cart = [];
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('authSection').classList.add('active');
    document.getElementById('authSection').style.display = 'flex';
    closeAllModals();
    showToast("Logged out successfully", "info");
}

function setupEnvironment() {
    const navLinks = document.getElementById('navLinks');

    if (currentUser.role === 'admin') {
        navLinks.innerHTML = `
            <a href="#" class="active" onclick="showSection('admin')">Admin Panel</a>
        `;
        document.getElementById('studentNavIcons').style.display = 'none';
        document.getElementById('adminNavIcons').style.display = 'flex';
        document.getElementById('bellIcon').style.display = 'none';
        showSection('admin');
        updateAdminDashboard();
    } else {
        navLinks.innerHTML = `
            <a href="#" class="active" onclick="showSection('home')">Home</a>
            <a href="#" onclick="scrollToProducts()">Products</a>
            <a href="#" onclick="showSection('dashboard')">Timeline</a>
            <a href="#" onclick="showSection('printSection')"><i class="fas fa-print"></i> Print</a>
        `;
        document.getElementById('studentNavIcons').style.display = 'flex';
        document.getElementById('adminNavIcons').style.display = 'none';
        document.getElementById('bellIcon').style.display = 'flex';

        document.getElementById('heroName').textContent = currentUser.name.split(" ")[0];

        showSection('home');
        renderCatalog(products);
        renderBundles();
        renderLeaderboard();
        updateStudentDashboard();
        if (typeof updatePrintUI === 'function') updatePrintUI();
    }

    updateNotificationsBadge();
}

function showSection(sectionId) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    const secEl = document.getElementById(sectionId);
    if (!secEl) { console.error('Section not found:', sectionId); return; }
    secEl.classList.add('active');

    // FIX #2: Guard against nav links without onclick attribute (e.g. after partial re-render)
    document.querySelectorAll('.nav-links a').forEach(a => {
        a.classList.remove('active');
        const onclickAttr = a.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(sectionId)) a.classList.add('active');
    });

    closeAllModals();
    window.scrollTo(0, 0);
}

function scrollToProducts() {
    if (currentUser.role !== 'student') return;
    showSection('home');
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    document.querySelector('.nav-links a[onclick="scrollToProducts()"]').classList.add('active');
    setTimeout(() => {
        document.getElementById('products-section').scrollIntoView({ behavior: 'smooth' });
    }, 50);
}

// --- Dynamic Account UI ---
function toggleAccountDropdown(e) {
    if (e) e.stopPropagation();
    const drop = document.getElementById('accountDropdown');
    document.getElementById('notifDropdown').classList.remove('active');

    drop.classList.toggle('active');
    if (drop.classList.contains('active')) renderAccountDropdown();
}

function renderAccountDropdown() {
    const acc = document.getElementById('accountDropdown');
    const myOrders = globalOrders.filter(o => o.userId === currentUser.email).length;
    const dpInitials = currentUser.name.substring(0, 2).toUpperCase();

    acc.innerHTML = `
        <div class="acc-header">
            <div class="acc-avatar">${dpInitials}</div>
            <div>
                <div class="font-bold" style="color: var(--text-main); font-size:1.05rem;">${currentUser.name}</div>
                <div class="text-sm text-muted">${currentUser.email}</div>
            </div>
        </div>
        <div class="acc-body">
            <div class="acc-stat">
                <span class="text-muted"><i class="fas fa-coins text-warning"></i> Reward Points</span> 
                <strong class="text-warning" style="font-size:1.1rem;">${currentUser.points}</strong>
            </div>
            <div class="acc-stat">
                <span class="text-muted"><i class="fas fa-box text-primary"></i> Lifetime Orders</span> 
                <strong>${myOrders}</strong>
            </div>
            <div style="margin-top: 0.5rem;">
                <span class="text-sm font-bold text-main" style="display:block; margin-bottom:0.25rem;">Your Referral Code</span>
                <span class="text-muted text-sm pb-1">Share to earn 50 Bonus Pts!</span>
                <div class="ref-box">
                    <strong>${currentUser.referralCode}</strong>
                    <button class="btn-icon-copy" onclick="copyReferral()" title="Copy Code"><i class="fas fa-copy"></i></button>
                    <button class="btn-icon-copy text-success" onclick="shareReferral()" title="Share"><i class="fas fa-share-alt"></i></button>
                </div>
            </div>
        </div>
        <div class="acc-footer">
            <button class="btn btn-outline w-100" onclick="showSection('dashboard'); document.getElementById('accountDropdown').classList.remove('active');">History</button>
            <button class="btn btn-danger w-100" onclick="logout()">Logout</button>
        </div>
    `;
}

function copyReferral() {
    navigator.clipboard.writeText(currentUser.referralCode);
    showToast("Referral code copied!", "success");
}
function shareReferral() {
    showToast(`Shared Code: ${currentUser.referralCode}. Simulated sharing!`, "info");
}

// --- Top Earners / Leaderboard ---
function renderLeaderboard() {
    const lbEl = document.getElementById('leaderboardList');
    const students = usersDB.filter(u => u.role === 'student').sort((a, b) => b.points - a.points);

    lbEl.innerHTML = students.slice(0, 5).map((user, idx) => {
        const isMe = user.email === currentUser.email;
        let rClass = `rank-${idx + 1}`;
        let badge = idx === 0 ? "<span style='color: #D97706;'><i class='fas fa-crown'></i></span>" : (idx === 1 ? "🥈" : (idx === 2 ? "🥉" : ""));
        return `
            <div class="leaderboard-item ${idx < 3 ? rClass : ''}" style="${isMe ? 'border: 2px solid var(--primary);' : ''}">
                <div class="leaderboard-rank">#${idx + 1}</div>
                <div class="leaderboard-details">
                    <span class="leaderboard-name">${isMe ? 'You' : user.name} <span class="text-sm ml-2">${badge}</span></span>
                    <span class="leaderboard-pts">${user.points} pts</span>
                </div>
            </div>
        `;
    }).join('');
}


// --- Catalog Systems ---
function filterProducts() {
    const bFilter = document.getElementById('branchFilter');
    const sFilter = document.getElementById('semesterFilter');
    if (!bFilter || !sFilter) {
        renderCatalog(products);
        return;
    }

    const branch = bFilter.value;
    const sem = sFilter.value;
    let filtered = products;
    if (branch !== 'All') filtered = filtered.filter(p => p.branch === 'All' || p.branch === branch);
    if (sem !== 'All') filtered = filtered.filter(p => p.semester === 'All' || p.semester === sem);
    renderCatalog(filtered);
}

function renderCatalog(items) {
    const grid = document.getElementById('catalogGrid');
    if (items.length === 0) {
        grid.innerHTML = '<p class="text-muted w-100 text-center" style="grid-column: 1/-1; padding: 2rem;">No items found matching filters.</p>';
        return;
    }

    grid.innerHTML = items.map(p => {
        const outOfStock = p.stock <= 0;
        let actionBtn = outOfStock
            ? `<button class="btn btn-outline text-sm w-100" onclick="notifyMe(${p.id})"><i class="fas fa-bell"></i> Notify Me</button>`
            : `<button class="btn btn-primary text-sm w-100" onclick="addToCart(${p.id})"><i class="fas fa-cart-plus"></i> Add to Cart</button>`;

        if (outOfStock && notifyRequests.some(r => r.userId === currentUser.email && r.productId === p.id)) {
            actionBtn = `<button class="btn btn-disabled text-sm w-100" disabled><i class="fas fa-check"></i> Request Saved</button>`;
        }

        return `
            <div class="card">
                <div class="card-img">${p.img}</div>
                <div class="card-body">
                    <span class="card-category">${p.category} | Sem: ${p.semester}</span>
                    <h3 class="card-title">${p.name}</h3>
                    <p class="card-price pb-1">₹${p.price}</p>
                    <div class="stock-status ${outOfStock ? 'out-of-stock mb-1' : 'in-stock mb-1'}">
                        ${outOfStock ? '<i class="fas fa-times-circle"></i> Out of Stock' : `<i class="fas fa-check-circle"></i> In Stock (${p.stock})`}
                    </div>
                </div>
                <div class="card-footer" style="padding: 1rem;">
                    ${actionBtn}
                </div>
            </div>
        `;
    }).join('');
}

function renderBundles() {
    const grid = document.getElementById('bundlesGrid');
    grid.innerHTML = bundles.map(b => `
        <div class="card" style="border: 1px solid var(--success); background: #F0FDF4;">
            <div class="card-img" style="background: transparent; font-size: 4.5rem;">${b.img}</div>
            <div class="card-body text-center">
                <h3 class="card-title text-success">${b.name}</h3>
                <p class="text-sm text-muted mb-1 flex-grow font-bold" style="line-height:2;">${b.items.join(', ')}</p>
                <div class="mb-2 mt-1">
                    <span class="text-muted" style="text-decoration: line-through;">₹${b.originalPrice}</span>
                    <span class="card-price ml-2 font-bold" style="font-size: 1.5rem;">₹${b.price}</span>
                </div>
                <button class="btn btn-success w-100" onclick="addBundleToCart('${b.id}')"><i class="fas fa-cart-plus"></i> Add Bundle</button>
            </div>
        </div>
    `).join('');
}

// --- Cart System ---
function toggleCart() {
    if (currentUser.role !== 'student') return;
    document.getElementById('cartSidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    document.getElementById('cartSidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('active');
}

function addToCart(productId, qty = 1) {
    if (currentUser.role !== 'student') return;
    const p = products.find(prod => prod.id === productId);
    if (!p || p.stock < qty) return;

    const existing = cart.find(item => item.id === productId && !item.isBundle);
    if (existing) {
        if (existing.qty + qty <= p.stock) existing.qty += qty;
        else { showToast("Stock limit reached!", "error"); return; }
    } else {
        cart.push({ ...p, qty: qty, isBundle: false });
    }
    updateCartUI();
    showToast(`Added ${p.name} to cart`, "success");
}

function addBundleToCart(bundleId) {
    if (currentUser.role !== 'student') return;
    const b = bundles.find(bu => bu.id === bundleId);
    if (!b) return;
    const existing = cart.find(item => item.id === bundleId && item.isBundle);
    if (existing) existing.qty += 1;
    else cart.push({ ...b, qty: 1, isBundle: true });

    updateCartUI();
    showToast(`Added ${b.name} to cart`, "success");
}

function updateCartUI() {
    if (currentUser.role !== 'student') return;
    const cartItemsEl = document.getElementById('cartItems');
    const cartCountEl = document.getElementById('cartCount');
    const cartTotalEl = document.getElementById('cartTotalPrice');
    const checkoutBtn = document.getElementById('checkoutBtn');

    if (cart.length === 0) {
        cartItemsEl.innerHTML = `<p class="text-center text-muted p-2" style="padding-top:2rem;">Your cart is empty.</p>`;
        cartCountEl.textContent = '0';
        cartTotalEl.textContent = '0';
        checkoutBtn.classList.add('btn-disabled'); return;
    }

    checkoutBtn.classList.remove('btn-disabled');
    let total = 0, count = 0;

    cartItemsEl.innerHTML = cart.map((item, index) => {
        total += item.price * item.qty; count += 1;
        const isPrint = item.isPrint;
        return `
            <div class="cart-item" style="${isPrint ? 'border-left: 4px solid var(--primary);' : ''}">
                <div class="cart-item-img">${isPrint ? '<i class="fas fa-print"></i>' : item.img}</div>
                <div class="cart-item-details">
                    <p class="cart-item-title">${item.name}</p>
                    ${isPrint ? `<p class="text-xs text-muted mb-1">${item.pages} pgs, ${item.copies} copies, ${item.format}</p>` : ''}
                    <p class="text-primary font-bold">₹${item.price}</p>
                    <div class="cart-item-qty">
                        ${!isPrint ? `
                            <button class="qty-btn" onclick="updateQty(${index}, -1)">-</button>
                            <span style="width: 20px; text-align:center;">${item.qty}</span>
                            <button class="qty-btn" onclick="updateQty(${index}, 1)">+</button>
                        ` : `
                            <span class="text-sm text-muted">Fixed Print Task</span>
                        `}
                        <!-- FIX #4: Use removeFromCart() to avoid stale index bug when splice shifts remaining indices -->
                        <button class="btn btn-icon ml-auto text-danger" onclick="removeFromCart(${index})"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    cartCountEl.textContent = count;
    cartTotalEl.textContent = total;
    updatePrintUI();
}

// FIX #4: Safe cart item removal — rebuilds array to avoid stale index issues
function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
}

function updateQty(index, delta) {
    const item = cart[index];
    if (item.qty + delta > 0) {
        if (!item.isBundle) {
            const p = products.find(prod => prod.id === item.id);
            if (p && item.qty + delta > p.stock) { showToast("Maximum stock limit reached", "error"); return; }
        }
        item.qty += delta;
    } else cart.splice(index, 1);
    updateCartUI();
}

function proceedToCheckout() {
    if (cart.length === 0) return;
    closeAllModals();
    let total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    // Reward System check
    if (currentUser.points >= 300 && total > 30) {
        document.getElementById('rewardRedemptionContainer').style.display = 'block';
    } else {
        document.getElementById('rewardRedemptionContainer').style.display = 'none';
    }
    document.getElementById('useRewardPoints').checked = false;
    document.getElementById('checkoutAmount').textContent = total;

    document.getElementById('overlay').classList.add('active');
    document.getElementById('checkoutModal').classList.add('active');
}

function updateCheckoutTotal() {
    let total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    if (document.getElementById('useRewardPoints').checked) {
        total -= 30;
    }
    document.getElementById('checkoutAmount').textContent = Math.max(0, total);
}

// ------ ORDER PROCESSING & LOGICKING ------
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function getGenerateOrderId(usnText) {
    let date = new Date().getDate().toString().padStart(2, '0');
    let dept = "XX";
    let last3 = "000";
    if (usnText && usnText.length >= 3) {
        last3 = usnText.slice(-3);
        let remainder = usnText.slice(0, -3);
        let letters = remainder.match(/[A-Za-z]+/g);
        if (letters && letters.length > 0) {
            dept = letters[letters.length - 1].toUpperCase();
            if (dept.length > 2) dept = dept.substring(0, 2);
        }
    }
    let prefix = `${date}${dept}${last3}`;
    let todayOrders = globalOrders.filter(o => o.id && o.id.toString().startsWith(prefix));
    let counter = todayOrders.length + 1;
    return `${prefix}${counter}`;
}

function processPayment(event) {
    event.preventDefault();
    const timeSlot = document.getElementById('pickupTime').value;

    let isRedeeming = document.getElementById('useRewardPoints').checked;
    let baseTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    let total = baseTotal;

    if (isRedeeming) {
        total -= 30;
        currentUser.points -= 300;
        sessionStorage.setItem('StoreCurrentUser', JSON.stringify(currentUser));
        showToast("Redeemed 300 points for ₹30 discount!", "success");
        // Notify admin about reward redemption
        pushSystemNotification('admin@college.edu', 'Reward Redemption Alert', `${currentUser.name} (${currentUser.usn}) redeemed 300 points for ₹30 discount on Checkout.`);
    }

    const orderId = getGenerateOrderId(currentUser.usn);
    const pointsEarned = Math.floor(total * 0.05);

    // Deduct stock
    cart.forEach(item => {
        if (!item.isBundle) {
            let p = products.find(prod => prod.id === item.id);
            if (p) p.stock -= item.qty;
        }
    });

    const newOrder = {
        id: orderId, userId: currentUser.email, userName: currentUser.name, usn: currentUser.usn,
        items: [...cart], total, date: new Date().toLocaleString(), slot: timeSlot, points: pointsEarned,
        status: 'Placed', redeemedPoints: isRedeeming,
        hasPrint: cart.some(i => i.isPrint)
    };

    globalOrders.push(newOrder);
    
    const printsToSave = cart.filter(i => i.isPrint);
    
    // Save Order and potentially split out Print Requests
    fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrder)
    }).then(res => res.json()).then(d => {
        if(d.success) {
            fetchProductsFromDB(); 
            // Save Prints automatically if they exist in the order
            printsToSave.forEach((pr, index) => {
                const printObj = { ...pr, id: `${orderId}-P${index + 1}`, userId: currentUser.email, orderId: orderId, status: 'Placed', date: new Date().toLocaleDateString() };
                fetch(`${API_URL}/api/prints`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(printObj)
                }).then(() => refreshPrintsDatabase());
            });
        }
    }).catch(e => console.error(e));

    currentUser.points += pointsEarned;
    sessionStorage.setItem('StoreCurrentUser', JSON.stringify(currentUser));

    cart = [];
    document.getElementById('checkoutForm').reset();
    updateCartUI();
    renderCatalog(products);
    updateStudentDashboard();
    renderLeaderboard();

    closeAllModals();
    showToast(`Payment successful! Order #${orderId} confirmed. Earned ${pointsEarned} pts.`, "success");
}

// -- Flexible Reorder Engine --
let tempReorderCart = [];

function openReorderModal(orderId) {
    const order = globalOrders.find(o => o.id === orderId);
    if (!order) return;

    tempReorderCart = order.items.map(i => ({ ...i }));

    document.getElementById('overlay').classList.add('active');
    document.getElementById('reorderModal').classList.add('active');
    renderReorderSummary(order, orderId);
}

function tempReorderUpdateQty(idx, delta, oId) {
    let item = tempReorderCart[idx];
    if (delta === -999) {
        tempReorderCart.splice(idx, 1);
    } else {
        item.qty += delta;
        if (item.qty <= 0) tempReorderCart.splice(idx, 1);
    }
    renderReorderSummary(globalOrders.find(o => o.id === oId), oId);
}

function tempReorderAddItem(oId) {
    let pId = parseInt(document.getElementById('reorderAddItemSelect').value);
    let p = products.find(prod => prod.id === pId);
    if (!p) return;
    let existing = tempReorderCart.find(i => i.id === pId && !i.isBundle);
    if (existing) {
        existing.qty += 1;
    } else {
        tempReorderCart.push({ ...p, qty: 1, isBundle: false });
    }
    renderReorderSummary(globalOrders.find(o => o.id === oId), oId);
}

function renderReorderSummary(originalOrder, orderId) {
    let currentTotal = tempReorderCart.reduce((s, i) => s + (i.price * i.qty), 0);
    let diff = currentTotal - originalOrder.total;
    let diffText = diff >= 0 ? `+ ₹${diff}` : `- ₹${Math.abs(diff)}`;

    let html = tempReorderCart.map((i, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; border-bottom:1px solid #eee; padding-bottom:0.25rem;">
            <div style="flex:1;">
                <span class="text-sm font-bold">${i.name}</span>
                <span class="text-sm text-primary d-block">₹${i.price} each</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <button class="btn btn-outline" style="padding:0.2rem 0.6rem;" onclick="tempReorderUpdateQty(${idx}, -1, '${orderId}')">-</button>
                <span style="width:20px; text-align:center; font-weight:bold;">${i.qty}</span>
                <button class="btn btn-outline" style="padding:0.2rem 0.6rem;" onclick="tempReorderUpdateQty(${idx}, 1, '${orderId}')">+</button>
                <button class="btn btn-danger" style="padding:0.2rem 0.5rem;" onclick="tempReorderUpdateQty(${idx}, -999, '${orderId}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');

    let addHtml = `
        <div style="margin-top:1rem; padding-top:1rem; border-top:1px dashed var(--border);">
            <label class="text-sm font-bold">Add New Item</label>
            <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                <select id="reorderAddItemSelect" style="flex:1; padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
                    ${products.filter(p => p.stock > 0).map(p => `<option value="${p.id}">${p.name} (₹${p.price})</option>`).join('')}
                </select>
                <button class="btn btn-success" onclick="tempReorderAddItem('${orderId}')">Add</button>
            </div>
        </div>
    `;

    html += addHtml;
    html += `<div style="margin-top:1rem; border-top:1px dashed var(--border); padding-top:0.75rem; text-align:right;">
        <strong>Original Total:</strong> ₹${originalOrder.total}<br>
        <strong>Net Adjustment:</strong> <span class="${diff >= 0 ? 'text-primary' : 'text-danger'}">${diffText}</span><br>
        <strong class="text-primary" style="font-size:1.1rem;">New Grand Total: ₹${currentTotal}</strong>
    </div>`;

    document.getElementById('reorderSummary').innerHTML = html;

    const confirmBtn = document.getElementById('reorderConfirmBtn');
    confirmBtn.onclick = () => processReorderFlex(orderId, currentTotal);
}

function processReorderFlex(orderId, newTotal) {
    const order = globalOrders.find(o => o.id === orderId);
    if (!order) return;

    if (tempReorderCart.length === 0) {
        showToast("Order cannot be empty. Use cancel instead.", "error"); return;
    }

    let canUpdate = true;
    tempReorderCart.forEach(i => {
        if (!i.isBundle) {
            let p = products.find(prod => prod.id === i.id);
            let originalQty = order.items.find(oi => oi.id === i.id && !oi.isBundle)?.qty || 0;
            let netAdd = i.qty - originalQty;
            if (p && p.stock < netAdd) canUpdate = false;
        }
    });

    if (!canUpdate) {
        showToast(`Insufficient stock for some updated items.`, "error"); return;
    }

    order.items.forEach(i => {
        if (!i.isBundle) {
            let p = products.find(prod => prod.id === i.id);
            if (p) p.stock += i.qty;
        }
    });

    tempReorderCart.forEach(i => {
        if (!i.isBundle) {
            let p = products.find(prod => prod.id === i.id);
            if (p) p.stock -= i.qty;
        }
    });

    let diff = newTotal - order.total;
    let extraPoints = diff > 0 ? Math.floor(diff * 0.05) : 0;

    if (diff < 0) {
        let revPoints = Math.floor(Math.abs(diff) * 0.05);
        currentUser.points = Math.max(0, currentUser.points - revPoints);
    } else {
        currentUser.points += extraPoints;
        order.points += extraPoints;
    }

    order.items = [...tempReorderCart];
    order.total = newTotal;
    order.modified = true; // Flag for admin highlighting

    // FIX #5: Was using localStorage — must use sessionStorage for consistency with loginUser()
    sessionStorage.setItem('StoreCurrentUser', JSON.stringify(currentUser));
    fetch(`${API_URL}/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
    }).catch(e => console.error(e));

    pushSystemNotification('admin@college.edu', 'Order Updated', `Critical: ${currentUser.name} modified Order #${orderId} remotely.`);
    updateStudentDashboard();
    renderCatalog(products);
    closeAllModals();
    showToast(`Order Updated Successfully! New Total: ₹${order.total}`, "success");
}

// -- Math Penalty Refund Cancellation Engine --
function openCancelModal(orderId) {
    const order = globalOrders.find(o => o.id === orderId);
    if (!order) return;

    let total = order.total;
    let feePercent = 0.05;
    if (order.status === 'Ready') {
        if (total <= 200) feePercent = 0.10;
        else if (total <= 500) feePercent = 0.12;
        else feePercent = 0.15;
    }

    let fee = parseFloat((total * feePercent).toFixed(2));
    let refund = parseFloat((total - fee).toFixed(2));

    const modal = document.getElementById('cancelModal');

    document.getElementById('cancelSummary').innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;"><span>Order Total Evaluated:</span> <span>₹${total}</span></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem; color:#DC2626;"><span>Processing Fee (${(feePercent * 100).toFixed(0)}%):</span> <span>-₹${fee}</span></div>
        <div style="display:flex; justify-content:space-between; border-top: 1px dashed #FCA5A5; padding-top: 0.5rem; margin-top: 0.5rem; font-size:1.15rem; font-weight:700;"><span>Refund Amount Value:</span> <span>₹${refund}</span></div>
    `;

    const confirmBtn = document.getElementById('cancelConfirmBtn');
    confirmBtn.onclick = () => processCancelOrder(orderId, fee, refund);

    document.getElementById('overlay').classList.add('active');
    modal.classList.add('active');
}

function processCancelOrder(orderId, fee, refund) {
    const order = globalOrders.find(o => o.id === orderId);
    if (!order) return;

    // Returning physical inventory parameters 
    order.items.forEach(i => {
        if (!i.isBundle) {
            let p = products.find(prod => prod.id === i.id);
            if (p) p.stock += i.qty;
        }
    });

    // Strip Gamification bounds
    currentUser.points -= order.points;
    if (currentUser.points < 0) currentUser.points = 0;

    // Mutate state correctly securely
    order.status = 'Cancelled';

    // FIX #6: Was using localStorage — must use sessionStorage for consistency with loginUser()
    sessionStorage.setItem('StoreCurrentUser', JSON.stringify(currentUser));
    fetch(`${API_URL}/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
    }).catch(e => console.error(e));

    updateStudentDashboard();
    renderCatalog(products);

    closeAllModals();

    // Visual Modal payload (Refund Breakdown)
    document.getElementById('alertModalContent').innerHTML = `
        <span class="close-modal" onclick="closeAllModals()"><i class="fas fa-times"></i></span>
        <div style="font-size: 3rem; color: #10B981; margin-bottom: 1rem;"><i class="fas fa-hand-holding-usd"></i></div>
        <h2 class="mb-1 text-success">Refund Initiated Successfully</h2>
        <p class="text-muted mb-1 text-sm">Order #${orderId} was cancelled. Inventory physical stock returned securely.</p>
        <div style="background:var(--bg-light); border:1px dashed var(--border); padding: 1rem; border-radius:8px; margin: 1rem 0; text-align: left;">
            <p style="display:flex; justify-content:space-between;"><strong>Order Original Total:</strong> <span>₹${order.total}</span></p>
            <p class="text-danger" style="display:flex; justify-content:space-between; margin-top:0.25rem; border-bottom: 1px dashed #E5E7EB; padding-bottom: 0.5rem;"><strong>Cancellation Processing Tax:</strong> <span>-₹${fee}</span></p>
            <h3 class="text-primary mt-1" style="display:flex; justify-content:space-between;"><span>Bank Credit Valid:</span> <span>₹${refund}</span></h3>
        </div>
        <button class="btn btn-primary w-100" onclick="closeAllModals()">Acknowledge & Mute</button>
    `;

    document.getElementById('overlay').classList.add('active');
    document.getElementById('alertModal').classList.add('active');
}

// --- Dynamic Alert & Notify System Engine --- 
function toggleNotifications(e) {
    if (e) e.stopPropagation();
    const notifDrop = document.getElementById('notifDropdown');
    document.getElementById('accountDropdown').classList.remove('active');

    notifDrop.classList.toggle('active');
    if (notifDrop.classList.contains('active')) renderNotifDropdown();
}

function updateNotificationsBadge() {
    if (!currentUser || currentUser.role !== 'student') return;
    // FIX #7: Also count 'all' broadcast notifications as unread for the current user
    const unread = systemNotifs.filter(n =>
        (n.userId === currentUser.email || n.userId === 'all') && n.unread
    ).length;
    const badge = document.getElementById('notifBadge');
    if (unread > 0) {
        badge.style.display = 'block';
        badge.textContent = unread;
    } else badge.style.display = 'none';
}

function notifyMe(productId) {
    const alreadyReq = notifyRequests.some(r => r.userId === currentUser.email && r.productId === productId);
    if (alreadyReq) { showToast("Request already active.", "info"); return; }

    notifyRequests.push({ userId: currentUser.email, productId: productId });
    showToast("Request noted! Admin alert enabled.", "success");

    renderCatalog(products);
}

function pushSystemNotification(userId, title, desc, triggerAlertObj = null) {
    const notifObj = { id: (Date.now() + Math.random()).toString(), userId, title, desc, unread: true, timestamp: new Date().toLocaleTimeString(), alertStr: triggerAlertObj ? JSON.stringify(triggerAlertObj) : null };
    systemNotifs.push(notifObj);

    fetch(`${API_URL}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifObj)
    }).catch(e=>console.error(e));

    if (currentUser && currentUser.email === userId) {
        updateNotificationsBadge();
        if (triggerAlertObj) triggerVisualAlertModal(triggerAlertObj);
    }
}

function triggerVisualAlertModal(product) {
    document.getElementById('alertModalContent').innerHTML = `
        <span class="close-modal" onclick="closeAllModals()"><i class="fas fa-times"></i></span>
        <div style="font-size: 3rem; color: var(--secondary); margin-bottom: 1rem;"><i class="fas fa-box-open"></i></div>
        <h2 class="mb-1">Item Available!</h2>
        <p class="text-muted mb-2">You requested <strong>${product.name}</strong>. It is now completely back in stock in the main directory.</p>
        <button class="btn btn-primary w-100" onclick="closeAllModals(); scrollToProducts();">View Catalog Directly</button>
    `;
    document.getElementById('overlay').classList.add('active');
    document.getElementById('alertModal').classList.add('active');
}

function renderNotifDropdown() {
    const list = document.getElementById('notifList');
    const myNotifs = systemNotifs.filter(n => n.userId === currentUser.email).reverse();

    if (myNotifs.length === 0) {
        list.innerHTML = `<div class="p-2 text-center text-muted p-2">No new notifications!</div>`;
        return;
    }

    list.innerHTML = myNotifs.map(n => `
        <div class="notif-item ${n.unread ? 'unread' : ''}" onclick="markNotifRead(${n.id})">
            <div style="display:flex; justify-content:space-between;">
                <span class="notif-title">${n.title}</span><span class="text-sm text-muted">${n.timestamp}</span>
            </div>
            <span class="notif-desc">${n.desc}</span>
        </div>
    `).join('');
}

function markNotifRead(id) {
    const n = systemNotifs.find(not => not.id == id);
    if (n) {
        n.unread = false;
        fetch(`${API_URL}/api/notifications/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(n)
        }).catch(e=>console.error(e));
    }
    updateNotificationsBadge();
    renderNotifDropdown();
}

// Admin Trigger Engine
function simulateStockRestock(productId) {
    const p = products.find(prod => prod.id === productId);
    if (!p) return;

    p.stock += 50;

    const reqs = notifyRequests.filter(r => r.productId === productId);

    if (reqs.length > 0) {
        reqs.forEach(req => {
            pushSystemNotification(req.userId, "Item Back In Stock!", `${p.name} is available now.`, p);
            adminNotifsSentCounter++;
        });
        showToast(`Stocked +50 units. Sent ${reqs.length} tracking notifications!`, "success");
    } else {
        showToast(`Stocked +50 units. Check registry parameters.`, "info");
    }

    notifyRequests = notifyRequests.filter(r => r.productId !== productId);

    updateAdminDashboard();
    renderCatalog(products);
}

// Admin Trigger Order Life Cycle Hook Native Update
function updateAdminOrderStatus(orderId, newStatus) {
    const order = globalOrders.find(o => o.id === orderId);
    if (!order) return;

    order.status = newStatus;

    fetch(`${API_URL}/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
    }).catch(e => console.error(e));

    if (newStatus === 'Accepted') {
        pushSystemNotification(order.userId, `Order Lifecycle Update: Accepted`, `Your order #${orderId} has been successfully received and accepted by the operator. It is now actively in preparation queue.`);
    } else if (newStatus === 'Ready') {
        pushSystemNotification(order.userId, `Order Lifecycle Update: Collection Ready!`, `Good news! Your order #${orderId} is entirely prepared and packed. Waiting at collection bounds for slot: ${order.slot}.`);
    } else if (newStatus === 'Completed') {
        pushSystemNotification(order.userId, `Order Successfully Completed!`, `Thank you for shopping at CampusBook! Your order #${orderId} has been securely handed over to you. Have a great semester ahead!`);
    }

    showToast(`Order #${orderId} securely pushed to ${newStatus}. User notification pinged remotely.`, "success");
    updateAdminDashboard();
}

// --- Dashboards ---
function updateStudentDashboard() {
    if (currentUser.role !== 'student') return;
    syncPointsToDb(); // Securely backup the student's entire points map back to MongoDB!


    const myOrders = globalOrders.filter(o => o.userId === currentUser.email);
    const historyEl = document.getElementById('purchaseHistory');
    if (myOrders.length === 0) {
        historyEl.innerHTML = `<div class="text-center text-muted p-2 w-100">No purchase tracking history initialized locally.</div>`;
        return;
    }

    let timelines = ['Placed', 'Accepted', 'Ready', 'Completed'];

    historyEl.innerHTML = myOrders.slice().reverse().map(order => {
        let timelineHtml = '';
        let actionButtons = '';

        if (order.status === 'Cancelled') {
            timelineHtml = `<div class="badge-status bg-Cancelled mt-2 w-100" style="display:flex; justify-content:center; gap:0.5rem; font-size: 0.85rem; padding:0.5rem;"><i class="fas fa-times-circle"></i> Transaction Closed & Refund Math Applied</div>`;
        } else {
            let currentIdx = timelines.indexOf(order.status);
            timelineHtml = `<div class="timeline">`;
            timelines.forEach((step, idx) => {
                let stateClass = '';
                if (idx < currentIdx) stateClass = 'completed';
                else if (idx === currentIdx) stateClass = 'active';

                let icon = 'fa-file-invoice';
                if (step === 'Accepted') icon = 'fa-check-circle';
                if (step === 'Ready') icon = 'fa-box-open';
                if (step === 'Completed') icon = 'fa-flag-checkered';

                timelineHtml += `
                <div class="timeline-step ${stateClass}">
                    <i class="fas ${icon}"></i>
                    <div class="timeline-label">${step}</div>
                </div>`;
            });
            timelineHtml += `</div>`;
        }

        if (order.status === 'Placed' || order.status === 'Accepted' || order.status === 'Ready') {
            actionButtons = `
             <button class="btn btn-outline text-sm mt-1" onclick="openReorderModal('${order.id}')"><i class="fas fa-redo"></i> Update</button>
             <button class="btn btn-danger-outline text-sm mt-1 ml-2" onclick="openCancelModal('${order.id}')"><i class="fas fa-times"></i> Cancel</button>`;
        }

        return `
            <div class="history-item ${order.status === 'Cancelled' ? 'cancelled' : ''}">
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:1rem;">
                    <div>
                        <h4 style="margin-bottom:0.25rem;">Order #${order.id} 
                            <span class="badge-status bg-${order.status} ml-2">${order.status}</span>
                        </h4>
                        <p class="text-sm text-muted mb-1"><i class="far fa-clock"></i> ${formatDate(order.date)} • <i class="fas fa-map-marker-alt"></i> Slot: ${order.slot}</p>
                        <div class="mt-1" style="display:flex; flex-wrap:wrap; gap:0.5rem;">
                            ${order.items.map(i => `<span class="badge-status" style="background:#EEF2FF; color:var(--primary); border:1px solid #C7D2FE;">${i.name} x${i.qty}</span>`).join('')}
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-primary" style="font-size:1.5rem;">₹${order.total}</p>
                        ${actionButtons}
                    </div>
                </div>
                ${timelineHtml}
            </div>
        `;
    }).join('');
}

function updateAdminDashboard() {
    const todayStr = new Date().toLocaleDateString();
    
    // Today's Sales: Include all non-cancelled orders placed today
    let dailyOrders = globalOrders.filter(o => {
        if (!o.date || o.status === 'Cancelled') return false;
        try {
            const oDate = new Date(o.date).toLocaleDateString();
            const tDate = new Date().toLocaleDateString();
            return oDate === tDate;
        } catch(e) {
            // Fallback to legacy string split if Date parse fails
            return o.date.split(',')[0].trim() === todayStr.split(',')[0].trim();
        }
    });

    const todaySales = dailyOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    // Lifetime Revenue: Sum of ALL non-cancelled orders ever
    const allValidOrders = (globalOrders || []).filter(o => o.status !== 'Cancelled');
    const lifetimeRevenue = allValidOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
    
    document.getElementById('adminTotalSales').textContent = parseFloat(todaySales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    document.getElementById('adminLifetimeRev').textContent = parseFloat(lifetimeRevenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    
    // Count ALL pending orders (including those that are purely prints)
    const activeOrderCount = (globalOrders || []).filter(o => o.status === 'Placed' || o.status === 'Accepted' || o.status === 'Ready').length;
    
    document.getElementById('adminTotalOrders').textContent = activeOrderCount;
    document.getElementById('adminPendingReqs').textContent = (notifyRequests || []).length;
    document.getElementById('adminNotifsSent').textContent = adminNotifsSentCounter || 0;

    // Inventory Sync Table
    document.getElementById('inventoryTable').innerHTML = products.map(p => `
        <tr>
            <td data-label="Product Info"><div style="display:flex; align-items:center; gap:0.5rem;"><span style="font-size: 1.5rem;">${p.img}</span> <strong>${p.name}</strong></div></td>
            <td data-label="Price"><strong class="text-primary">Rs.${p.price}</strong></td>
            <td data-label="Stock/Reqs"><span class="${p.stock < 10 ? 'text-danger font-bold' : ''}">${p.stock} Units</span></td>
            <td data-label="Action"><button class="btn btn-success text-sm" onclick="restockProduct(${p.id}, 50)"><i class="fas fa-plus"></i> Restock +50</button></td>
        </tr>`).join('');

    // Tabbed Order Queue: EXCLUDE orders that are ONLY prints (they stay in Print Queue)
    let queueToDisplay = globalOrders.filter(o => {
        const isPurePrint = (o.items || []).every(item => item.isPrint);
        if (isPurePrint) return false; 
        
        if (adminActiveTab === 'Active') return o.status !== 'Completed' && o.status !== 'Cancelled';
        return o.status === adminActiveTab;
    });

    document.getElementById('adminOrderQueue').innerHTML = queueToDisplay.slice().reverse().map(o => `
        <div class="card p-1 ${o.modified ? 'ping-highlight' : ''}" style="border-left: 4px solid ${o.status === 'Cancelled' ? '#EF4444' : (o.status === 'Completed' ? '#10B981' : 'var(--primary)')};">
            <div style="display:flex; justify-content:space-between; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                <span class="text-primary font-bold">#${o.id}</span>
                <span class="text-sm text-muted">${o.status === 'Completed' && o.completionDate ? `<i class="fas fa-check-circle"></i> ${formatDate(o.completionDate)}` : formatDate(o.date)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                 <div>
                    <p><strong>Student:</strong> ${o.userName} (${o.usn})</p>
                    <p><strong>Slot:</strong> ${o.slot}</p>
                    <div style="margin-top:0.5rem; background:var(--bg-light); border-radius:4px; padding:0.5rem;">
                        <strong class="text-xs text-muted" style="text-transform:uppercase; display:block; margin-bottom:0.25rem;">Items Ordered:</strong>
                        ${(o.items || []).map(item => `
                            <div class="text-sm font-bold" style="display:flex; justify-content:space-between; gap:2rem;">
                                <span>${item.name}</span>
                                <span class="text-primary">x${item.qty}</span>
                            </div>
                        `).join('')}
                    </div>
                    <strong class="text-primary" style="display:block; margin-top:0.5rem; font-size:1.1rem;">Total: Rs.${o.total}</strong>
                 </div>
                 <div style="text-align:right;">
                    ${o.status === 'Cancelled' ? '<span class="badge-status bg-Cancelled">Cancelled</span>' : 
                      o.status === 'Completed' ? '<span class="badge-status bg-Completed">Completed</span>' : `
                      <select class="admin-select bg-${o.status}" onchange="updateAdminOrderStatus('${o.id}', this.value)">
                        <option value="Placed" ${o.status === 'Placed' ? 'selected' : ''}>Placed</option>
                        <option value="Accepted" ${o.status === 'Accepted' ? 'selected' : ''}>Accepted</option>
                        <option value="Ready" ${o.status === 'Ready' ? 'selected' : ''}>Ready</option>
                        <option value="Completed" ${o.status === 'Completed' ? 'selected' : ''}>Completed</option>
                        <option value="Cancelled">Cancel Order</option>
                      </select>`}
                 </div>
            </div>
        </div>
    `).join('') || `<div class="text-center text-muted p-2">No ${adminActiveTab} orders found.</div>`;

    // Tabbed Print Queue
    const printQueueToDisplay = printRequests.filter(r => {
        if (adminPrintActiveTab === 'Active') return r.status !== 'Completed' && r.status !== 'Cancelled';
        return r.status === adminPrintActiveTab;
    });

    document.getElementById('adminPrintQueue').innerHTML = printQueueToDisplay.slice().reverse().map(r => `
        <div class="card p-1" style="border-left: 4px solid var(--accent);">
            <div style="display:flex; justify-content:space-between; margin-bottom: 0.5rem;">
                <span class="text-warning font-bold">#${r.id}</span>
                <span class="text-sm text-muted">${formatDate(r.date)}</span>
            </div>
            <p><strong>User:</strong> ${r.userId.split('@')[0]}</p>
            <p><strong>File:</strong> 
                ${r.fileData ? 
                    `<div style="display:flex; gap:0.5rem; margin-top:0.25rem;">
                        <a href="${r.fileData}" download="${r.fileName}" class="btn btn-outline text-xs"><i class="fas fa-download"></i> Download</a>
                        <button onclick="viewPrintDoc('${r.id}')" class="btn btn-primary text-xs"><i class="fas fa-eye"></i> View & Print</button>
                    </div>` : 
                    `<span class="text-muted"><i class="fas fa-unlink"></i> File Lost or Legacy</span>`
                }
            </p>
            <p><strong>Price Paid:</strong> <strong class="text-success">₹${r.price || 0}</strong></p>
            <p><strong>Config:</strong> ${r.totalPages || '?'} Total Pgs, ${r.pages} Range, ${r.copies} Copies | <strong>${r.format}</strong></p>
            <div style="text-align:right; margin-top:0.75rem;">
                ${r.status === 'Completed' ? '<span class="badge-status bg-Completed">Completed</span>' : 
                  r.status === 'Cancelled' ? '<span class="badge-status bg-Cancelled">Cancelled</span>' : `
                    <select class="admin-select bg-${r.status}" onchange="updateAdminPrintStatus('${r.id}', this.value)">
                        <option value="Placed" ${r.status === 'Placed' ? 'selected' : ''}>Placed</option>
                        <option value="Accepted" ${r.status === 'Accepted' ? 'selected' : ''}>Accepted</option>
                        <option value="Ready" ${r.status === 'Ready' ? 'selected' : ''}>Ready</option>
                        <option value="Completed" ${r.status === 'Completed' ? 'selected' : ''}>Completed</option>
                        <option value="Cancelled" ${r.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>`}
            </div>
        </div>
    `).join('') || `<div class="text-center text-muted p-2">No ${adminPrintActiveTab} requests.</div>`;
}

async function refreshAdminAnalytics() {
    try {
        const response = await fetch(`${API_URL}/api/admin/analytics`);
        if (response.ok) {
            const data = await response.json();
            renderSoldProducts(data.sold);
            renderRedeemTransactions(data.redeems);
            
            // If lifetime revenue is zero in current orders, fallback to analytics total
            const revEl = document.getElementById('adminLifetimeRev');
            if (revEl.textContent === "0" || revEl.textContent === "0.00") {
                revEl.textContent = parseFloat(data.totalSales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
            }
        }
    } catch(err) {}
}

function viewPrintDoc(id) {
    const r = printRequests.find(req => req.id === id);
    if (!r || !r.fileData) return;
    const win = window.open();
    win.document.write('<iframe src="' + r.fileData + '" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>');
}


function renderSoldProducts(soldList) {
    const today = new Date().toLocaleDateString();
    document.getElementById('soldProductsTable').innerHTML = soldList.filter(s => new Date(s.date).toLocaleDateString() === today).map(s => `
        <tr>
            <td data-label="Product Name">${s.productName}</td>
            <td data-label="Quantity Sold" class="font-bold">${s.quantitySold}</td>
            <td data-label="Daily Revenue" class="text-success font-bold">₹${s.revenue}</td>
        </tr>`).join('');
}

function renderRedeemTransactions(redeems) {
    const today = new Date().toLocaleDateString();
    document.getElementById('redeemTransactionsTable').innerHTML = redeems.filter(r => r.date && new Date(r.date).toLocaleDateString() === today).map(r => `
        <tr>
            <td data-label="Order ID">${r.orderId}</td>
            <td data-label="User">${r.userName}</td>
            <td data-label="Discount" class="text-success font-bold">-₹${r.discountAmount}</td>
            <td data-label="Final Price" class="font-bold">₹${r.finalPrice}</td>
        </tr>`).join('');
}

async function restockProduct(id, amount) {
    try {
        const res = await fetch(`${API_URL}/api/products/restock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, amount })
        });
        if (res.ok) {
            showToast(`Restocked +${amount} successfully!`, "success");
            fetchProductsFromDB().then(() => updateAdminDashboard());
            pushSystemNotification('all', 'Inventory Update', `Store Manager restocked items. Check catalog!`);
        }
    } catch(err) { showToast("Restock sync failed", "error"); }
}

async function downloadReport(type) {
    try {
        showToast(`Generating ${type.toUpperCase()}...`, "info");
        const res = await fetch(`${API_URL}/api/admin/reports/${type}`);
        if (!res.ok) throw new Error("Server error");
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `orders_audit_report_${new Date().toISOString().split('T')[0]}.${type}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        showToast("Report downloaded successfully!", "success");
    } catch(e) {
        showToast("Report generation failed!", "error");
    }
}

function calculatePrintCost() {
    const totalPagesInput = document.getElementById('printTotalPages');
    const pagesRange = document.getElementById('printPages').value || '1';
    const copies = parseInt(document.getElementById('printCopies').value) || 1;
    const format = document.getElementById('printFormatType').value || 'Single Side';

    let N = 1;
    if (format.includes("2 per page") || format.includes("Double Side")) N = 2;
    if (format.includes("4 per page")) N = 4;
    
    let pageCount = 1;
    if (pagesRange.toLowerCase() === 'all' || !pagesRange) {
        pageCount = parseInt(totalPagesInput?.value) || 1;
    } else if (pagesRange.includes('-')) {
        const parts = pagesRange.split('-');
        const start = parseInt(parts[0]) || 1;
        const end = parseInt(parts[1]) || 1;
        pageCount = Math.max(1, (end - start) + 1);
    } else {
        pageCount = parseInt(pagesRange) || 1;
    }

    const totalSides = Math.ceil(pageCount / N);
    const totalPrice = totalSides * copies * 1;
    return { totalPrice, totalUnits: totalSides * copies, pageCount };
}

function updatePrintPricePreview() {
    const previewEl = document.getElementById('printPricePreview');
    const unitsEl = document.getElementById('printPreviewSides');
    if (!previewEl || !unitsEl) return;
    
    const { totalPrice, totalUnits } = calculatePrintCost();
    previewEl.textContent = totalPrice;
    unitsEl.textContent = totalUnits;
}

function handlePrintRequest(e) {
    e.preventDefault();
    const fileInput = document.getElementById('printFile');
    const pagesRange = document.getElementById('printPages').value;
    const copies = parseInt(document.getElementById('printCopies').value);
    const format = document.getElementById('printFormatType').value;

    if (!fileInput.files[0]) return;
    const file = fileInput.files[0];
    const fileName = file.name;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        const fileData = event.target.result;
        const { totalPrice } = calculatePrintCost();

        const printItem = {
            name: `Print: ${fileName}`,
            price: totalPrice,
            qty: 1,
            isPrint: true,
            fileName,
            fileData,
            pages: pagesRange,
            totalPages: parseInt(document.getElementById('printTotalPages').value) || 1,
            copies,
            format,
            isBundle: false
        };

        cart.push(printItem);
        updateCartUI();
        document.getElementById('printForm').reset();
        
        // Reset price preview
        const previewEl = document.getElementById('printPricePreview');
        const unitsEl = document.getElementById('printPreviewSides');
        if (previewEl) previewEl.textContent = '0';
        if (unitsEl) unitsEl.textContent = '0';
        
        showToast(`Print Task added (₹${totalPrice})`, "success");
        toggleCart();
    };
    reader.readAsDataURL(file);
}

function pushStandardEval(bundleName, pageCount) {
    const printItem = {
        name: `Eval: ${bundleName}`,
        price: Math.ceil(pageCount / 1) * 1, // Standard evaluation copy pricing (1 side per page)
        qty: 1,
        isPrint: true,
        fileName: `${bundleName}.pdf`,
        pages: `1-${pageCount}`,
        copies: 1,
        format: "Double Side",
        isBundle: false
    };

    cart.push(printItem);
    updateCartUI();
    showToast(`${bundleName} added to cart`, "success");
    toggleCart();
}

function updatePrintUI() {
    const list = document.getElementById('printRequestsList');
    if (!list) return;
    const myReqs = printRequests.filter(r => r.userId === currentUser.email);
    let html = myReqs.slice().reverse().map(r => `
        <div style="background:var(--bg-white); border:1px solid var(--border); padding:1rem; border-radius:var(--radius-md); margin-bottom:0.75rem; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong class="text-primary">${r.id}</strong> - ${r.fileName}
                <div class="text-sm text-muted mt-1">Total Pgs: ${r.totalPages || '?'} | Range: ${r.pages} | Copies: ${r.copies} | Format: <strong>${r.format}</strong></div>
                <div class="text-sm font-bold text-success mt-1">Paid: ₹${r.price || 0}</div>
            </div>
            <div>
                <span class="badge-status bg-${r.status}">${r.status}</span>
            </div>
        </div>
    `).join('');

    if (myReqs.length === 0 && cart.filter(i => i.isPrint).length === 0) {
        list.innerHTML = `<div class="text-center text-muted p-2" style="border: 1px dashed var(--border); border-radius:8px;">No active or pending print requests.</div>`;
        return;
    }

    // Also show items currently in cart but not yet paid (placed)
    const cartPrints = cart.filter(i => i.isPrint);
    if (cartPrints.length > 0) {
        html += `
            <div style="margin-top:1.5rem; border-top: 1px dashed var(--border); padding-top:1rem;">
                <h4 class="text-sm text-muted mb-1"><i class="fas fa-shopping-cart"></i> Pending in Cart (Unpaid)</h4>
                ${cartPrints.map(cp => `
                    <div style="background:rgba(var(--primary-rgb), 0.05); border:1px dashed var(--primary); padding:0.75rem; border-radius:var(--radius-md); margin-bottom:0.5rem; font-size:0.85rem;">
                        <strong>${cp.name}</strong> - ₹${cp.price} (Pay at checkout)
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    list.innerHTML = html;

}

function updateAdminPrintStatus(reqId, newStatus) {
    let req = printRequests.find(r => r.id === reqId);
    if (!req) return;

    req.status = newStatus;
    fetch(`${API_URL}/api/prints/${reqId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
    }).catch(e=>console.error(e));

    // SYNC: Universal Parent Order Synchronization
    if (req.orderId) {
        const oId = req.orderId;
        const parentOrder = (globalOrders || []).find(o => o.id === oId);
        
        if (parentOrder && parentOrder.status !== newStatus) {
            // Aggressive Sync for print tasks linked to orders
            console.log(`📡 FORCING TIMELINE SYNC: Order ${oId} -> ${newStatus}`);
            parentOrder.status = newStatus;
            
            const payload = { status: newStatus };
            if (newStatus === 'Completed') payload.completionDate = new Date().toISOString();

            fetch(`${API_URL}/api/orders/${oId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(() => {
                refreshOrdersDatabase();
                if (typeof updateStudentDashboard === 'function') updateStudentDashboard();
            }).catch(err => console.error("Sync Fetch Error:", err));
        }
    }

    if (newStatus === 'Accepted') {
        pushSystemNotification(req.userId, `Print Request Accepted`, `Your document ${req.fileName} has been queued for printing.`);
    } else if (newStatus === 'Ready') {
        pushSystemNotification(req.userId, `Print Document Ready!`, `Your print task #${reqId} is complete and ready for pickup.`);
    } else if (newStatus === 'Completed') {
        pushSystemNotification(req.userId, `Print Project Handed Over`, `Task #${reqId} has been successfully collected.`);
    }

    updateAdminDashboard();
    showToast(`Print Request #${reqId} moved to ${newStatus}`, "success");
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = type === 'error' ? 'fa-exclamation-circle' : type === 'info' ? 'fa-info-circle' : 'fa-check-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}
