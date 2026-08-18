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
let QUESTIONS = [];
let votes = {};
let comments = {};
let sortMode = 'id';
let activeTags = new Set(); // empty = show all
let filterUnreviewed = false;
let modalTags = [];
let editTags = [];

const LIKERT_LABELS = ['', 'Not Relevant', 'Slightly Relevant', 'Moderately Relevant', 'Very Relevant', 'Highly Relevant'];

// ─────────────────────────────────────────────
// PROXY HELPERS  (key stays on the server)
// ─────────────────────────────────────────────
async function loadBin(binId, fallback) {
  try {
    const res = await fetch(`/api/bin-read?binId=${encodeURIComponent(binId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).record ?? fallback;
  } catch (e) {
    console.warn('bin-read failed:', e);
    return fallback;
  }
}

async function saveBin(binId, data) {
  showSaving(true);
  try {
    const res = await fetch('/api/bin-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ binId, data })
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
function submitUsername() {
  const input = document.getElementById('username-input');
  const name = input.value.trim();
  if (!name) {
    input.classList.add('error');
    setTimeout(() => input.classList.remove('error'), 1200);
    input.focus();
    return;
  }
  currentUser = name;
  document.getElementById('username-backdrop').classList.remove('open');
  document.getElementById('user-chip-name').textContent = name;
  document.querySelectorAll('.comment-name-input').forEach(el => el.value = name);
  renderAll();
  updateAdminUI();
  QUESTIONS.forEach(q => refreshRatingUI(q.id));
}

function promptRename() {
  const newName = prompt('Change your display name:', currentUser);
  if (newName && newName.trim()) {
    currentUser = newName.trim();
    document.getElementById('user-chip-name').textContent = currentUser;
    document.querySelectorAll('.comment-name-input').forEach(el => el.value = currentUser);
    renderAll();
    updateAdminUI();
  }
}

// ─────────────────────────────────────────────
// DOM-READY: keyboard handlers
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Username modal — Enter key
  document.getElementById('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitUsername();
  });

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
    return `<button class="star-btn${lit ? ' lit' : ''}${userPick ? ' user-pick' : ''}"
      id="${qid}-star-${i}" onclick="rate('${qid}',${i})" title="${LIKERT_LABELS[i]}">★</button>`;
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
    return QUESTIONS.indexOf(a) - QUESTIONS.indexOf(b);
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

  const adminButtons = isAdmin ? `
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
      <div class="comment-form">
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
        ${isAdmin ? `<button class="cmeta-del" onclick="deleteComment('${id}', ${i})" title="Delete comment">✕ delete</button>` : ''}
      </div>
      ${esc(c.text)}
    </div>`).join('');
}

async function deleteComment(qid, idx) {
  if (!comments[qid]) return;
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
  modalTags = [];
  document.getElementById('f-question').value = '';
  document.getElementById('f-question').classList.remove('error');
  renderModalTags();
  const builder = document.getElementById('answers-builder');
  builder.innerHTML = '';
  addAnswerField();
  document.getElementById('f-id-preview').textContent = `CQ-${QUESTIONS.length}`;
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

  const nextN = QUESTIONS.length;
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
// ADMIN: EDIT MODAL
// ─────────────────────────────────────────────
function openEditModal(qid) {
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
  a.download = `cq-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function updateAdminUI() {
  const isAdmin = currentUser.toLowerCase() === 'admin';
  document.getElementById('btn-backup').style.display = isAdmin ? 'inline-flex' : 'none';
}

// ─────────────────────────────────────────────
// UTIL
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
// INIT
// ─────────────────────────────────────────────
(async () => {
  const [storedVotes, storedComments, storedQuestions] = await Promise.all([
    loadBin(VOTES_BIN_ID, {}),
    loadBin(COMMENTS_BIN_ID, {}),
    loadBin(QUESTIONS_BIN_ID, [])
  ]);
  votes = storedVotes;
  comments = storedComments;
  QUESTIONS = mergeQuestions(storedQuestions);
  rebuildTagButtons();
  renderAll();
  document.getElementById('loading').style.display = 'none';
  document.getElementById('username-input').focus();
})();
