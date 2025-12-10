/**
 * App.js - Event Wiring
 */
// Scripts loaded: Config, Store, UI

document.addEventListener('DOMContentLoaded', () => {
    // Note: store.init() runs in constructor but is async.
    // store.subscribe triggers UI.render automatically when state changes.
    store.subscribe((state) => {
        UI.render(state);
    });

    /* --- Auth Events --- */
    const authForm = document.getElementById('auth-form');
    const authActionBtn = document.getElementById('btn-auth-action');
    const authSwitch = document.getElementById('link-switch-auth');
    let isLoginMode = true;

    authSwitch.addEventListener('click', (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        document.querySelector('.auth-card h2').textContent = isLoginMode ? 'Welcome to Splitbaba' : 'Create Account';
        authActionBtn.textContent = isLoginMode ? 'Log In' : 'Sign Up';
        authSwitch.textContent = isLoginMode ? 'Sign Up' : 'Log In';
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;

        authActionBtn.textContent = 'Processing...';
        authActionBtn.disabled = true;

        let res;
        if (isLoginMode) {
            res = await store.signIn(email, password);
        } else {
            res = await store.signUp(email, password);
        }

        authActionBtn.textContent = isLoginMode ? 'Log In' : 'Sign Up';
        authActionBtn.disabled = false;

        if (res.error) {
            alert(res.error.message);
        }
    });

    /* --- Setup Events (Households) --- */
    const btnJoin = document.getElementById('btn-join-house');
    const btnCreate = document.getElementById('btn-create-house');

    btnCreate.addEventListener('click', async () => {
        const name = prompt("Enter Household Name (e.g., 'Apt 4B'):");
        if (name) {
            const { error } = await store.createHousehold(name);
            if (error) alert(error.message);
        }
    });

    btnJoin.addEventListener('click', async () => {
        const code = document.getElementById('setup-code').value.trim().toUpperCase();
        if (code) {
            const { error } = await store.joinHousehold(code);
            if (error) alert(error.message);
        }
    });

    /* --- Core App Events --- */

    // Navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;
            if (!target) return;

            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            UI.showView(target);
        });
    });

    // Add Expense
    document.getElementById('add-expense-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const amount = document.getElementById('inp-amount').value;
        const desc = document.getElementById('inp-desc').value;
        const payerPill = document.querySelector('.pill.selected');

        if (amount && desc && payerPill) {
            store.addExpense(amount, desc, payerPill.dataset.id);
            document.getElementById('add-expense-form').reset();
            // Return home
            document.querySelector('[data-target="view-dashboard"]').click();
        }
    });

    // Settle Up
    document.getElementById('btn-settle-up-main').addEventListener('click', () => UI.toggleModal(true));
    document.getElementById('btn-close-modal').addEventListener('click', () => UI.toggleModal(false));

    document.getElementById('btn-confirm-payment').addEventListener('click', () => {
        const payer = document.getElementById('settle-payer').value;
        const payee = document.getElementById('settle-payee').value;
        const amount = document.getElementById('settle-amount').value;

        if (payer === payee) { alert("Same person!"); return; }
        if (amount) {
            store.addPayment(payer, payee, amount);
            UI.toggleModal(false);
            document.getElementById('settle-amount').value = '';
        }
    });
});
