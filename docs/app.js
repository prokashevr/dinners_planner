'use strict';

const STORAGE_KEY = 'dinnerPlanner_v2';
const MAX_DAYS = 14;
const MIN_DAYS = 1;
const MAX_RECIPE_DAYS = 2;
const ALT_SAMPLE_SIZE = 6;

const PROTEIN_LABELS = {
    chicken: 'Chicken',
    beef: 'Beef',
    salmon: 'Salmon',
    tuna: 'Tuna',
    shrimps: 'Shrimp',
    codfish: 'Cod',
    herring: 'Herring',
    turkey: 'Turkey',
    halloumi: 'Halloumi',
    'pork sausages': 'Sausage',
    mixed: 'Mixed',
    vegetarian: 'Veg',
};

let recipes = [];

let state = {
    view: 'setup',
    setup: {
        totalDays: 7,
        cookingEvenings: 4,
        proteins: [],
        allowComplex: false,
        katyaEvenings: 2,
        romaEvenings: 2,
    },
    plan: null,
    savedAt: null,
};

// Track which side the user moved last so auto-balance favors the other side.
let _lastSplitTouched = 'romaEvenings';

// Inline-edit state (only meaningful while state.view === 'plan').
let _editingDayIndex = null;
let _altPool = [];
let _altShown = [];

// ---------- Persistence ----------

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            state = { ...state, ...parsed };
            const incomingSetup = { ...(parsed.setup || {}) };
            // Drop legacy keys from earlier schema (days-based split).
            delete incomingSetup.katyaDays;
            delete incomingSetup.romaDays;
            state.setup = { ...state.setup, ...incomingSetup };
        }
    } catch (_) {}
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
}

// ---------- Recipes ----------

async function loadRecipes() {
    const res = await fetch('recipes.json', { cache: 'no-cache' });
    recipes = await res.json();
}

function uniqueProteins() {
    const seen = new Set();
    recipes.forEach(r => r.proteins.forEach(p => seen.add(p)));
    const order = Object.keys(PROTEIN_LABELS).filter(p => seen.has(p));
    seen.forEach(p => { if (!order.includes(p)) order.push(p); });
    return order;
}

function proteinLabel(p) {
    return PROTEIN_LABELS[p] || p.replace(/\b\w/g, c => c.toUpperCase());
}

// ---------- Planning algorithm ----------

function recipeMatches(recipe, setup) {
    if (recipe.complexity === 'complex' && !setup.allowComplex) return false;
    if (setup.proteins.length === 0) return true;
    return recipe.proteins.some(p => setup.proteins.includes(p));
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Find a subset of recipes from `pool` of size `count` whose daysCovered sums to `targetDays`.
 * Returns array of recipes or null.
 */
function pickSubset(pool, count, targetDays) {
    if (count === 0) return targetDays === 0 ? [] : null;
    const shuffled = shuffle(pool);

    function recurse(idx, picked, sumDays) {
        if (picked.length === count && sumDays === targetDays) return picked;
        if (picked.length === count) return null;
        if (sumDays > targetDays) return null;
        if (idx >= shuffled.length) return null;
        const remainingCount = count - picked.length;
        const remainingDays = targetDays - sumDays;
        if (remainingDays < remainingCount) return null;

        const r = shuffled[idx];
        const tryInclude = recurse(
            idx + 1,
            [...picked, r],
            sumDays + r.daysCovered,
        );
        if (tryInclude) return tryInclude;
        return recurse(idx + 1, picked, sumDays);
    }

    return recurse(0, [], 0);
}

/**
 * Generate a plan based on `setup`. Returns { days: [...] } or null if no solution.
 *
 * Recipe counts per author are given (`katyaEvenings`, `romaEvenings`).
 * The total daysCovered must sum to `totalDays`. We iterate possible
 * Katya day-totals and ask each pool for a subset matching count + days.
 */
function generatePlan(setup) {
    const filtered = recipes.filter(r => recipeMatches(r, setup));
    const katyaPool = filtered.filter(r => r.author === 'Katya');
    const romaPool = filtered.filter(r => r.author === 'Roma');

    const K = setup.katyaEvenings;
    const R = setup.romaEvenings;
    const T = setup.totalDays;

    if (K > katyaPool.length || R > romaPool.length) return null;

    // Possible katya day totals: K (all 1-day) up to K * MAX_RECIPE_DAYS.
    const kDayTargets = [];
    for (let kd = K; kd <= K * MAX_RECIPE_DAYS; kd++) {
        const rd = T - kd;
        if (rd < R) continue;                       // each Roma recipe needs ≥1 day
        if (rd > R * MAX_RECIPE_DAYS) continue;     // can't pad
        kDayTargets.push(kd);
    }

    for (const kd of shuffle(kDayTargets)) {
        const rd = T - kd;
        const katyaPicks = pickSubset(katyaPool, K, kd);
        if (!katyaPicks) continue;
        const romaPicks = pickSubset(romaPool, R, rd);
        if (!romaPicks) continue;

        const allPicks = shuffle([...katyaPicks, ...romaPicks]);
        const days = [];
        let dayIndex = 0;
        for (const recipe of allPicks) {
            const span = recipe.daysCovered;
            for (let i = 0; i < span; i++) {
                days.push({
                    dayIndex,
                    recipe: { ...recipe },
                    spanStart: dayIndex - i,
                    spanLength: span,
                    custom: false,
                });
                dayIndex++;
            }
        }
        return { days, generatedAt: new Date().toISOString() };
    }

    return null;
}

// ---------- DOM helpers ----------

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ---------- Setup view ----------

function renderProteinPills() {
    const list = $('#proteinList');
    const proteins = uniqueProteins();
    list.innerHTML = proteins.map(p => {
        const on = state.setup.proteins.includes(p) ? ' is-on' : '';
        return `<button type="button" class="pill${on}" data-protein="${escapeHtml(p)}">${escapeHtml(proteinLabel(p))}</button>`;
    }).join('');
}

function renderSetup() {
    $('#totalDays').value = state.setup.totalDays;
    $('#cookingEvenings').value = state.setup.cookingEvenings;
    $('#katyaEvenings').value = state.setup.katyaEvenings;
    $('#romaEvenings').value = state.setup.romaEvenings;
    $('#allowComplex').checked = state.setup.allowComplex;

    $$('#proteinList .pill').forEach(p => {
        const on = state.setup.proteins.includes(p.dataset.protein);
        p.classList.toggle('is-on', on);
    });

    updateStepperLimits();
    validateSetup();
}

function updateStepperLimits() {
    const s = state.setup;
    setStepperBtnDisabled('totalDays', s.totalDays <= MIN_DAYS, s.totalDays >= MAX_DAYS);
    setStepperBtnDisabled('cookingEvenings', s.cookingEvenings <= 1, s.cookingEvenings >= s.totalDays);
    setStepperBtnDisabled('katyaEvenings', s.katyaEvenings <= 0, s.katyaEvenings >= s.cookingEvenings);
    setStepperBtnDisabled('romaEvenings', s.romaEvenings <= 0, s.romaEvenings >= s.cookingEvenings);
}

function setStepperBtnDisabled(name, disableMinus, disablePlus) {
    const root = document.querySelector(`[data-stepper="${name}"]`);
    if (!root) return;
    root.querySelector('[data-step="-1"]').disabled = disableMinus;
    root.querySelector('[data-step="1"]').disabled = disablePlus;
}

function validateSetup() {
    const s = state.setup;
    const errs = [];
    if (s.cookingEvenings > s.totalDays) errs.push('Cooking evenings can’t exceed total days.');
    if (s.cookingEvenings < 1) errs.push('Need at least one cooking evening.');
    if (s.katyaEvenings + s.romaEvenings !== s.cookingEvenings) {
        errs.push(`Cook evenings must sum to ${s.cookingEvenings} (currently ${s.katyaEvenings + s.romaEvenings}).`);
    }
    const banner = $('#setupError');
    if (errs.length) {
        banner.textContent = errs[0];
        banner.hidden = false;
    } else {
        banner.hidden = true;
        banner.textContent = '';
    }
    $('#generateBtn').disabled = errs.length > 0;
    return errs.length === 0;
}

function adjustStep(name, delta) {
    const s = state.setup;
    const next = { ...s };
    if (name === 'totalDays') {
        next.totalDays = clamp(s.totalDays + delta, MIN_DAYS, MAX_DAYS);
        if (next.cookingEvenings > next.totalDays) {
            next.cookingEvenings = next.totalDays;
            rebalanceEveningsSplit(next);
        }
    } else if (name === 'cookingEvenings') {
        next.cookingEvenings = clamp(s.cookingEvenings + delta, 1, s.totalDays);
        rebalanceEveningsSplit(next);
    } else if (name === 'katyaEvenings') {
        next.katyaEvenings = clamp(s.katyaEvenings + delta, 0, s.cookingEvenings);
        next.romaEvenings = clamp(s.cookingEvenings - next.katyaEvenings, 0, s.cookingEvenings);
        _lastSplitTouched = 'katyaEvenings';
    } else if (name === 'romaEvenings') {
        next.romaEvenings = clamp(s.romaEvenings + delta, 0, s.cookingEvenings);
        next.katyaEvenings = clamp(s.cookingEvenings - next.romaEvenings, 0, s.cookingEvenings);
        _lastSplitTouched = 'romaEvenings';
    }
    state.setup = next;
    saveState();
    renderSetup();
}

function rebalanceEveningsSplit(s) {
    const sum = s.katyaEvenings + s.romaEvenings;
    const diff = s.cookingEvenings - sum;
    if (diff === 0) return;
    const target = _lastSplitTouched === 'katyaEvenings' ? 'romaEvenings' : 'katyaEvenings';
    s[target] = clamp(s[target] + diff, 0, s.cookingEvenings);
    const stillOff = s.cookingEvenings - (s.katyaEvenings + s.romaEvenings);
    if (stillOff !== 0) {
        const other = target === 'katyaEvenings' ? 'romaEvenings' : 'katyaEvenings';
        s[other] = clamp(s[other] + stillOff, 0, s.cookingEvenings);
    }
}

function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}

function toggleProtein(p) {
    const list = state.setup.proteins;
    const idx = list.indexOf(p);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(p);
    saveState();
    renderSetup();
}

function setAllowComplex(v) {
    state.setup.allowComplex = !!v;
    saveState();
    renderSetup();
}

// ---------- Plan view ----------

function showSetup() {
    closeEdit();
    state.view = 'setup';
    saveState();
    renderView();
}

function showPlan() {
    state.view = 'plan';
    saveState();
    renderView();
}

function renderView() {
    $('#setupView').hidden = state.view !== 'setup';
    $('#planView').hidden = state.view !== 'plan';
    if (state.view === 'plan') renderPlan();
    if (state.view === 'setup') renderSetup();
}

function renderPlan() {
    const plan = state.plan;
    const list = $('#dayList');
    if (!plan) {
        list.innerHTML = '';
        return;
    }
    const s = state.setup;
    setText(
        $('#planSummary'),
        `${s.totalDays} days · Katya ${s.katyaEvenings} / Roma ${s.romaEvenings} evenings`,
    );

    // Collapse spans for visual rendering.
    const cards = collapseSpans(plan.days);
    list.innerHTML = cards.map(card => renderDayCard(card)).join('');
}

function collapseSpans(days) {
    const cards = [];
    let i = 0;
    while (i < days.length) {
        const d = days[i];
        const start = i;
        let end = i;
        if (d && d.recipe && d.spanLength > 1 && !d.custom) {
            // Walk forward while the same recipe span continues.
            while (
                end + 1 < days.length &&
                days[end + 1] &&
                days[end + 1].recipe &&
                days[end + 1].recipe.id === d.recipe.id &&
                days[end + 1].spanStart === d.spanStart &&
                !days[end + 1].custom
            ) {
                end++;
            }
        }
        cards.push({
            firstIndex: start,
            lastIndex: end,
            day: d,
        });
        i = end + 1;
    }
    return cards;
}

function renderDayCard(card) {
    const d = card.day;
    const dayLabel =
        card.firstIndex === card.lastIndex
            ? `Day ${card.firstIndex + 1}`
            : `Day ${card.firstIndex + 1}–${card.lastIndex + 1}`;
    const isEditing = _editingDayIndex === card.firstIndex;
    const editingClass = isEditing ? ' is-editing' : '';
    const isEmpty = !d || !d.recipe;
    const isCustom = !isEmpty && d.custom;

    let body;
    if (isEmpty) {
        body = `<p class="day-name day-name-empty">No meal</p>`;
    } else {
        const r = d.recipe;
        const tags = [];
        if (!isCustom && r.author) {
            tags.push(`<span class="tag tag-author-${r.author.toLowerCase()}">${escapeHtml(r.author)}</span>`);
        }
        if (!isCustom && r.proteins) {
            r.proteins.forEach(p => {
                const cls = p === 'vegetarian' ? 'tag tag-veg' : 'tag';
                tags.push(`<span class="${cls}">${escapeHtml(proteinLabel(p))}</span>`);
            });
        }
        if (!isCustom && r.complexity === 'complex') {
            tags.push(`<span class="tag tag-complex">Complex</span>`);
        }
        if (isCustom) {
            tags.push(`<span class="tag">Custom</span>`);
        }
        body = `
            <p class="day-name">${escapeHtml(r.name)}</p>
            <div class="day-tags">${tags.join('')}</div>`;
    }

    return `
        <li class="day-card${isEmpty ? ' is-empty' : ''}${isCustom ? ' is-custom' : ''}${editingClass}" data-day-index="${card.firstIndex}">
            <div class="day-card-head">
                <span class="day-label">${dayLabel}</span>
                <span class="day-card-chevron" aria-hidden="true">${isEditing ? '×' : '+'}</span>
            </div>
            ${body}
            ${isEditing ? renderEditPanel(card.firstIndex) : ''}
        </li>`;
}

function renderEditPanel(dayIndex) {
    const altsHtml = _altShown.length === 0
        ? `<li class="alt-empty">No alternatives match these constraints.</li>`
        : _altShown.map((r, i) => {
            const tags = [
                `<span class="tag tag-author-${r.author.toLowerCase()}">${escapeHtml(r.author)}</span>`,
                ...r.proteins.map(p => {
                    const cls = p === 'vegetarian' ? 'tag tag-veg' : 'tag';
                    return `<span class="${cls}">${escapeHtml(proteinLabel(p))}</span>`;
                }),
                `<span class="tag">${r.daysCovered}d</span>`,
            ];
            return `
                <li class="alt-item" data-alt-index="${i}">
                    <span class="alt-name">${escapeHtml(r.name)}</span>
                    <div class="alt-meta">${tags.join('')}</div>
                </li>`;
        }).join('');

    return `
        <div class="day-edit-panel" data-edit-panel="${dayIndex}">
            <div class="alts-head">
                <span class="alts-label">Alternatives</span>
                <button type="button" class="btn-link btn-link-sm" data-shuffle-alts>Shuffle</button>
            </div>
            <ul class="alt-list">${altsHtml}</ul>
            <div class="custom-row">
                <input type="text" class="custom-meal-input" placeholder="Or type your own…" maxlength="80" autocomplete="off">
                <button type="button" class="btn btn-primary btn-sm" data-set-custom>Set</button>
            </div>
            <button type="button" class="btn btn-danger-soft btn-block btn-sm" data-clear-day>Remove this day</button>
        </div>`;
}

function flashSaved() {
    const el = $('#savedFlash');
    el.hidden = false;
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(() => { el.hidden = true; }, 1400);
}

// ---------- Inline day editor ----------

function openEdit(dayIndex) {
    if (!state.plan) return;
    _editingDayIndex = dayIndex;
    const remainingSpan = state.plan.days.length - dayIndex;
    _altPool = recipes.filter(r => recipeMatches(r, state.setup) && r.daysCovered <= remainingSpan);
    _altShown = shuffle(_altPool).slice(0, ALT_SAMPLE_SIZE);
    renderPlan();
    setTimeout(() => {
        const input = document.querySelector('.day-edit-panel .custom-meal-input');
        if (input) input.focus({ preventScroll: true });
    }, 60);
}

function closeEdit() {
    _editingDayIndex = null;
    _altPool = [];
    _altShown = [];
    if (state.view === 'plan') renderPlan();
}

function toggleEdit(dayIndex) {
    if (_editingDayIndex === dayIndex) closeEdit();
    else openEdit(dayIndex);
}

function sampleAlts() {
    if (_editingDayIndex == null || _altPool.length === 0) return;
    _altShown = shuffle(_altPool).slice(0, ALT_SAMPLE_SIZE);
    renderPlan();
}

function applyAlt(idx) {
    const recipe = _altShown[idx];
    if (!recipe || _editingDayIndex == null) return;
    replaceDayWithRecipe(_editingDayIndex, recipe);
    closeEdit();
}

function applyCustomFromPanel() {
    const input = document.querySelector('.day-edit-panel .custom-meal-input');
    if (!input || _editingDayIndex == null) return;
    const v = input.value.trim();
    if (!v) return;
    const day = _editingDayIndex;
    clearTrailingSpanFrom(day);
    state.plan.days[day] = {
        dayIndex: day,
        recipe: { id: 'custom-' + day, name: v, proteins: [], complexity: 'simple', daysCovered: 1, author: '' },
        spanStart: day,
        spanLength: 1,
        custom: true,
    };
    saveState();
    closeEdit();
}

function replaceDayWithRecipe(dayIndex, recipe) {
    clearTrailingSpanFrom(dayIndex);
    const span = recipe.daysCovered;
    const remaining = state.plan.days.length - dayIndex;
    const used = Math.min(span, remaining);
    for (let i = 0; i < used; i++) {
        state.plan.days[dayIndex + i] = {
            dayIndex: dayIndex + i,
            recipe: { ...recipe },
            spanStart: dayIndex,
            spanLength: used,
            custom: false,
        };
    }
    saveState();
}

function clearTrailingSpanFrom(dayIndex) {
    const day = state.plan.days[dayIndex];
    if (!day || !day.recipe) {
        emptyDay(dayIndex);
        return;
    }
    const start = day.custom ? dayIndex : day.spanStart;
    const length = day.custom ? 1 : day.spanLength;
    for (let i = start; i < start + length && i < state.plan.days.length; i++) {
        emptyDay(i);
    }
}

function emptyDay(dayIndex) {
    state.plan.days[dayIndex] = {
        dayIndex,
        recipe: null,
        spanStart: dayIndex,
        spanLength: 1,
        custom: false,
    };
}

function clearDay() {
    if (_editingDayIndex == null) return;
    clearTrailingSpanFrom(_editingDayIndex);
    saveState();
    closeEdit();
}

// ---------- Generate / regenerate ----------

function handleGenerate() {
    if (!validateSetup()) return;
    const plan = generatePlan(state.setup);
    if (!plan) {
        $('#setupError').textContent = 'No plan matches those constraints. Try fewer cooking evenings, more proteins, or allow complex recipes.';
        $('#setupError').hidden = false;
        return;
    }
    state.plan = plan;
    state.savedAt = null;
    saveState();
    showPlan();
}

function handleRegenerate() {
    handleGenerate();
}

function handleNewPlan() {
    state.plan = null;
    state.savedAt = null;
    saveState();
    showSetup();
}

function handleSavePlan() {
    state.savedAt = new Date().toISOString();
    saveState();
    flashSaved();
}

// ---------- Event wiring ----------

function bindEvents() {
    // Stepper buttons + protein pills + per-day editor (event delegation).
    document.addEventListener('click', e => {
        const stepBtn = e.target.closest('.step-btn');
        if (stepBtn) {
            const root = stepBtn.closest('[data-stepper]');
            if (!root) return;
            const name = root.dataset.stepper;
            const delta = Number(stepBtn.dataset.step);
            adjustStep(name, delta);
            return;
        }

        const pill = e.target.closest('.pill[data-protein]');
        if (pill) {
            toggleProtein(pill.dataset.protein);
            return;
        }

        // Edit-panel actions (must come before card toggle since panel is inside the card).
        if (e.target.closest('[data-shuffle-alts]')) { sampleAlts(); return; }
        if (e.target.closest('[data-set-custom]')) { applyCustomFromPanel(); return; }
        if (e.target.closest('[data-clear-day]')) { clearDay(); return; }

        const altItem = e.target.closest('.alt-item[data-alt-index]');
        if (altItem) {
            applyAlt(Number(altItem.dataset.altIndex));
            return;
        }

        // Click inside an open edit panel that didn't match a specific action: ignore.
        if (e.target.closest('.day-edit-panel')) return;

        const dayCard = e.target.closest('.day-card[data-day-index]');
        if (dayCard) {
            toggleEdit(Number(dayCard.dataset.dayIndex));
            return;
        }
    });

    document.addEventListener('keydown', e => {
        if (e.target && e.target.matches && e.target.matches('.custom-meal-input') && e.key === 'Enter') {
            e.preventDefault();
            applyCustomFromPanel();
        }
    });

    $('#allowComplex').addEventListener('change', e => setAllowComplex(e.target.checked));

    $('#setupForm').addEventListener('submit', e => {
        e.preventDefault();
        handleGenerate();
    });

    $('#editSetupBtn').addEventListener('click', showSetup);
    $('#regenerateBtn').addEventListener('click', handleRegenerate);
    $('#newPlanBtn').addEventListener('click', handleNewPlan);
    $('#savePlanBtn').addEventListener('click', handleSavePlan);
}

function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.warn('SW registration failed:', err);
        });
    });
}

// ---------- Boot ----------

async function boot() {
    loadState();
    try {
        await loadRecipes();
    } catch (err) {
        console.error('Failed to load recipes', err);
    }
    renderProteinPills();
    bindEvents();
    renderView();
    registerSW();
}

boot();
