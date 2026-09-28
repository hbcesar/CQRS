// ─────────────────────────────────────────────
// BIN IDs  ← paste your JSONBin bin IDs here
// The API key is NOT stored here — it lives in
// the JSONBIN_API_KEY Netlify environment variable.
// ─────────────────────────────────────────────
const VOTES_BIN_ID = 'votes';
const COMMENTS_BIN_ID = 'comments';
const QUESTIONS_BIN_ID = 'questions';

// ─────────────────────────────────────────────
// DATA SCHEMAS
//
// RATINGS  { qid: { ratings: { username: 1-5, … } } }
// COMMENTS { qid: [{ name, text, time }, …] }
// QUESTIONS [{ id, label, tags, question, answers, addedBy? }, …]
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// SESSION STATE
// ─────────────────────────────────────────────
let currentUser = '';        // set at login; session-only
let currentVersion = 1;
let latestVersion = 1;
let availableVersions = [1];
let QUESTIONS = [];
let votes = {};
let comments = {};
let sortMode = 'id';
let activeTags = new Set(); // empty = show all
let filterUnreviewed = false;
let modalTags = [];
let editTags = [];

// MODULES STATE
let modules = [];
let currentModuleId = null;
let currentModuleTitle = '';
let currentModuleDesc = '';
let editingModuleId = null;

const DEFAULT_MODULES = [
  {
    id: 'nutritional-intervention',
    title: 'Nutritional Intervention',
    description: 'Dietary habits, nutritional interventions, and physiological health outcomes.'
  }
];

const LIKERT_LABELS = ['', 'Not Relevant', 'Slightly Relevant', 'Moderately Relevant', 'Very Relevant', 'Highly Relevant'];

// ─────────────────────────────────────────────
// PROXY HELPERS  (key stays on the server)
// ─────────────────────────────────────────────
async function loadBin(binId, fallback, version = currentVersion, moduleId = currentModuleId) {
  try {
    let url = `/api/bin-read?binId=${encodeURIComponent(binId)}&version=${version}`;
    if (moduleId) {
      url += `&moduleId=${encodeURIComponent(moduleId)}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    let record = json.record ?? fallback;

    // Fallback for nutritional-intervention if questions empty
    if (binId === 'questions' && moduleId === 'nutritional-intervention' && version === 1 && (!record || record.length === 0)) {
      try {
        const backupRes = await fetch('/backup/questions.json');
        if (backupRes.ok) {
          const backupQuestions = await backupRes.json();
          if (Array.isArray(backupQuestions) && backupQuestions.length > 0) {
            record = backupQuestions;
          }
        }
      } catch (_) {}
    }
    return record;
  } catch (e) {
    console.warn('bin-read failed:', e);
    if (binId === 'questions' && moduleId === 'nutritional-intervention' && version === 1) {
      try {
        const backupRes = await fetch('/backup/questions.json');
        if (backupRes.ok) {
          const backupQuestions = await backupRes.json();
          if (Array.isArray(backupQuestions) && backupQuestions.length > 0) {
            return backupQuestions;
          }
        }
      } catch (_) {}
    }
    return fallback;
  }
}

async function saveBin(binId, data, version = currentVersion, moduleId = currentModuleId) {
  showSaving(true);
  try {
    const res = await fetch('/api/bin-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ binId, data, version, moduleId })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.warn('bin-write failed:', e);
  } finally {
    showSaving(false);
  }
}

function showSaving(on) {
  document.getElementById('saving-badge').style.display = on ? 'block' : 'none';
}

// ─────────────────────────────────────────────
// RATING DATA ACCESSORS
// ─────────────────────────────────────────────
function ratingData(qid) {
  if (!votes[qid] || !votes[qid].ratings) votes[qid] = { ratings: {} };
  return votes[qid];
}

function userRating(qid) {
  return ratingData(qid).ratings[currentUser] || 0;
}

function avgRating(qid) {
  const vals = Object.values(ratingData(qid).ratings);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ─────────────────────────────────────────────
// USERNAME FLOW
// ─────────────────────────────────────────────
async function submitUsername() {
  const input = document.getElementById('username-input');
  const name = input.value.trim();
  if (!name) {
    input.classList.add('error');
    setTimeout(() => input.classList.remove('error'), 1200);
    input.focus();
    return;
  }

  if (name.toLowerCase() === 'admin') {
    const pwInput = document.getElementById('admin-password-input');
    const password = pwInput.value;
    if (!password) {
      pwInput.classList.add('error');
      setTimeout(() => pwInput.classList.remove('error'), 1200);
      pwInput.focus();
      return;
    }

    const btn = document.querySelector('#username-modal .btn-save');
    const oldText = btn.textContent;
    btn.textContent = 'Verifying...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/verify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Invalid password');
      }
    } catch (e) {
      btn.textContent = oldText;
      btn.disabled = false;
      pwInput.value = '';
      pwInput.placeholder = 'Invalid password!';
      pwInput.classList.add('error');
      setTimeout(() => {
        pwInput.classList.remove('error');
        pwInput.placeholder = 'Enter admin password';
      }, 1500);
      pwInput.focus();
      return;
    }
    btn.textContent = oldText;
    btn.disabled = false;
  }

  currentUser = name;
  document.getElementById('username-backdrop').classList.remove('open');
  document.querySelectorAll('.user-chip-name').forEach(el => el.textContent = name);
  document.querySelectorAll('.comment-name-input').forEach(el => el.value = name);
  updateAdminUI();

  const urlParams = new URLSearchParams(window.location.search);
  const modParam = urlParams.get('module');
  if (modParam && modules.some(m => m.id === modParam)) {
    await selectModule(modParam);
  } else {
    showModulesScreen();
  }
}

async function promptRename() {
  const newName = prompt('Change your display name:', currentUser);
  if (newName && newName.trim()) {
    const trimmedName = newName.trim();
    if (trimmedName.toLowerCase() === 'admin') {
      const pass = prompt('Enter admin password:');
      if (!pass) return;
      try {
        const res = await fetch('/api/verify-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pass })
        });
        const data = await res.json();
        if (!data.success) {
          alert('Invalid admin password');
          return;
        }
      } catch (e) {
        alert('Verification failed');
        return;
      }
    }
    currentUser = trimmedName;
    document.querySelectorAll('.user-chip-name').forEach(el => el.textContent = currentUser);
    document.querySelectorAll('.comment-name-input').forEach(el => el.value = currentUser);
    updateAdminUI();
    if (currentModuleId) {
      renderAll();
    } else {
      renderModulesList();
    }
  }
}

// ─────────────────────────────────────────────
// DOM-READY: keyboard handlers
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Username modal — dynamic admin password field
  const usernameInput = document.getElementById('username-input');
  const adminRow = document.getElementById('admin-password-row');
  usernameInput.addEventListener('input', e => {
    if (e.target.value.trim().toLowerCase() === 'admin') {
      adminRow.style.display = 'block';
    } else {
      adminRow.style.display = 'none';
    }
  });

  // Username modal — Enter key
  usernameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (adminRow.style.display === 'block') {
        document.getElementById('admin-password-input').focus();
      } else {
        submitUsername();
      }
    }
  });

  document.getElementById('admin-password-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitUsername();
  });

  // Module modal keyboard handlers
  const mfTitle = document.getElementById('mf-title');
  if (mfTitle) {
    mfTitle.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveNewModule();
    });
  }
  const emfTitle = document.getElementById('emf-title');
  if (emfTitle) {
    emfTitle.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveEditModule();
    });
  }

  // Add-question tag chip input
  document.getElementById('tag-text-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.trim().replace(/,/g, '');
      if (val && !modalTags.includes(val)) { modalTags.push(val); renderModalTags(); }
      e.target.value = '';
    } else if (e.key === 'Backspace' && e.target.value === '' && modalTags.length > 0) {
      modalTags.pop(); renderModalTags();
    }
  });

  // Edit-question tag chip input
  document.getElementById('edit-tag-text-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.trim().replace(/,/g, '');
      if (val && !editTags.includes(val)) { editTags.push(val); renderEditTags(); }
      e.target.value = '';
    } else if (e.key === 'Backspace' && e.target.value === '' && editTags.length > 0) {
      editTags.pop(); renderEditTags();
    }
  });
});


// ─────────────────────────────────────────────
// RATING (Likert 1-5)
// ─────────────────────────────────────────────
async function rate(qid, value) {
  if (!isLatest()) return;
  const d = ratingData(qid);
  const cur = userRating(qid);
  if (cur === value) {
    delete d.ratings[currentUser]; // clicking same star removes rating
  } else {
    d.ratings[currentUser] = value;
  }
  refreshRatingUI(qid);
  if (sortMode === 'votes' || filterUnreviewed) setTimeout(() => applyRender(), 350);
  await saveBin(VOTES_BIN_ID, votes);
}

function refreshRatingUI(qid) {
  const pick = userRating(qid);
  const avg = avgRating(qid);
  const count = Object.keys(ratingData(qid).ratings).length;

  for (let i = 1; i <= 5; i++) {
    const btn = document.getElementById(`${qid}-star-${i}`);
    if (!btn) continue;
    btn.classList.toggle('lit', i <= (pick || avg));
    btn.classList.toggle('user-pick', i === pick);
  }

  const avgEl = document.getElementById(`${qid}-avg`);
  if (avgEl) {
    avgEl.innerHTML = count === 0
      ? `<span style="opacity:.45;font-style:italic">no ratings</span>`
      : `avg <span class="avg-val">${avg.toFixed(1)}</span> <span style="opacity:.5">(${count})</span>`;
  }

  const tip = document.getElementById(`${qid}-rater-tip`);
  if (tip) tip.innerHTML = raterTipHTML(qid);
}

function raterTipHTML(qid) {
  const entries = Object.entries(ratingData(qid).ratings);
  if (!entries.length)
    return `<div class="vt-title">Ratings</div><span class="vt-empty">no ratings yet</span>`;
  return `<div class="vt-title">Ratings</div>` +
    entries.map(([name, val]) =>
      `<div class="vt-row"><span class="vt-name">${esc(name)}</span><span class="vt-stars">${'★'.repeat(val)}${'☆'.repeat(5 - val)}</span></div>`
    ).join('');
}

function buildLikertHTML(qid) {
  const pick = userRating(qid);
  const avg = avgRating(qid);
  const count = Object.keys(ratingData(qid).ratings).length;
  const avgHTML = count === 0
    ? `<span style="opacity:.45;font-style:italic">no ratings</span>`
    : `avg <span class="avg-val">${avg.toFixed(1)}</span> <span style="opacity:.5">(${count})</span>`;

  const stars = [1, 2, 3, 4, 5].map(i => {
    const lit = i <= (pick || avg);
    const userPick = i === pick;
    const onClick = isLatest() ? `onclick="rate('${qid}',${i})"` : `style="cursor:default"`;
    return `<button class="star-btn${lit ? ' lit' : ''}${userPick ? ' user-pick' : ''}"
      id="${qid}-star-${i}" ${onClick} title="${LIKERT_LABELS[i]}">★</button>`;
  }).join('');

  return `
  <div class="likert-wrap">
    <span class="likert-label">Relevance</span>
    <div class="stars" id="${qid}-stars">${stars}</div>
    <span class="likert-avg" id="${qid}-avg">${avgHTML}</span>
    <div class="rater-tooltip" id="${qid}-rater-tip">${raterTipHTML(qid)}</div>
  </div>`;
}

// ─────────────────────────────────────────────
// TAG FILTER
// ─────────────────────────────────────────────
function rebuildTagButtons() {
  const allTags = [...new Set(QUESTIONS.flatMap(q => q.tags))].sort();
  const group = document.getElementById('tag-filter-group');
  [...group.querySelectorAll('.tag-pill')].forEach(b => b.remove());
  allTags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'pill-btn tag-pill' + (activeTags.has(tag) ? ' tag-active' : '');
    btn.id = 'filter-' + tag;
    btn.textContent = tag;
    btn.onclick = () => setFilter(tag);
    group.appendChild(btn);
  });
  document.getElementById('filter-all').className =
    'pill-btn' + (activeTags.size === 0 ? ' tag-active' : '');
}

function setFilter(tag) {
  if (tag === null) {
    activeTags.clear();
  } else {
    if (activeTags.has(tag)) activeTags.delete(tag);
    else activeTags.add(tag);
  }
  rebuildTagButtons();
  applyRender();
}

function toggleUnreviewed() {
  filterUnreviewed = !filterUnreviewed;
  document.getElementById('filter-unreviewed').classList.toggle('tag-active', filterUnreviewed);
  applyRender();
}

// ─────────────────────────────────────────────
// SORT
// ─────────────────────────────────────────────
function setSort(mode) {
  sortMode = mode;
  document.getElementById('sort-id').className = 'pill-btn' + (mode === 'id' ? ' active' : '');
  document.getElementById('sort-votes').className = 'pill-btn' + (mode === 'votes' ? ' active' : '');
  applyRender();
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────
function applyRender() {
  const list = document.getElementById('question-list');
  list.classList.add('sorting');
  setTimeout(() => { renderAll(); list.classList.remove('sorting'); }, 130);
}

function renderAll() {
  const list = document.getElementById('question-list');
  let visible = activeTags.size > 0
    ? QUESTIONS.filter(q => q.tags.some(t => activeTags.has(t)))
    : [...QUESTIONS];
  if (filterUnreviewed) {
    visible = visible.filter(q => !userRating(q.id));
  }
  visible.sort((a, b) => {
    if (sortMode === 'votes') {
      const diff = avgRating(b.id) - avgRating(a.id);
      if (diff !== 0) return diff;
    }
    const aMatch = a.id.match(/\d+/);
    const bMatch = b.id.match(/\d+/);
    const aNum = aMatch ? parseInt(aMatch[0], 10) : 0;
    const bNum = bMatch ? parseInt(bMatch[0], 10) : 0;
    return aNum - bNum;
  });
  if (visible.length === 0) {
    list.innerHTML = `<div class="empty-state">NO QUESTIONS MATCH THIS FILTER</div>`;
    return;
  }
  list.innerHTML = visible.map(q => buildCard(q)).join('');
  visible.forEach(q => {
    const p = document.getElementById(q.id + '-comments');
    if (p && p.classList.contains('open')) renderCommentList(q.id);
  });
  if (currentUser) {
    document.querySelectorAll('.comment-name-input').forEach(el => { if (!el.value) el.value = currentUser; });
  }
}

function buildCard(q) {
  const answers = (q.answers || []).map((a, i) =>
    `<div class="answer-item"><div class="answer-num">Answer ${i + 1}</div>${formatText(a)}</div>`
  ).join('');
  const tagBadges = q.tags.map(t =>
    `<span class="cq-scope" onclick="setFilter('${esc(t)}')" title="Filter by ${esc(t)}">${esc(t)}</span>`
  ).join('');
  const commentCount = (comments[q.id] || []).length;
  const commentLabel = commentCount > 0 ? `Comment (${commentCount})` : 'Comment';
  const isAdmin = currentUser.toLowerCase() === 'admin';

  const adminButtons = (isAdmin && isLatest()) ? `
    <button class="btn btn-admin-edit" onclick="duplicateQuestion('${q.id}')" title="Duplicate question">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Duplicate
    </button>
    <button class="btn btn-admin-edit" onclick="openEditModal('${q.id}')" title="Edit question">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Edit
    </button>
    <button class="btn btn-admin-delete" onclick="deleteQuestion('${q.id}')" title="Delete question">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      Delete
    </button>` : '';

  const addedByBadge = q.addedBy
    ? `<span class="added-by-badge">added by ${esc(q.addedBy)}</span>` : '';

  return `
  <div class="cq-card" id="${q.id}">
    <div class="cq-header">
      <div class="cq-meta"><span class="cq-id">${esc(q.label)}</span>${tagBadges}${addedByBadge}</div>
      <div class="cq-question">${formatText(q.question)}</div>
    </div>
    <div class="cq-actions">
      <button class="btn btn-answers" onclick="toggleAnswers('${q.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>
        Show Answers
      </button>
      ${buildLikertHTML(q.id)}
      <button class="btn btn-comment" id="${q.id}-comment-btn" onclick="toggleComments('${q.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        ${commentLabel}
      </button>
      ${adminButtons}
    </div>
    <div class="answers-panel" id="${q.id}-answers">
      <div class="answers-title">Exemplar Answers</div>${answers}
    </div>
    <div class="comment-panel" id="${q.id}-comments">
      <div class="comment-title">Comments</div>
      <div class="comment-list" id="${q.id}-comment-list"></div>
      <div class="comment-form" ${isLatest() ? '' : 'style="display:none"'}>
        <input class="comment-name-input" id="${q.id}-comment-name" placeholder="Your name" maxlength="60" value="${esc(currentUser)}" />
        <div class="comment-input-row">
          <textarea class="comment-input" id="${q.id}-comment-text" placeholder="Add a comment…"></textarea>
          <button class="btn-submit" onclick="submitComment('${q.id}')">Post</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────
// ANSWERS TOGGLE
// ─────────────────────────────────────────────
function toggleAnswers(id) {
  const panel = document.getElementById(id + '-answers');
  const btn = document.querySelector(`#${id} .btn-answers`);
  const open = panel.classList.toggle('open');
  btn.classList.toggle('active', open);
  const svg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>`;
  btn.innerHTML = `${svg} ${open ? 'Hide Answers' : 'Show Answers'}`;
}

// ─────────────────────────────────────────────
// COMMENTS
// ─────────────────────────────────────────────
function toggleComments(id) {
  const panel = document.getElementById(id + '-comments');
  const btn = document.getElementById(id + '-comment-btn');
  const open = panel.classList.toggle('open');
  btn.classList.toggle('active', open);
  if (open) {
    renderCommentList(id);
    const nameEl = document.getElementById(id + '-comment-name');
    if (currentUser && !nameEl.value) nameEl.value = currentUser;
    document.getElementById(id + '-comment-text').focus();
  }
}

async function submitComment(id) {
  if (!isLatest()) return;
  const nameEl = document.getElementById(id + '-comment-name');
  const textEl = document.getElementById(id + '-comment-text');
  const name = nameEl.value.trim(), text = textEl.value.trim();
  if (!name || !text) {
    if (!name) { nameEl.style.borderColor = '#9b3a2a'; setTimeout(() => nameEl.style.borderColor = '', 1200); }
    if (!text) { textEl.style.borderColor = '#9b3a2a'; setTimeout(() => textEl.style.borderColor = '', 1200); }
    return;
  }
  if (!comments[id]) comments[id] = [];
  const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  comments[id].push({ name, text, time: now });
  textEl.value = '';
  renderCommentList(id);
  updateCommentCount(id);
  await saveBin(COMMENTS_BIN_ID, comments);
}

function renderCommentList(id) {
  const list = document.getElementById(id + '-comment-list');
  if (!list) return;
  const isAdmin = currentUser.toLowerCase() === 'admin';
  list.innerHTML = (comments[id] || []).map((c, i) => `
    <div class="comment-bubble">
      <div class="cmeta">
        <span class="cmeta-name">${esc(c.name)}</span>
        <span class="cmeta-time">${c.time}</span>
        ${(isAdmin && isLatest()) ? `<button class="cmeta-del" onclick="deleteComment('${id}', ${i})" title="Delete comment">✕ delete</button>` : ''}
      </div>
      ${esc(c.text)}
    </div>`).join('');
}

async function deleteComment(qid, idx) {
  if (!isLatest() || !comments[qid]) return;
  comments[qid].splice(idx, 1);
  renderCommentList(qid);
  updateCommentCount(qid);
  await saveBin(COMMENTS_BIN_ID, comments);
}

function updateCommentCount(id) {
  const btn = document.getElementById(id + '-comment-btn');
  if (!btn) return;
  const count = (comments[id] || []).length;
  const svg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  btn.innerHTML = `${svg} Comment${count > 0 ? ` (${count})` : ''}`;
}

// ─────────────────────────────────────────────
// ADD QUESTION MODAL
// ─────────────────────────────────────────────
function openModal() {
  if (!isLatest()) return;
  modalTags = [];
  document.getElementById('f-question').value = '';
  document.getElementById('f-question').classList.remove('error');
  renderModalTags();
  const builder = document.getElementById('answers-builder');
  builder.innerHTML = '';
  addAnswerField();
  document.getElementById('f-id-preview').textContent = `CQ-${getNextCQNumber()}`;
  document.getElementById('modal-backdrop').classList.add('open');
  document.getElementById('f-question').focus();
}

function closeModal() { document.getElementById('modal-backdrop').classList.remove('open'); }
function handleBackdropClick(e) { if (e.target.id === 'modal-backdrop') closeModal(); }

function renderModalTags() {
  const wrap = document.getElementById('tags-wrap');
  const input = document.getElementById('tag-text-input');
  [...wrap.querySelectorAll('.tag-chip')].forEach(c => c.remove());
  modalTags.forEach((tag, i) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `${esc(tag)}<button onclick="removeModalTag(${i})" title="Remove">×</button>`;
    wrap.insertBefore(chip, input);
  });
}
function removeModalTag(i) { modalTags.splice(i, 1); renderModalTags(); }

function addAnswerField() {
  const builder = document.getElementById('answers-builder');
  const idx = builder.children.length + 1;
  const row = document.createElement('div');
  row.className = 'answer-row';
  row.innerHTML = `<span class="answer-row-num">${idx}</span><textarea placeholder="Answer ${idx}…"></textarea><button class="btn-remove-answer" onclick="removeAnswerField(this)" title="Remove"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;
  builder.appendChild(row);
  row.querySelector('textarea').focus();
}

function removeAnswerField(btn) {
  const builder = document.getElementById('answers-builder');
  if (builder.children.length <= 1) return;
  btn.closest('.answer-row').remove();
  [...builder.querySelectorAll('.answer-row')].forEach((row, i) => {
    row.querySelector('.answer-row-num').textContent = i + 1;
    row.querySelector('textarea').placeholder = `Answer ${i + 1}…`;
  });
}

async function saveQuestion() {
  const questionTx = document.getElementById('f-question').value.trim();
  const builder = document.getElementById('answers-builder');
  const answerTxts = [...builder.querySelectorAll('textarea')].map(t => t.value.trim());
  let valid = true;
  const markErr = el => { el.classList.add('error'); setTimeout(() => el.classList.remove('error'), 1500); valid = false; };
  if (!questionTx) markErr(document.getElementById('f-question'));
  answerTxts.forEach((a, i) => { if (!a) markErr(builder.querySelectorAll('textarea')[i]); });
  if (!valid || answerTxts.some(a => !a)) return;

  const nextN = getNextCQNumber();
  const newQ = {
    id: `cq-${nextN}`,
    label: `CQ-${nextN}`,
    tags: [...modalTags],
    question: questionTx,
    answers: answerTxts,
    ...(currentUser.toLowerCase() !== 'admin' ? { addedBy: currentUser } : {})
  };
  QUESTIONS.push(newQ);
  await saveBin(QUESTIONS_BIN_ID, QUESTIONS);
  closeModal();
  rebuildTagButtons();
  renderAll();
}

// ─────────────────────────────────────────────
// ADMIN: DELETE QUESTION
// ─────────────────────────────────────────────
async function deleteQuestion(qid) {
  if (!isLatest()) return;
  const q = QUESTIONS.find(q => q.id === qid);
  if (!q) return;
  if (!confirm(`Delete "${q.label}: ${q.question.slice(0, 60)}…"?\n\nThis cannot be undone.`)) return;
  QUESTIONS = QUESTIONS.filter(q => q.id !== qid);
  delete votes[qid];
  delete comments[qid];
  await Promise.all([
    saveBin(QUESTIONS_BIN_ID, QUESTIONS),
    saveBin(VOTES_BIN_ID, votes),
    saveBin(COMMENTS_BIN_ID, comments)
  ]);
  rebuildTagButtons();
  renderAll();
}

// ─────────────────────────────────────────────
// ADMIN: DUPLICATE QUESTION
// ─────────────────────────────────────────────
async function duplicateQuestion(qid) {
  if (!isLatest()) return;
  const qIdx = QUESTIONS.findIndex(q => q.id === qid);
  if (qIdx === -1) return;
  const q = QUESTIONS[qIdx];

  let baseLabel = q.label;
  let newCurrentLabel = baseLabel + '.1';
  let newDuplicateLabel = baseLabel + '.2';
  let newCurrentId = newCurrentLabel.toLowerCase().replace(/\s+/g, '-');
  let newDuplicateId = newDuplicateLabel.toLowerCase().replace(/\s+/g, '-');

  const duplicatedQ = {
    ...q,
    id: newDuplicateId,
    label: newDuplicateLabel,
    tags: [...q.tags],
    answers: [...q.answers]
  };

  const originalQ = {
    ...q,
    id: newCurrentId,
    label: newCurrentLabel
  };

  QUESTIONS.splice(qIdx, 1, originalQ, duplicatedQ);

  if (votes[qid]) {
    votes[newCurrentId] = votes[qid];
    delete votes[qid];
  }
  if (comments[qid]) {
    comments[newCurrentId] = comments[qid];
    delete comments[qid];
  }

  await Promise.all([
    saveBin(QUESTIONS_BIN_ID, QUESTIONS, latestVersion),
    saveBin(VOTES_BIN_ID, votes, latestVersion),
    saveBin(COMMENTS_BIN_ID, comments, latestVersion)
  ]);

  rebuildTagButtons();
  renderAll();
}

// ─────────────────────────────────────────────
// ADMIN: EDIT MODAL
// ─────────────────────────────────────────────
function openEditModal(qid) {
  if (!isLatest()) return;
  const q = QUESTIONS.find(q => q.id === qid);
  if (!q) return;
  editTags = [...q.tags];
  document.getElementById('ef-original-id').value = qid;
  document.getElementById('ef-id').value = q.label;
  document.getElementById('ef-question').value = q.question;
  ['ef-id', 'ef-question'].forEach(id => document.getElementById(id).classList.remove('error'));
  renderEditTags();
  const builder = document.getElementById('edit-answers-builder');
  builder.innerHTML = '';
  q.answers.forEach(a => addEditAnswerField(a));
  document.getElementById('edit-modal-backdrop').classList.add('open');
  document.getElementById('ef-id').focus();
}

function closeEditModal() { document.getElementById('edit-modal-backdrop').classList.remove('open'); }
function handleEditBackdropClick(e) { if (e.target.id === 'edit-modal-backdrop') closeEditModal(); }

function renderEditTags() {
  const wrap = document.getElementById('edit-tags-wrap');
  const input = document.getElementById('edit-tag-text-input');
  [...wrap.querySelectorAll('.tag-chip')].forEach(c => c.remove());
  editTags.forEach((tag, i) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `${esc(tag)}<button onclick="removeEditTag(${i})" title="Remove">×</button>`;
    wrap.insertBefore(chip, input);
  });
}
function removeEditTag(i) { editTags.splice(i, 1); renderEditTags(); }

function addEditAnswerField(value = '') {
  const builder = document.getElementById('edit-answers-builder');
  const idx = builder.children.length + 1;
  const row = document.createElement('div');
  row.className = 'answer-row';
  row.innerHTML = `<span class="answer-row-num">${idx}</span><textarea placeholder="Answer ${idx}…"></textarea><button class="btn-remove-answer" onclick="removeEditAnswerField(this)" title="Remove"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;
  builder.appendChild(row);
  if (value) row.querySelector('textarea').value = value;
}

function removeEditAnswerField(btn) {
  const builder = document.getElementById('edit-answers-builder');
  if (builder.children.length <= 1) return;
  btn.closest('.answer-row').remove();
  [...builder.querySelectorAll('.answer-row')].forEach((row, i) => {
    row.querySelector('.answer-row-num').textContent = i + 1;
    row.querySelector('textarea').placeholder = `Answer ${i + 1}…`;
  });
}

async function saveEdit() {
  const originalId = document.getElementById('ef-original-id').value;
  const idRaw = document.getElementById('ef-id').value.trim();
  const questionTx = document.getElementById('ef-question').value.trim();
  const builder = document.getElementById('edit-answers-builder');
  const answerTxts = [...builder.querySelectorAll('textarea')].map(t => t.value.trim());

  let valid = true;
  const markErr = el => { el.classList.add('error'); setTimeout(() => el.classList.remove('error'), 1500); valid = false; };
  if (!idRaw) markErr(document.getElementById('ef-id'));
  if (!questionTx) markErr(document.getElementById('ef-question'));
  answerTxts.forEach((a, i) => { if (!a) markErr(builder.querySelectorAll('textarea')[i]); });

  const normalId = idRaw.toLowerCase().replace(/\s+/g, '-');
  if (normalId !== originalId && QUESTIONS.find(q => q.id === normalId)) {
    const el = document.getElementById('ef-id');
    markErr(el);
    el.placeholder = 'ID already exists!';
    setTimeout(() => el.placeholder = 'e.g. CQ-2', 2000);
    valid = false;
  }
  if (!valid || answerTxts.some(a => !a)) return;

  const idx = QUESTIONS.findIndex(q => q.id === originalId);
  if (idx === -1) return;

  QUESTIONS[idx] = { ...QUESTIONS[idx], id: normalId, label: idRaw, tags: [...editTags], question: questionTx, answers: answerTxts };

  if (normalId !== originalId) {
    votes[normalId] = votes[originalId]; delete votes[originalId];
    comments[normalId] = comments[originalId]; delete comments[originalId];
  }

  await Promise.all([
    saveBin(QUESTIONS_BIN_ID, QUESTIONS),
    saveBin(VOTES_BIN_ID, votes),
    saveBin(COMMENTS_BIN_ID, comments)
  ]);
  closeEditModal();
  rebuildTagButtons();
  renderAll();
}

// ─────────────────────────────────────────────
// QUESTIONS — load from storage only
// ─────────────────────────────────────────────
function mergeQuestions(stored) {
  if (!Array.isArray(stored)) return [];
  return stored.filter(q => q && q.id && q.question && Array.isArray(q.answers));
}

// ─────────────────────────────────────────────
// ADMIN: BACKUP
// ─────────────────────────────────────────────
function downloadBackup() {
  const backup = {
    moduleId: currentModuleId,
    moduleTitle: currentModuleTitle,
    version: currentVersion,
    exportedAt: new Date().toISOString(),
    exportedBy: currentUser,
    questions: QUESTIONS.map(q => {
      const ratings = (votes[q.id] && votes[q.id].ratings) || {};
      const entries = Object.entries(ratings);
      const avg = entries.length
        ? (entries.reduce((s, [, v]) => s + v, 0) / entries.length).toFixed(2)
        : null;
      return {
        id: q.id,
        label: q.label,
        tags: q.tags,
        addedBy: q.addedBy || 'admin',
        question: q.question,
        answers: q.answers,
        ratings: {
          average: avg ? Number(avg) : null,
          count: entries.length,
          byUser: Object.fromEntries(
            entries.map(([user, val]) => [user, { score: val, label: LIKERT_LABELS[val] }])
          )
        },
        comments: (comments[q.id] || []).map(c => ({ author: c.name, time: c.time, text: c.text }))
      };
    })
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const modSlug = currentModuleId || 'all';
  a.download = `cq-backup-${modSlug}-v${currentVersion}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// ADMIN: NORMALIZE IDS
// ─────────────────────────────────────────────
async function normalizeIDs(bypassConfirm = false) {
  if (!isLatest()) return;
  if (!bypassConfirm && !confirm('Are you sure you want to normalize all IDs to CQ-1, CQ-2, etc., based on their current order? This cannot be undone.')) return;

  const newVotes = {};
  const newComments = {};

  QUESTIONS.forEach((q, index) => {
    const oldId = q.id;
    const newLabel = `CQ-${index + 1}`;
    const newId = `cq-${index + 1}`;

    if (votes[oldId]) newVotes[newId] = votes[oldId];
    if (comments[oldId]) newComments[newId] = comments[oldId];

    q.label = newLabel;
    q.id = newId;
  });

  votes = newVotes;
  comments = newComments;

  await Promise.all([
    saveBin(QUESTIONS_BIN_ID, QUESTIONS),
    saveBin(VOTES_BIN_ID, votes),
    saveBin(COMMENTS_BIN_ID, comments)
  ]);

  renderAll();
}

function updateAdminUI() {
  const isAdmin = currentUser.toLowerCase() === 'admin';

  const addModuleBtn = document.getElementById('btn-add-module');
  if (addModuleBtn) addModuleBtn.style.display = isAdmin ? 'inline-flex' : 'none';

  if (document.getElementById('modules-view') && document.getElementById('modules-view').style.display !== 'none') {
    renderModulesList();
  }

  const adminPanel = document.getElementById('admin-controls-panel');
  if (adminPanel) adminPanel.style.display = isAdmin ? 'flex' : 'none';
  
  document.getElementById('btn-backup').style.display = isAdmin ? 'inline-flex' : 'none';
  const btnReorder = document.getElementById('btn-reorder');
  if (btnReorder) btnReorder.style.display = isAdmin ? 'inline-flex' : 'none';
  const btnNormalize = document.getElementById('btn-normalize');
  if (btnNormalize) btnNormalize.style.display = isAdmin ? 'inline-flex' : 'none';
  const btnCreate = document.getElementById('btn-create-version');
  if (btnCreate) {
    btnCreate.style.display = isAdmin ? 'inline-flex' : 'none';
    if (!isLatest()) {
      btnCreate.disabled = true;
      btnCreate.style.opacity = '0.5';
      btnCreate.style.cursor = 'not-allowed';
      btnCreate.title = "You can only create versions from the latest version.";
    } else {
      btnCreate.disabled = false;
      btnCreate.style.opacity = '1';
      btnCreate.style.cursor = 'pointer';
      btnCreate.title = "";
    }
  }

  const btnAdd = document.querySelector('.btn-add-question');
  if (btnAdd) btnAdd.style.display = isLatest() ? 'inline-flex' : 'none';
}

// ─────────────────────────────────────────────
// ADMIN: REORDER CQs
// ─────────────────────────────────────────────
let dragSrcEl = null;

function handleDragStart(e) {
  dragSrcEl = this;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
  this.style.opacity = '0.4';
}

function handleDragOver(e) {
  if (e.preventDefault) { e.preventDefault(); }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  this.classList.add('over');
}

function handleDragLeave(e) {
  this.classList.remove('over');
}

function handleDrop(e) {
  if (e.stopPropagation) { e.stopPropagation(); }
  if (dragSrcEl !== this) {
    const srcId = dragSrcEl.dataset.id;
    const targetId = this.dataset.id;
    dragSrcEl.innerHTML = this.innerHTML;
    dragSrcEl.dataset.id = targetId;
    this.innerHTML = e.dataTransfer.getData('text/html');
    this.dataset.id = srcId;
  }
  return false;
}

function handleDragEnd(e) {
  this.style.opacity = '1';
  document.querySelectorAll('.reorder-item').forEach(item => {
    item.classList.remove('over');
  });
}

function openReorderModal() {
  if (!isLatest()) return;
  const list = document.getElementById('reorder-questions-list');

  const items = [...QUESTIONS].sort((a, b) => {
    const aMatch = a.id.match(/\d+/);
    const bMatch = b.id.match(/\d+/);
    const aNum = aMatch ? parseInt(aMatch[0], 10) : 0;
    const bNum = bMatch ? parseInt(bMatch[0], 10) : 0;
    return aNum - bNum;
  });

  list.innerHTML = items.map(q => `
    <div class="reorder-item" draggable="true" data-id="${esc(q.id)}" style="padding: 0.5rem; border: 1px solid var(--border); margin-bottom: 0.2rem; cursor: grab; background: var(--bg-card); display: flex; align-items: center; gap: 0.5rem; border-radius: 4px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
      <strong>${esc(q.label)}</strong>: <span style="font-size:0.85rem; color:var(--text-light); overflow: hidden; text-overflow: ellipsis; max-width: 400px;">${esc(q.question)}</span>
    </div>
  `).join('');

  const els = list.querySelectorAll('.reorder-item');
  els.forEach(el => {
    el.addEventListener('dragstart', handleDragStart, false);
    el.addEventListener('dragenter', handleDragEnter, false);
    el.addEventListener('dragover', handleDragOver, false);
    el.addEventListener('dragleave', handleDragLeave, false);
    el.addEventListener('drop', handleDrop, false);
    el.addEventListener('dragend', handleDragEnd, false);
  });

  document.getElementById('reorder-modal-backdrop').classList.add('open');
}

function closeReorderModal() {
  document.getElementById('reorder-modal-backdrop').classList.remove('open');
}

async function saveReorder() {
  const list = document.getElementById('reorder-questions-list');
  const orderedIds = [...list.querySelectorAll('.reorder-item')].map(el => el.dataset.id);

  const orderedQuestions = orderedIds.map(id => QUESTIONS.find(q => q.id === id)).filter(Boolean);
  const remaining = QUESTIONS.filter(q => !orderedIds.includes(q.id));
  QUESTIONS = [...orderedQuestions, ...remaining];

  closeReorderModal();
  await normalizeIDs(true);
}

function applyHighlight(textareaId) {
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;

  if (start === end) return; // No selection

  const text = textarea.value;
  const before = text.substring(0, start);
  const selected = text.substring(start, end);
  const after = text.substring(end);

  textarea.value = before + '*' + selected + '*' + after;

  // Reselect the text including asterisks
  textarea.focus();
  textarea.setSelectionRange(start, end + 2);
}

// ─────────────────────────────────────────────
// UTIL
// ─────────────────────────────────────────────

function getNextCQNumber() {
  let maxN = 0;
  QUESTIONS.forEach(q => {
    const match = q.label.match(/^CQ-(\d+)/i);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxN) maxN = n;
    }
  });
  return maxN + 1;
}
// ─────────────────────────────────────────────

// HTML-escape a string
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Escape then render **bold** and *italic* markdown markers
function formatText(str) {
  let out = esc(str);
  out = out.replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>');
  out = out.replace(/\*([^*]+?)\*/g, '<i>$1</i>');
  return out;
}

// ─────────────────────────────────────────────
// MODULES MANAGEMENT
// ─────────────────────────────────────────────
async function loadModules() {
  const loaded = await loadBin('modules', DEFAULT_MODULES, 1, null);
  modules = Array.isArray(loaded) && loaded.length > 0 ? loaded : [...DEFAULT_MODULES];
}

function renderModulesList() {
  const grid = document.getElementById('modules-grid');
  if (!grid) return;
  const isAdmin = currentUser.toLowerCase() === 'admin';

  const countBadge = document.getElementById('modules-count-badge');
  if (countBadge) {
    countBadge.textContent = `${modules.length} Ontology Module${modules.length === 1 ? '' : 's'}`;
  }

  const addBtn = document.getElementById('btn-add-module');
  if (addBtn) {
    addBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  if (modules.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; padding: 3rem 1rem;">NO MODULES AVAILABLE${isAdmin ? ' — CLICK "+ ADD MODULE" TO CREATE ONE' : ''}</div>`;
    return;
  }

  grid.innerHTML = modules.map(m => {
    const adminControls = isAdmin ? `
      <div class="module-admin-actions">
        <button class="btn-module-edit" onclick="openEditModuleModal('${esc(m.id)}', event)" title="Edit module title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit Title
        </button>
        <button class="btn-module-del" onclick="deleteModule('${esc(m.id)}', event)" title="Delete module">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          Delete
        </button>
      </div>
    ` : '';

    return `
      <div class="module-card" onclick="selectModule('${esc(m.id)}')">
        <div class="module-card-header">
          <span class="module-card-badge">Ontology Module</span>
          <h2 class="module-card-title">${esc(m.title)}</h2>
          <p class="module-card-desc">${esc(m.description || 'Review structured competency questions, inspect exemplar answers, and evaluate relevance.')}</p>
        </div>
        <div class="module-card-footer">
          <button class="btn-open-module" onclick="selectModule('${esc(m.id)}')">
            Select Module
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
          ${adminControls}
        </div>
      </div>
    `;
  }).join('');
}

async function selectModule(moduleId) {
  const mod = modules.find(m => m.id === moduleId);
  if (!mod) return;
  currentModuleId = mod.id;
  currentModuleTitle = mod.title;
  currentModuleDesc = mod.description || '';

  const url = new URL(window.location);
  url.searchParams.set('module', currentModuleId);
  url.searchParams.delete('v');
  window.history.pushState({}, '', url);

  document.getElementById('nav-module-title').textContent = currentModuleTitle;
  document.getElementById('module-workspace-title').textContent = currentModuleTitle;
  document.getElementById('module-workspace-desc').textContent = currentModuleDesc || 'Review structured competency questions, inspect exemplar answers, and annotate with votes and comments.';

  document.getElementById('modules-view').style.display = 'none';
  document.getElementById('workspace-view').style.display = 'block';

  await fetchAvailableVersions(currentModuleId);
  currentVersion = latestVersion;
  updateVersionSelector();
  await loadDataForVersion();
}

function showModulesScreen() {
  currentModuleId = null;
  currentModuleTitle = '';
  currentModuleDesc = '';

  const url = new URL(window.location);
  url.searchParams.delete('module');
  url.searchParams.delete('v');
  window.history.pushState({}, '', url);

  document.getElementById('workspace-view').style.display = 'none';
  document.getElementById('modules-view').style.display = 'block';

  renderModulesList();
}

function openAddModuleModal() {
  const titleInput = document.getElementById('mf-title');
  titleInput.value = '';
  document.getElementById('mf-desc').value = '';
  titleInput.classList.remove('error');
  document.getElementById('add-module-modal-backdrop').classList.add('open');
  titleInput.focus();
}

function closeAddModuleModal() {
  document.getElementById('add-module-modal-backdrop').classList.remove('open');
}

async function saveNewModule() {
  const titleInput = document.getElementById('mf-title');
  const title = titleInput.value.trim();
  const desc = document.getElementById('mf-desc').value.trim();
  if (!title) {
    titleInput.classList.add('error');
    setTimeout(() => titleInput.classList.remove('error'), 1500);
    titleInput.focus();
    return;
  }

  let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) slug = `mod-${Date.now()}`;
  if (modules.some(m => m.id === slug)) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }

  const newModule = {
    id: slug,
    title,
    description: desc,
    createdAt: new Date().toISOString()
  };

  modules.push(newModule);
  await saveBin('modules', modules, 1, null);
  closeAddModuleModal();
  renderModulesList();
}

function openEditModuleModal(moduleId, event) {
  if (event) event.stopPropagation();
  const mod = modules.find(m => m.id === moduleId);
  if (!mod) return;
  editingModuleId = moduleId;
  const titleInput = document.getElementById('emf-title');
  titleInput.value = mod.title;
  document.getElementById('emf-desc').value = mod.description || '';
  titleInput.classList.remove('error');
  document.getElementById('edit-module-modal-backdrop').classList.add('open');
  titleInput.focus();
}

function closeEditModuleModal() {
  document.getElementById('edit-module-modal-backdrop').classList.remove('open');
  editingModuleId = null;
}

async function saveEditModule() {
  const titleInput = document.getElementById('emf-title');
  const title = titleInput.value.trim();
  const desc = document.getElementById('emf-desc').value.trim();
  if (!title) {
    titleInput.classList.add('error');
    setTimeout(() => titleInput.classList.remove('error'), 1500);
    titleInput.focus();
    return;
  }

  const mod = modules.find(m => m.id === editingModuleId);
  if (!mod) return;
  mod.title = title;
  mod.description = desc;

  await saveBin('modules', modules, 1, null);
  closeEditModuleModal();
  renderModulesList();

  if (currentModuleId === mod.id) {
    currentModuleTitle = mod.title;
    currentModuleDesc = mod.description;
    document.getElementById('nav-module-title').textContent = mod.title;
    document.getElementById('module-workspace-title').textContent = mod.title;
    document.getElementById('module-workspace-desc').textContent = mod.description || '';
  }
}

async function deleteModule(moduleId, event) {
  if (event) event.stopPropagation();
  const mod = modules.find(m => m.id === moduleId);
  if (!mod) return;

  if (!confirm(`Are you sure you want to delete the module "${mod.title}" and all its competency questions and ratings?\n\nThis cannot be undone.`)) {
    return;
  }

  modules = modules.filter(m => m.id !== moduleId);
  await saveBin('modules', modules, 1, null);

  try {
    await fetch('/api/bin-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId })
    });
  } catch (e) {
    console.warn('bin-delete failed:', e);
  }

  renderModulesList();

  if (currentModuleId === moduleId) {
    showModulesScreen();
  }
}

// ─────────────────────────────────────────────
// INIT & VERSION CONTROL
// ─────────────────────────────────────────────
const isLatest = () => currentVersion === latestVersion;

async function fetchAvailableVersions(moduleId = currentModuleId) {
  try {
    const url = moduleId ? `/api/bin-list?moduleId=${encodeURIComponent(moduleId)}` : '/api/bin-list';
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      availableVersions = data.versions && data.versions.length ? data.versions : [1];
    } else {
      availableVersions = [1];
    }
  } catch (e) {
    console.warn('Failed to list versions, defaulting to [1]', e);
    availableVersions = [1];
  }
  latestVersion = Math.max(...availableVersions);
}

function updateVersionSelector() {
  const select = document.getElementById('version-select');
  select.innerHTML = '';
  const sorted = [...availableVersions].sort((a, b) => b - a);
  for (const i of sorted) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Version ${i}${i === latestVersion ? ' (Latest)' : ''}`;
    if (i === currentVersion) opt.selected = true;
    select.appendChild(opt);
  }
}

async function switchVersion(val) {
  const newV = parseInt(val, 10);
  if (newV === currentVersion) return;
  const url = new URL(window.location);
  url.searchParams.set('v', newV);
  window.history.pushState({}, '', url);
  currentVersion = newV;
  await loadDataForVersion();
}

async function loadDataForVersion() {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'flex';
  try {
    const [storedVotes, storedComments, storedQuestions] = await Promise.all([
      loadBin(VOTES_BIN_ID, {}, currentVersion, currentModuleId),
      loadBin(COMMENTS_BIN_ID, {}, currentVersion, currentModuleId),
      loadBin(QUESTIONS_BIN_ID, [], currentVersion, currentModuleId)
    ]);
    votes = storedVotes;
    comments = storedComments;
    QUESTIONS = mergeQuestions(storedQuestions);
    rebuildTagButtons();
    renderAll();
    updateAdminUI();
  } catch (e) {
    console.error('Failed to load data for version:', e);
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

function openImportModal() {
  document.getElementById('import-from-version').textContent = latestVersion;
  const list = document.getElementById('import-questions-list');

  const selectAllHtml = `
    <label style="display:flex; align-items:flex-start; gap:0.5rem; padding:0.5rem; border-bottom:1px solid var(--border); cursor:pointer; background:var(--bg-card); position:sticky; top:0;">
      <input type="checkbox" id="import-select-all" onchange="toggleAllImports(this.checked)" style="margin-top:0.2rem;" checked />
      <div style="font-weight:600; font-size:0.9rem;">Select / Unselect All</div>
    </label>
  `;

  const questionsHtml = QUESTIONS.map(q => `
    <label style="display:flex; align-items:flex-start; gap:0.5rem; padding:0.5rem; border-bottom:1px solid var(--border); cursor:pointer;">
      <input type="checkbox" class="import-chk" value="${esc(q.id)}" style="margin-top:0.2rem;" checked onchange="updateSelectAllState()" />
      <div>
        <div style="font-weight:500; font-size:0.9rem;">${esc(q.label)}</div>
        <div style="font-size:0.85rem; color:var(--text-light);">${formatText(q.question)}</div>
      </div>
    </label>
  `).join('');

  list.innerHTML = QUESTIONS.length > 0 ? selectAllHtml + questionsHtml : `<div style="padding:1rem; text-align:center; color:var(--text-light);">No questions in version ${latestVersion} to import.</div>`;
  document.getElementById('import-modal-backdrop').classList.add('open');
}

function toggleAllImports(checked) {
  document.querySelectorAll('.import-chk').forEach(chk => chk.checked = checked);
}

function updateSelectAllState() {
  const allChecked = [...document.querySelectorAll('.import-chk')].every(chk => chk.checked);
  const selectAll = document.getElementById('import-select-all');
  if (selectAll) selectAll.checked = allChecked;
}

function closeImportModal() {
  document.getElementById('import-modal-backdrop').classList.remove('open');
}

async function createVersion() {
  const btn = document.getElementById('btn-confirm-create-version');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  const checkedIds = [...document.querySelectorAll('.import-chk:checked')].map(el => el.value);
  const importedQuestions = QUESTIONS.filter(q => checkedIds.includes(q.id)).map(q => ({
    ...q,
    answers: [...q.answers],
    tags: [...q.tags]
  }));

  const nextV = latestVersion + 1;
  await Promise.all([
    saveBin(QUESTIONS_BIN_ID, importedQuestions, nextV, currentModuleId),
    saveBin(VOTES_BIN_ID, {}, nextV, currentModuleId),
    saveBin(COMMENTS_BIN_ID, {}, nextV, currentModuleId)
  ]);

  availableVersions.push(nextV);
  latestVersion = nextV;
  closeImportModal();
  btn.disabled = false;
  btn.textContent = 'Create Version';

  updateVersionSelector();
  await switchVersion(nextV);
}

(async () => {
  try {
    await loadModules();
    renderModulesList();

    const urlParams = new URLSearchParams(window.location.search);
    const modParam = urlParams.get('module');

    if (modParam && modules.some(m => m.id === modParam)) {
      currentModuleId = modParam;
      const mod = modules.find(m => m.id === modParam);
      if (mod) {
        currentModuleTitle = mod.title;
        currentModuleDesc = mod.description || '';
      }
    }
  } catch (e) {
    console.error('Initialization error:', e);
  } finally {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  }

  document.getElementById('username-input').focus();
})();
