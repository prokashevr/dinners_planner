'use strict';

const STORAGE_KEY = 'dinnerPlanner_v1';
const MAX_DAYS = 14;
const MIN_DAYS = 1;
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
        katyaDays: 3,
        romaDays: 4,
    },
    plan: null,
    savedAt: null,
};

// Track which side the user moved last so auto-balance favors the other side.
let _lastSplitTouched = 'romaDays';

// ---------- Persistence ----------

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            state = { ...state, ...parsed };
            state.setup = { ...state.setup, ...(parsed.setup || {}) };
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
 */
function generatePlan(setup) {
    const filtered = recipes.filter(r => recipeMatches(r, setup));
    const katyaPool = filtered.filter(r => r.author === 'Katya');
    const romaPool = filtered.filter(r => r.author === 'Roma');

    const evenings = setup.cookingEvenings;
    const splits = [];
    for (let k = 0; k <= evenings; k++) {
        splits.push([k, evenings - k]);
    }

    const shuffledSplits = shuffle(splits);

    for (const [k, r] of shuffledSplits) {
        if (k > katyaPool.length || r > romaPool.length) continue;
        if (k === 0 && setup.katyaDays !== 0) continue;
        if (r === 0 && setup.romaDays !== 0) continue;
        if (k > 0 && setup.katyaDays === 0) continue;
        if (r > 0 && setup.romaDays === 0) continue;

        const katyaPicks = pickSubset(katyaPool, k, setup.katyaDays);
        if (!katyaPicks) continue;
        const romaPicks = pickSubset(romaPool, r, setup.romaDays);
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
    $('#katyaDays').value = state.setup.katyaDays;
    $('#romaDays').value = state.setup.romaDays;
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
    setStepperBtnDisabled('katyaDays', s.katyaDays <= 0, s.katyaDays >= s.totalDays);
    setStepperBtnDisabled('romaDays', s.romaDays <= 0, s.romaDays >= s.totalDays);
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
    if (s.katyaDays + s.romaDays !== s.totalDays) {
        errs.push(`Cook days must sum to ${s.totalDays} (currently ${s.katyaDays + s.romaDays}).`);
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
        if (next.cookingEvenings > next.totalDays) next.cookingEvenings = next.totalDays;
        // Auto-rebalance the split to match new total.
        const sum = next.katyaDays + next.romaDays;
        const diff = next.totalDays - sum;
        if (diff !== 0) {
            const target = _lastSplitTouched === 'katyaDays' ? 'romaDays' : 'katyaDays';
            next[target] = clamp(next[target] + diff, 0, next.totalDays);
            const stillOff = next.totalDays - (next.katyaDays + next.romaDays);
            if (stillOff !== 0) {
                const other = target === 'katyaDays' ? 'romaDays' : 'katyaDays';
                next[other] = clamp(next[other] + stillOff, 0, next.totalDays);
            }
        }
    } else if (name === 'cookingEvenings') {
        next.cookingEvenings = clamp(s.cookingEvenings + delta, 1, s.totalDays);
    } else if (name === 'katyaDays') {
        next.katyaDays = clamp(s.katyaDays + delta, 0, s.totalDays);
        next.romaDays = clamp(s.totalDays - next.katyaDays, 0, s.totalDays);
        _lastSplitTouched = 'katyaDays';
    } else if (name === 'romaDays') {
        next.romaDays = clamp(s.romaDays + delta, 0, s.totalDays);
        next.katyaDays = clamp(s.totalDays - next.romaDays, 0, s.totalDays);
        _lastSplitTouched = 'romaDays';
    }
    state.setup = next;
    saveState();
    renderSetup();
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
        `${s.totalDays} days · ${s.cookingEvenings} evenings · Katya ${s.katyaDays} / Roma ${s.romaDays}`,
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

    if (!d || !d.recipe) {
        return `
            <li class="day-card is-empty" data-day-index="${card.firstIndex}">
                <div class="day-card-head">
                    <span class="day-label">${dayLabel}</span>
                </div>
                <p class="day-name">Tap to plan</p>
            </li>`;
    }

    const r = d.recipe;
    const isCustom = d.custom;
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

    return `
        <li class="day-card${isCustom ? ' is-custom' : ''}" data-day-index="${card.firstIndex}">
            <div class="day-card-head">
                <span class="day-label">${dayLabel}</span>
            </div>
            <p class="day-name">${escapeHtml(r.name)}</p>
            <div class="day-tags">${tags.join('')}</div>
        </li>`;
}

function flashSaved() {
    const el = $('#savedFlash');
    el.hidden = false;
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(() => { el.hidden = true; }, 1400);
}

// ---------- Modify-day sheet ----------

let _editingDayIndex = null;
let _altPool = [];
let _altShown = [];

function openSheet(dayIndex) {
    _editingDayIndex = dayIndex;
    const day = state.plan.days[dayIndex];
    const setup = state.setup;
    const remainingSpan = countRemainingSpan(dayIndex);

    $('#sheetTitle').textContent = `Modify Day ${dayIndex + 1}`;
    if (day && day.recipe) {
        $('#sheetCurrent').innerHTML = `Currently <strong>${escapeHtml(day.recipe.name)}</strong>.`;
    } else {
        $('#sheetCurrent').textContent = 'No meal planned for this day.';
    }
    $('#customMealInput').value = '';

    _altPool = recipes.filter(r => recipeMatches(r, setup) && r.daysCovered <= remainingSpan);
    sampleAlts();

    $('#sheetBackdrop').hidden = false;
    $('#modifySheet').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#customMealInput').focus({ preventScroll: true }), 80);
}

function countRemainingSpan(dayIndex) {
    return state.plan.days.length - dayIndex;
}

function closeSheet() {
    $('#sheetBackdrop').hidden = true;
    $('#modifySheet').hidden = true;
    document.body.style.overflow = '';
    _editingDayIndex = null;
}

function sampleAlts() {
    _altShown = shuffle(_altPool).slice(0, ALT_SAMPLE_SIZE);
    const list = $('#altList');
    if (_altShown.length === 0) {
        list.innerHTML = `<li class="alt-empty">No alternatives match these constraints.</li>`;
        return;
    }
    list.innerHTML = _altShown.map((r, i) => {
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
}

function applyAlt(idx) {
    const recipe = _altShown[idx];
    if (!recipe) return;
    replaceDayWithRecipe(_editingDayIndex, recipe);
    closeSheet();
}

function applyCustom() {
    const v = $('#customMealInput').value.trim();
    if (!v) return;
    const day = _editingDayIndex;
    state.plan.days[day] = {
        dayIndex: day,
        recipe: { id: 'custom-' + day, name: v, proteins: [], complexity: 'simple', daysCovered: 1, author: '' },
        spanStart: day,
        spanLength: 1,
        custom: true,
    };
    // Trailing days previously covered by this slot become empty.
    clearTrailingSpanFrom(day);
    saveState();
    renderPlan();
    closeSheet();
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
    renderPlan();
}

function clearTrailingSpanFrom(dayIndex) {
    // If the day at dayIndex is part of an existing multi-day span, free trailing siblings.
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
    renderPlan();
    closeSheet();
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
    // Stepper buttons (event delegation).
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

        const dayCard = e.target.closest('.day-card[data-day-index]');
        if (dayCard) {
            openSheet(Number(dayCard.dataset.dayIndex));
            return;
        }

        const altItem = e.target.closest('.alt-item[data-alt-index]');
        if (altItem) {
            applyAlt(Number(altItem.dataset.altIndex));
            return;
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

    $('#sheetBackdrop').addEventListener('click', closeSheet);
    $('#sheetCloseBtn').addEventListener('click', closeSheet);
    $('#shuffleAltsBtn').addEventListener('click', sampleAlts);
    $('#customMealBtn').addEventListener('click', applyCustom);
    $('#customMealInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyCustom();
        }
    });
    $('#clearDayBtn').addEventListener('click', clearDay);

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !$('#modifySheet').hidden) closeSheet();
    });
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
