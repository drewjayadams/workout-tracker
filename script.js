const SUPABASE_URL = 'https://omcgkolodmuhrwzdkrfo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FA7cflexKqOhvoO6qrkC-g_COw4qocx';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const el = {
    authContainer: document.getElementById('auth-container'),
    loginSection: document.getElementById('login-section'),
    adminSection: document.getElementById('admin-section'),
    showLoginBtn: document.getElementById('show-login-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsMenu: document.getElementById('settings-menu'),
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    loginError: document.getElementById('login-error'),
    email: document.getElementById('email'),
    password: document.getElementById('password'),
    workoutDate: document.getElementById('workout-date'),
    workoutType: document.getElementById('workout-type'),
    notes: document.getElementById('notes'),
    addSetBtn: document.getElementById('add-set-btn'),
    saveBtn: document.getElementById('save-btn'),
    setsContainer: document.getElementById('sets-container'),
    logsContainer: document.getElementById('logs-container'),
};

const requiredEls = [
    el.authContainer,
    el.loginSection,
    el.adminSection,
    el.showLoginBtn,
    el.loginBtn,
    el.logoutBtn,
    el.loginError,
    el.email,
    el.password,
    el.workoutDate,
    el.workoutType,
    el.notes,
    el.addSetBtn,
    el.saveBtn,
    el.setsContainer,
    el.logsContainer
];

const hasUI = requiredEls.every(Boolean);

// 2. AUTHENTICATION LOGIC
async function checkUser() {
    const { data: { user } } = await db.auth.getUser();
    if (user) {
        showAdminUI(user.email);
    } else {
        el.showLoginBtn.hidden = false;
        if (el.settingsBtn) el.settingsBtn.hidden = true;
        if (el.settingsMenu) el.settingsMenu.hidden = true;
        setLoginToggle(false);
        el.adminSection.hidden = true;
        updateAuthContainer();
    }
}

function showAdminUI(email) {
    el.showLoginBtn.hidden = true;
    if (el.settingsBtn) el.settingsBtn.hidden = false;
    if (el.settingsMenu) el.settingsMenu.hidden = true;
    setLoginToggle(false);
    el.adminSection.hidden = false;
    el.workoutDate.valueAsDate = new Date();
    el.setsContainer.innerHTML = '';
    handleWorkoutTypeChange({ target: el.workoutType });
    updateAuthContainer();
}

async function handleLogin() {
    el.loginError.textContent = '';
    const email = el.email.value.trim();
    const password = el.password.value;
    const { data, error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
        el.loginError.textContent = error.message;
        return;
    }
    showAdminUI(data.user.email);
    fetchWorkouts();
}

async function handleLogout() {
    await db.auth.signOut();
    location.reload();
}

function handleSettingsToggle() {
    if (!el.settingsMenu) return;
    const isHidden = el.settingsMenu.hidden;
    el.settingsMenu.hidden = !isHidden;
}

function handleShowLogin() {
    setLoginToggle(el.loginSection.hidden);
    updateAuthContainer();
}

// 3. FORM LOGIC (Dynamic Rows)
const WORKOUT_A_DEFAULTS = ["Goblet Squat", "Overhead Press", "Chest Press", "Lateral Raises", "Hanging Leg Raise"];
const WORKOUT_B_DEFAULTS = ["Glute Bridge", "Seated Row", "Lat Pulldown", "Tricep Ext", "Face Pulls"];
const WORKOUT_LABELS = {
    A: "Anterior Chain (A)",
    B: "Posterior Chain (B)",
    Custom: "Custom"
};

// Helper to create a single row of inputs
function addSetRow(exerciseName = "", weightValue = "", repsValue = "") {
    if (!exerciseName && !weightValue && !repsValue) {
        const lastRow = el.setsContainer.lastElementChild;
        if (lastRow) {
            const lastName = lastRow.querySelector('.ex-name')?.value.trim() || "";
            const lastWeight = lastRow.querySelector('.ex-weight')?.value || "";
            exerciseName = lastName;
            weightValue = lastWeight;
        }
    }

    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `
        <input type="text" class="ex-name" placeholder="Exercise" value="${exerciseName}">
        <input type="number" class="ex-weight" placeholder="Lbs" value="${weightValue}">
        <input type="number" class="ex-reps" placeholder="Reps" value="${repsValue}">
        <button class="delete-btn" type="button" aria-label="Remove set">Remove</button>
    `;
    el.setsContainer.appendChild(row);
    const focusTarget = exerciseName ? row.querySelector('.ex-reps') : row.querySelector('.ex-name');
    focusTarget.focus();
}

function handleSetContainerClick(event) {
    const button = event.target.closest('.delete-btn');
    if (button) button.parentElement.remove();
}

function handleSetContainerKeydown(event) {
    if (event.key !== 'Enter') return;
    if (!event.target.classList.contains('ex-reps')) return;
    event.preventDefault();
    addSetRow();
}

// Auto-fill exercises when workout type changes
function handleWorkoutTypeChange(event) {
    el.setsContainer.innerHTML = '';
    const type = event.target.value;
    const defaults = type === 'A' ? WORKOUT_A_DEFAULTS : (type === 'B' ? WORKOUT_B_DEFAULTS : []);
    
    if (defaults.length > 0) {
        defaults.forEach(ex => addSetRow(ex));
    } else {
        addSetRow(); // Empty row for Custom
    }
}

// 4. SAVE LOGIC (The Database Transaction)
async function handleSave() {
    const validationError = validateWorkoutForm();
    if (validationError) {
        alert(validationError);
        return;
    }

    el.saveBtn.innerText = "Saving...";
    el.saveBtn.disabled = true;

    try {
        // A. Insert Session
        const { data: sessionData, error: sessionError } = await db
            .from('sessions')
            .insert({
                workout_type: el.workoutType.value,
                performed_at: el.workoutDate.value,
                notes: el.notes.value
            })
            .select()
            .single();

        if (sessionError) throw sessionError;

        // B. Gather Sets Data
        const setRows = el.setsContainer.querySelectorAll('.set-row');
        const setsPayload = [];
        setRows.forEach((row, index) => {
            const name = row.querySelector('.ex-name').value.trim();
            const weight = parseFloat(row.querySelector('.ex-weight').value);
            const reps = parseInt(row.querySelector('.ex-reps').value, 10);
            
            if (name && Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0) {
                setsPayload.push({
                    session_id: sessionData.id, // Link to the session we just made
                    exercise_name: name,
                    weight_lbs: weight,
                    reps: reps,
                    set_order: index
                });
            }
        });

        // C. Insert Sets
        if (setsPayload.length > 0) {
            const { error: setsError } = await db.from('sets').insert(setsPayload);
            if (setsError) throw setsError;
        }

        alert("Workout Saved!");
        location.reload(); // Refresh to show new data

    } catch (err) {
        alert("Error: " + err.message);
        el.saveBtn.innerText = "Try Again";
        el.saveBtn.disabled = false;
    }
}

function validateWorkoutForm() {
    if (!el.workoutDate.value) return "Select a workout date.";

    const setRows = el.setsContainer.querySelectorAll('.set-row');
    const hasValidSet = Array.from(setRows).some(row => {
        const name = row.querySelector('.ex-name').value.trim();
        const weight = parseFloat(row.querySelector('.ex-weight').value);
        const reps = parseInt(row.querySelector('.ex-reps').value, 10);
        return name && Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0;
    });

    if (!hasValidSet) {
        return "Add at least one set with exercise, weight, and reps.";
    }
    return "";
}

// 5. FETCH & RENDER (Public View)
async function fetchWorkouts() {
    const { data, error } = await db
        .from('sessions')
        .select(`*, sets (exercise_name, weight_lbs, reps)`)
        .order('performed_at', { ascending: false });

    if (error) return console.error(error);

    el.logsContainer.innerHTML = '';

    if (data.length === 0) {
        el.logsContainer.innerHTML = '<p>No workouts found.</p>';
        return;
    }

    data.forEach(session => {
        const date = new Date(session.performed_at).toLocaleDateString(undefined, { timeZone: 'UTC' });
        const card = document.createElement('div');
        card.className = 'log-card';
        const workoutLabel = WORKOUT_LABELS[session.workout_type] || session.workout_type;
        card.innerHTML = `
            <h3>${date} - ${workoutLabel}</h3>
            ${session.notes ? `<p class="log-notes">${session.notes}</p>` : ''}
            <ul>
                ${session.sets.map(s => `<li>${s.exercise_name}: <strong>${s.weight_lbs}lbs</strong> x ${s.reps}</li>`).join('')}
            </ul>
        `;
        el.logsContainer.appendChild(card);
    });
}

function setLoginToggle(isVisible) {
    el.loginSection.hidden = !isVisible;
    el.showLoginBtn.textContent = isVisible ? "Hide login" : "Log in";
    el.showLoginBtn.classList.toggle('subtle', !isVisible);
}

function updateAuthContainer() {
    const showPanel = !el.adminSection.hidden || !el.loginSection.hidden;
    el.authContainer.hidden = !showPanel;
}

function bindEvents() {
    el.showLoginBtn.addEventListener('click', handleShowLogin);
    if (el.settingsBtn) el.settingsBtn.addEventListener('click', handleSettingsToggle);
    el.loginBtn.addEventListener('click', handleLogin);
    el.logoutBtn.addEventListener('click', handleLogout);
    el.addSetBtn.addEventListener('click', () => addSetRow());
    el.workoutType.addEventListener('change', handleWorkoutTypeChange);
    el.saveBtn.addEventListener('click', handleSave);
    el.setsContainer.addEventListener('click', handleSetContainerClick);
    el.setsContainer.addEventListener('keydown', handleSetContainerKeydown);
}

if (hasUI) {
    bindEvents();
    checkUser();
    fetchWorkouts();
}

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js");
    });
}
