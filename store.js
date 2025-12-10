/**
 * Store.js - Supabase Integration
 */

// Initialize Supabase
const { supabaseUrl, supabaseKey } = window.APP_CONFIG;
let supabase = null;

if (supabaseUrl && supabaseKey && supabaseUrl !== 'YOUR_SUPABASE_URL_HERE') {
    supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
} else {
    console.warn("Supabase keys missing in config.js");
}

class Store {
    constructor() {
        this.state = {
            user: null, // Current Auth User
            profile: null, // DB Profile
            household: null, // Current Household
            members: [], // List of profiles in household
            expenses: [],
            payments: [],
            balances: {}
        };
        this.listeners = [];
        this.init();
    }

    async init() {
        if (!supabase) return;

        // Check active session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            this.state.user = session.user;
            await this.loadUserData();
        }

        // Listen for auth changes
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                this.state.user = session.user;
                if (event === 'SIGNED_IN') await this.loadUserData();
            } else {
                this.state = { ...this.state, user: null, profile: null, household: null, members: [], expenses: [], payments: [] };
                this.notify();
            }
        });
    }

    /* --- Actions --- */

    async signUp(email, password) {
        if (!supabase) return { error: { message: "Setup Config first!" } };
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return { error };
        // Create Profile
        if (data.user) {
            await supabase.from('profiles').insert([{ id: data.user.id, full_name: email.split('@')[0] }]);
        }
        return { data };
    }

    async signIn(email, password) {
        if (!supabase) return { error: { message: "Setup Config first!" } };
        return await supabase.auth.signInWithPassword({ email, password });
    }

    async signOut() {
        if (!supabase) return;
        return await supabase.auth.signOut();
    }

    async ensureProfileExists() {
        if (!this.state.user) return false;
        // Check if profile exists
        const { data } = await supabase.from('profiles').select('id').eq('id', this.state.user.id).single();
        if (data) return true;

        // If not, create it
        const { error } = await supabase.from('profiles').insert([{
            id: this.state.user.id,
            full_name: this.state.user.email.split('@')[0]
        }]);

        if (error) {
            console.error("Auto-create profile failed:", error);
            return false;
        }
        return true;
    }

    async createHousehold(name) {
        if (!this.state.user) return;

        // Ensure profile exists before FK check
        await this.ensureProfileExists();

        const code = 'HOUSE-' + Math.floor(1000 + Math.random() * 9000);

        // 1. Create Household
        const { data: house, error } = await supabase.from('households').insert([{ name, invite_code: code }]).select().single();
        if (error) return { error };

        // 2. Add self as member
        const { error: memberError } = await supabase.from('household_members').insert([{ household_id: house.id, profile_id: this.state.user.id }]);

        if (memberError) {
            console.error("Member Insert Error:", memberError);
            return { error: { message: "Created house but failed to join! " + memberError.message } };
        }

        await this.loadUserData(); // Refresh
        return { data: house };
    }

    async joinHousehold(code) {
        if (!this.state.user) return;

        // Ensure profile exists before FK check
        await this.ensureProfileExists();

        // 1. Find House
        const { data: house, error } = await supabase.from('households').select().eq('invite_code', code).single();
        if (error || !house) return { error: { message: "Invalid Code" } };

        // 2. Add Member
        const { error: joinErr } = await supabase.from('household_members').insert([{ household_id: house.id, profile_id: this.state.user.id }]);
        if (joinErr) return { error: joinErr };

        await this.loadUserData();
        return { data: house };
    }

    async addExpense(amount, description, payerId) {
        if (!this.state.household) return;
        const { error } = await supabase.from('expenses').insert([{
            household_id: this.state.household.id,
            amount: parseFloat(amount),
            description,
            payer_id: payerId
        }]);
        if (!error) this.fetchData(); // Manual refresh or rely on subscription
    }

    async addPayment(payerId, payeeId, amount) {
        if (!this.state.household) return;
        const { error } = await supabase.from('payments').insert([{
            household_id: this.state.household.id,
            payer_id: payerId,
            payee_id: payeeId,
            amount: parseFloat(amount)
        }]);
        if (!error) this.fetchData();
    }

    /* --- Data Loading --- */

    async loadUserData() {
        if (!this.state.user) return;
        // 1. Get Profile
        const { data: profile } = await supabase.from('profiles').select().eq('id', this.state.user.id).single();
        this.state.profile = profile;

        // 2. Get Household (Assuming 1 household per user for simplicity)
        const { data: members } = await supabase.from('household_members').select('household_id').eq('profile_id', this.state.user.id);

        if (members && members.length > 0) {
            const hid = members[0].household_id;
            const { data: house } = await supabase.from('households').select().eq('id', hid).single();
            this.state.household = house;

            await this.fetchData();
            this.setupSubscription();
        } else {
            this.state.household = null;
        }
        this.notify();
    }

    async fetchData() {
        if (!this.state.household) return;
        const hid = this.state.household.id;

        // Get Members
        const { data: mems } = await supabase.from('household_members').select('profile:profiles(*)').eq('household_id', hid);
        this.state.members = mems.map(m => m.profile);

        // Get Expenses
        const { data: exps } = await supabase.from('expenses').select().eq('household_id', hid).order('created_at', { ascending: false });
        this.state.expenses = exps || [];

        // Get Payments
        const { data: pays } = await supabase.from('payments').select().eq('household_id', hid).order('created_at', { ascending: false });
        this.state.payments = pays || [];

        this.calculateBalances();
        this.notify();
    }

    setupSubscription() {
        if (this.sub) supabase.removeChannel(this.sub);
        // Subscribe to changes in this household
        // Note: Realtime setup requires Row Level Security adjustments or broad subscription
        this.sub = supabase.channel('room-1')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => this.fetchData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => this.fetchData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'household_members' }, () => this.fetchData())
            .subscribe();
    }

    calculateBalances() {
        // Equal Split Algorithm
        const numMembers = this.state.members.length;
        if (numMembers === 0) return;

        const balances = {}; // { userId: amount }
        this.state.members.forEach(m => balances[m.id] = 0);

        // Expenses
        this.state.expenses.forEach(exp => {
            const splitAmount = exp.amount / numMembers;
            // Payer gets +Amount
            // Everyone gets -SplitAmount
            // Net for payer = Amount - SplitAmount
            // Net for others = -SplitAmount

            this.state.members.forEach(m => {
                if (m.id === exp.payer_id) {
                    balances[m.id] += (exp.amount - splitAmount);
                } else {
                    balances[m.id] -= splitAmount;
                }
            });
        });

        // Payments
        this.state.payments.forEach(pay => {
            balances[pay.payer_id] += pay.amount;
            balances[pay.payee_id] -= pay.amount;
        });

        this.state.balances = balances;
    }

    subscribe(listener) {
        this.listeners.push(listener);
        listener(this.state); // Immediate fire
    }

    notify() {
        this.listeners.forEach(fn => fn(this.state));
    }

    getBalances() { return this.state.balances; }
    getUsers() { return this.state.members.map(m => ({ id: m.id, name: m.full_name })); }
    getActivityFeed() {
        const all = [
            ...this.state.expenses.map(e => ({ ...e, type: 'expense', timestamp: new Date(e.created_at) })),
            ...this.state.payments.map(p => ({ ...p, type: 'payment', timestamp: new Date(p.created_at) }))
        ];
        return all.sort((a, b) => b.timestamp - a.timestamp);
    }
}

const store = new Store();
window.store = store;
