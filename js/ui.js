/**
 * UI.js - UI Rendering & Helpers
 */
// window.UI = ...

const els = {
    // Views
    viewAuth: document.getElementById('view-auth'),
    viewSetup: document.getElementById('view-setup'),
    viewDashboard: document.getElementById('view-dashboard'),
    viewActivity: document.getElementById('view-activity'),
    viewAdd: document.getElementById('view-add-expense'),
    bottomNav: document.querySelector('.bottom-nav'),
    appHeader: document.querySelector('.app-header'),

    // Dashboard
    balanceDisplay: document.getElementById('total-balance'),
    balanceStatus: document.getElementById('balance-status'),
    dashboardFeed: document.getElementById('dashboard-feed'),
    houseName: document.getElementById('house-name-display'),
    houseCode: document.getElementById('house-code-display'),

    // Auth & Setup
    authTitle: document.querySelector('.auth-card h2'),
    authBtn: document.getElementById('btn-auth-action'),
    authSwitchLink: document.getElementById('link-switch-auth'),

    // Selectors
    payerSelector: document.getElementById('payer-selector'),
    settlePayer: document.getElementById('settle-payer'),
    settlePayee: document.getElementById('settle-payee'),
    modal: document.getElementById('modal-settle-up')
};

const formatCurrency = (num) => '$' + Math.abs(num || 0).toFixed(2);
const formatDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const UI = {
    render(state) {
        // 1. Auth & Routing Logic
        if (!state.user) {
            this.showView('view-auth');
            this.toggleNav(false);
            return;
        }

        if (!state.household) {
            this.showView('view-setup');
            this.toggleNav(false);
            return;
        }

        // If authenticated & in group, show App logic
        // Only switch to dashboard if we are currently in auth/setup (don't override user nav)
        if (els.viewAuth.classList.contains('active') || els.viewSetup.classList.contains('active')) {
            this.showView('view-dashboard');
            this.toggleNav(true);
        }

        // 1.5 Render Household Info
        if (state.household) {
            els.houseName.textContent = state.household.name;
            els.houseCode.textContent = state.household.invite_code;
        }

        // 2. Render Dashboard
        const myId = state.user.id;
        const myBalance = state.balances[myId] || 0;

        els.balanceDisplay.textContent = formatCurrency(myBalance);
        if (myBalance > 0.01) {
            els.balanceDisplay.className = 'text-success';
            els.balanceStatus.textContent = "You are owed";
        } else if (myBalance < -0.01) {
            els.balanceDisplay.className = 'text-danger';
            els.balanceStatus.textContent = "You owe";
        } else {
            els.balanceDisplay.className = '';
            els.balanceStatus.textContent = "You are all settled up";
        }

        // 3. Activity Feed
        const feed = store.getActivityFeed();
        const users = store.getUsers(); // {id, name}
        const userMap = new Map(users.map(u => [u.id, u.name]));

        const html = feed.length ? feed.map(item => {
            const isExp = item.type === 'expense';
            const payerName = userMap.get(item.payer_id) || 'Unknown';

            if (isExp) {
                return `
                    <div class="activity-item">
                        <div class="activity-icon expense"><span class="material-icons-round">receipt</span></div>
                        <div class="activity-details">
                            <div class="activity-title">${item.description}</div>
                            <div class="activity-meta">${payerName} paid ${formatCurrency(item.amount)}</div>
                        </div>
                        <div class="activity-amount">${formatCurrency(item.amount)}</div>
                    </div>`;
            } else {
                const payeeName = userMap.get(item.payee_id) || 'Unknown';
                return `
                    <div class="activity-item">
                        <div class="activity-icon payment"><span class="material-icons-round">paid</span></div>
                        <div class="activity-details">
                            <div class="activity-title">Payment</div>
                            <div class="activity-meta">${payerName} paid ${payeeName}</div>
                        </div>
                        <div class="activity-amount text-success">${formatCurrency(item.amount)}</div>
                    </div>`;
            }
        }).join('') : '<div class="empty-state">No activity yet</div>';

        els.dashboardFeed.innerHTML = html;
        if (document.getElementById('activity-full-feed')) document.getElementById('activity-full-feed').innerHTML = html;

        // 4. Selectors (Dynamic Members)
        this.renderMemberSelectors(users, myId);
    },

    renderMemberSelectors(users, myId) {
        // Payer Pills (Expense Form)
        // Check if list changed length (simple diff)

        // Always rebuild for simplicity in v2 to ensure sync
        els.payerSelector.innerHTML = '';
        users.forEach((u, i) => {
            const pill = document.createElement('div');
            // Select 'You' (myId) by default, or first
            const isMe = u.id === myId;
            pill.className = `pill ${isMe ? 'selected' : ''}`;
            pill.textContent = isMe ? 'You' : u.name;
            pill.dataset.id = u.id;
            pill.onclick = () => {
                document.querySelectorAll('.pill').forEach(p => p.classList.remove('selected'));
                pill.classList.add('selected');
            };
            els.payerSelector.appendChild(pill);
        });

        // Settle Up Options
        const opts = users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
        els.settlePayer.innerHTML = opts;
        els.settlePayee.innerHTML = opts;
    },

    showView(id) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    },

    toggleNav(show) {
        if (show) {
            els.bottomNav.style.display = 'flex';
            els.appHeader.style.display = 'flex';
        } else {
            els.bottomNav.style.display = 'none';
            els.appHeader.style.display = 'none';
        }
    },

    toggleModal(show) {
        if (show) {
            els.modal.classList.remove('hidden');
            requestAnimationFrame(() => els.modal.classList.add('open'));
        } else {
            els.modal.classList.remove('open');
            setTimeout(() => els.modal.classList.add('hidden'), 300);
        }
    }
};

window.UI = UI;
