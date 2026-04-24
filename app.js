'use strict';

// ── Spacing schedules ─────────────────────────────────────────────────────────

const SCHEDULES = {
  default:  [1, 6, 16],
  shorten:  [1, 3, 8],
  lengthen: [2, 12, 32],
};

const FORGOT_RESET = {
  default:  'default',
  shorten:  'shorten',
  lengthen: 'default',
};

// ── State ─────────────────────────────────────────────────────────────────────

let currentDay      = 0;
let allCards        = [];
let seenToday       = new Set();
let tomorrowAccepted = false;
let instSeq         = 0;

// instanceId -> { card }
const instances = new Map();

function newInst(card) {
  const id = 'i' + (++instSeq);
  instances.set(id, { card });
  return id;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('content/flashcards.json');
    allCards = await res.json();
    allCards.forEach(c => { if (c.interval_index === undefined) c.interval_index = 0; });
  } catch {
    document.getElementById('feed').innerHTML =
      '<p style="padding:60px 20px;color:#888;text-align:center">' +
      'Could not load flashcards.json — serve this folder over HTTP (e.g. python3 -m http.server 8080)</p>';
    return;
  }
  startSession();
}

function startSession() {
  tomorrowAccepted = false;
  instances.clear();
  instSeq = 0;

  const due = allCards.filter(c => c.next_due_day <= currentDay);
  seenToday = new Set(due.map(c => c.id));

  const feed = document.getElementById('feed');
  feed.innerHTML = '';

  if (due.length === 0) {
    feed.appendChild(buildEmpty());
  } else {
    due.forEach(c => feed.appendChild(buildCard(newInst(c))));
    feed.appendChild(buildBoundary());
  }

  feed.appendChild(buildEnd());
  refreshCounters();
  updateHeader();
}

// ── Build elements ────────────────────────────────────────────────────────────

function buildCard(instId) {
  const { card } = instances.get(instId);
  const ver = card.versions[card.active_version];
  const n   = nextN(card);

  const el = document.createElement('div');
  el.className = 'card-item';
  el.dataset.inst = instId;

  el.innerHTML = `
    <div class="card-meta">
      <span class="card-num"></span>
      <span class="card-topic">${esc(card.topic)}</span>
    </div>
    <div class="card-body">
      <p class="card-question">${esc(ver.question)}</p>
      <button class="btn-reveal" onclick="revealAnswer('${instId}')">Reveal answer ▾</button>
      <div class="answer-section" id="ans-${instId}" style="display:none">
        <div class="answer-box">
          <p class="card-answer">${esc(ver.answer)}</p>
        </div>
        <div class="action-row" id="act-${instId}">
          <button class="btn-action btn-forgot"   onclick="doForgot('${instId}')">Forgot</button>
          <button class="btn-action btn-schedule" onclick="doSchedule('${instId}')">Show in ${n} day${n !== 1 ? 's' : ''}</button>
          <button class="btn-action btn-notsure"  onclick="doNotSure('${instId}')">Not sure</button>
        </div>
        <div class="ns-flow" id="ns-${instId}"></div>
      </div>
    </div>
  `;

  return el;
}

function buildBoundary() {
  const el = document.createElement('div');
  el.id = 'session-boundary';
  el.className = 'session-section';
  el.innerHTML = `
    <h2>All caught up for today 🎉</h2>
    <p>You've reviewed all your due cards. Want to get ahead with some of tomorrow's?</p>
    <div class="section-actions">
      <button class="btn-primary"   onclick="doTomorrow(true)">Do tomorrow's cards</button>
      <button class="btn-secondary" onclick="doTomorrow(false)">No thanks</button>
    </div>
  `;
  return el;
}

function buildEnd() {
  const el = document.createElement('div');
  el.id = 'session-end';
  el.className = 'session-section';
  el.innerHTML = `
    <h2>Session complete</h2>
    <p>Jump to any day to continue practising.</p>
    <div class="day-row">
      <label for="day-input">Go to day</label>
      <input type="number" id="day-input" min="0" value="${currentDay + 1}">
      <button class="btn-go" onclick="doDayChange()">Go →</button>
    </div>
    <p class="day-note">Currently on Day ${currentDay}</p>
  `;
  return el;
}

function buildEmpty() {
  const el = document.createElement('div');
  el.className = 'session-section';
  el.innerHTML = `
    <h2>No cards due today</h2>
    <p>You're all caught up! Use the day simulator below to jump ahead.</p>
  `;
  return el;
}

// ── Actions ───────────────────────────────────────────────────────────────────

function revealAnswer(instId) {
  const cardEl = document.querySelector(`[data-inst="${instId}"]`);
  cardEl.querySelector('.btn-reveal').remove();
  const ans = document.getElementById('ans-' + instId);
  ans.style.display = 'flex';
  ans.style.flexDirection = 'column';
  ans.style.gap = '16px';
  setTimeout(() => ans.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 40);
}

function doForgot(instId) {
  const { card } = instances.get(instId);
  freezeActionRow(instId, 'btn-forgot');
  card._forgotThisSession = true;

  // Append a fresh unrevealed duplicate before the boundary
  const newId  = newInst(card);
  const feed   = document.getElementById('feed');
  const anchor = document.getElementById('session-boundary') || document.getElementById('session-end');
  feed.insertBefore(buildCard(newId), anchor);

  refreshCounters();
  updateHeader();
}

function doSchedule(instId) {
  const { card } = instances.get(instId);
  const sched = SCHEDULES[card.spacing] || SCHEDULES.default;
  const idx   = Math.min(card.interval_index, sched.length - 1);
  card.next_due_day   = currentDay + sched[idx];
  card.interval_index = Math.min(idx + 1, sched.length - 1);
  card._forgotThisSession = false;
  freezeActionRow(instId, 'btn-schedule');
}

function doNotSure(instId) {
  freezeActionRow(instId, 'btn-notsure');
  const flow = document.getElementById('ns-' + instId);
  flow.innerHTML = '';
  appendStep(flow, `
    <p class="ns-prompt">What would help most?</p>
    <div class="ns-opts">
      <button class="ns-opt" onclick="nsPickPath('${instId}', 'spacing', this)">Change how often I see this</button>
      <button class="ns-opt" onclick="nsPickPath('${instId}', 'refocus', this)">Refocus the question</button>
      <button class="ns-opt ns-cancel" onclick="nsCancel('${instId}')">Cancel</button>
    </div>
  `);
}

// ── Not Sure paths ────────────────────────────────────────────────────────────

function nsPickPath(instId, path, btn) {
  freezeOpts(btn);
  if (path === 'spacing') nsShowSpacing(instId);
  else nsShowDirection(instId);
}

function nsShowSpacing(instId) {
  const flow = document.getElementById('ns-' + instId);
  appendStep(flow, `
    <p class="ns-prompt">Should this come up more or less often?</p>
    <div class="ns-opts">
      <button class="ns-opt" onclick="nsApplySpacing('${instId}', 'shorten', this)">More often — I need more practice with this</button>
      <button class="ns-opt" onclick="nsApplySpacing('${instId}', 'lengthen', this)">Less often — I mostly know this</button>
      <button class="ns-opt ns-cancel" onclick="nsCancel('${instId}')">Cancel</button>
    </div>
  `);
}

function nsApplySpacing(instId, schedule, btn) {
  freezeOpts(btn);
  const { card } = instances.get(instId);
  card.spacing        = schedule;
  card.next_due_day   = currentDay + SCHEDULES[schedule][0];
  card.interval_index = 1;
  card._forgotThisSession = false;

  const flow = document.getElementById('ns-' + instId);
  appendStep(flow, `
    <p class="ns-confirm">✓ Done — this card will now come up ${schedule === 'shorten' ? 'more' : 'less'} often.</p>
  `);
}

function nsShowDirection(instId) {
  const flow = document.getElementById('ns-' + instId);
  appendStep(flow, `
    <p class="ns-prompt">Where did you struggle?</p>
    <div class="ns-opts">
      <button class="ns-opt" onclick="nsPickDirection('${instId}', 'zoom_in', this)">Zoom in — focus on the specific detail I'm missing</button>
      <button class="ns-opt" onclick="nsPickDirection('${instId}', 'zoom_out', this)">Zoom out — show me the bigger picture</button>
      <button class="ns-opt ns-cancel" onclick="nsCancel('${instId}')">Cancel</button>
    </div>
  `);
}

function nsPickDirection(instId, direction, btn) {
  freezeOpts(btn);
  nsShowHint(instId, direction);
}

function nsShowHint(instId, direction) {
  const flow = document.getElementById('ns-' + instId);
  appendStep(flow, `
    <p class="ns-prompt">Any hints for regenerating the card? <span class="ns-optional">(optional)</span></p>
    <p class="ns-hint-label">e.g. focus on the mechanism, not the definition</p>
    <textarea class="ns-hint" placeholder="Type a hint, or leave blank…"></textarea>
    <button class="btn-primary ns-continue" onclick="nsShowAlts('${instId}', '${direction}')">Continue →</button>
  `);
}

function nsShowAlts(instId, direction) {
  const { card } = instances.get(instId);
  const k0 = direction + '_0';
  const k1 = direction + '_1';
  const v0 = card.versions[k0];
  const v1 = card.versions[k1];
  const lbl = direction === 'zoom_in' ? 'Zoom in' : 'Zoom out';

  const flow = document.getElementById('ns-' + instId);
  appendStep(flow, `
    <p class="ns-prompt">Which version works better for you?</p>
    <div class="alt-cards">
      <div class="alt-card" onclick="nsSelectVersion('${instId}', '${k0}', this)">
        <span class="alt-label">${lbl} · Option 1</span>
        <p class="alt-q">${esc(v0.question)}</p>
        <p class="alt-a">${esc(v0.answer)}</p>
      </div>
      <div class="alt-card" onclick="nsSelectVersion('${instId}', '${k1}', this)">
        <span class="alt-label">${lbl} · Option 2</span>
        <p class="alt-q">${esc(v1.question)}</p>
        <p class="alt-a">${esc(v1.answer)}</p>
      </div>
    </div>
    <div class="ns-opts">
      <button class="ns-opt ns-cancel" onclick="nsCancel('${instId}')">Cancel</button>
    </div>
  `);
}

function nsSelectVersion(instId, versionKey, altEl) {
  // Freeze the alt cards
  altEl.closest('.alt-cards').querySelectorAll('.alt-card').forEach(c => {
    c.style.pointerEvents = 'none';
    c.style.opacity = c === altEl ? '1' : '0.3';
    if (c === altEl) c.style.borderColor = 'var(--green-dark)';
  });

  const { card } = instances.get(instId);
  card.active_version = versionKey;
  card.interval_index = 0;
  card.next_due_day   = currentDay + nextN(card);
  card._forgotThisSession = false;

  // Update question + answer in the card DOM
  const ver    = card.versions[versionKey];
  const cardEl = document.querySelector(`[data-inst="${instId}"]`);
  cardEl.querySelector('.card-question').textContent = ver.question;
  cardEl.querySelector('.card-answer').textContent   = ver.answer;

  const flow = document.getElementById('ns-' + instId);
  appendStep(flow, `
    <p class="ns-confirm">✓ Card updated to the new version.</p>
  `);
}

function nsCancel(instId) {
  const flow = document.getElementById('ns-' + instId);
  flow.innerHTML = '';
  unfreezeActionRow(instId);
}

// ── Tomorrow + Day change ─────────────────────────────────────────────────────

function doTomorrow(yes) {
  if (!yes) {
    document.getElementById('session-end').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (tomorrowAccepted) return;
  tomorrowAccepted = true;

  const extra = allCards.filter(c =>
    c.next_due_day === currentDay + 1 && !seenToday.has(c.id)
  );
  extra.forEach(c => seenToday.add(c.id));

  const feed   = document.getElementById('feed');
  const anchor = document.getElementById('session-boundary');
  extra.forEach(c => {
    const id = newInst(c);
    feed.insertBefore(buildCard(id), anchor);
  });

  anchor.innerHTML = `
    <h2>Tomorrow's cards added</h2>
    <p>${extra.length} card${extra.length !== 1 ? 's' : ''} added — keep going!</p>
  `;

  refreshCounters();
  updateHeader();
}

function doDayChange() {
  const val = parseInt(document.getElementById('day-input').value, 10);
  if (isNaN(val) || val < 0) return;

  // Apply forgot resets before advancing
  allCards.forEach(c => {
    if (c._forgotThisSession) {
      c.spacing       = FORGOT_RESET[c.spacing] || 'default';
      c.next_due_day  = val + SCHEDULES[c.spacing][0];
      c.interval_index = 1;
      c._forgotThisSession = false;
    }
  });

  currentDay = val;
  startSession();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('end-session-btn').addEventListener('click', () => {
  document.getElementById('session-end')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function freezeActionRow(instId, selectedClass) {
  const row = document.getElementById('act-' + instId);
  if (!row) return;
  row.querySelectorAll('.btn-action').forEach(btn => {
    btn.disabled = true;
    btn.classList.toggle('btn-selected', btn.classList.contains(selectedClass));
    btn.classList.toggle('btn-dimmed',  !btn.classList.contains(selectedClass));
  });
}

function unfreezeActionRow(instId) {
  const row = document.getElementById('act-' + instId);
  if (!row) return;
  row.querySelectorAll('.btn-action').forEach(btn => {
    btn.disabled = false;
    btn.classList.remove('btn-selected', 'btn-dimmed');
  });
}

function appendStep(flow, html) {
  const step = document.createElement('div');
  step.className = 'ns-step';
  step.innerHTML = html;
  flow.appendChild(step);
  setTimeout(() => step.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  return step;
}

function freezeOpts(clickedBtn) {
  const opts = clickedBtn.closest('.ns-opts');
  if (!opts) return;
  opts.querySelectorAll('.ns-opt').forEach(b => {
    b.disabled = true;
    b.classList.toggle('ns-selected', b === clickedBtn);
    b.classList.toggle('ns-dimmed',   b !== clickedBtn);
  });
}

function nextN(card) {
  const sched = SCHEDULES[card.spacing] || SCHEDULES.default;
  return sched[Math.min(card.interval_index || 0, sched.length - 1)];
}

function refreshCounters() {
  const items = document.querySelectorAll('.card-item');
  const total = items.length;
  items.forEach((el, i) => {
    const n = el.querySelector('.card-num');
    if (n) n.textContent = `${i + 1} of ${total}`;
  });
}

function updateHeader() {
  const total = document.querySelectorAll('.card-item').length;
  document.getElementById('header-label').textContent  = `Flashcards · ${total}`;
  document.getElementById('day-indicator').textContent = `Day ${currentDay}`;
}

function esc(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Go ────────────────────────────────────────────────────────────────────────

init();
