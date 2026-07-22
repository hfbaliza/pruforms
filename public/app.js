'use strict';

/* ================= mode & state ================= */

const IS_ADMIN = !!window.PRUFORMS_ADMIN;

const app = document.getElementById('app');
const topbarNote = document.getElementById('topbarNote');

const state = {
  forms: [],
  def: null,           // current form definition
  session: null,       // {id, formId, answers, status}
  sectionIndex: 0,     // index into visibleSections()
  returnToReview: false,
  previewOpen: false,
  pads: {},            // questionId -> SignaturePad
  pending: {},         // answers not yet flushed to the server
  flushTimer: null,
  adminToken: localStorage.getItem('pruforms.adminToken') || null,
};

/* ---- client-side record of "my" sessions (this browser) ---- */

function mySessionIds() {
  try {
    return JSON.parse(localStorage.getItem('pruforms.mySessions') || '[]');
  } catch {
    return [];
  }
}

function rememberSession(id) {
  const ids = mySessionIds();
  if (!ids.includes(id)) {
    ids.unshift(id);
    localStorage.setItem('pruforms.mySessions', JSON.stringify(ids.slice(0, 50)));
  }
}

function forgetSession(id) {
  localStorage.setItem(
    'pruforms.mySessions',
    JSON.stringify(mySessionIds().filter((x) => x !== id))
  );
}

/* ================= conditions (mirror of server logic) ================= */

function evalCondition(cond, answers) {
  if (!cond) return true;
  if (Array.isArray(cond)) return cond.every((c) => evalCondition(c, answers));
  if (cond.or) return cond.or.some((c) => evalCondition(c, answers));
  const v = answers[cond.q];
  if ('eq' in cond) return v === cond.eq;
  if ('ne' in cond) return v !== cond.ne;
  if ('in' in cond) return Array.isArray(v) ? v.some((x) => cond.in.includes(x)) : cond.in.includes(v);
  if ('gte' in cond) return Number(v) >= cond.gte;
  if ('truthy' in cond) {
    const t = !(v === undefined || v === null || v === '' || v === false ||
      (Array.isArray(v) && v.length === 0));
    return cond.truthy ? t : !t;
  }
  return true;
}

function questionVisible(q, answers) {
  if (q.admin && !IS_ADMIN) return false;
  return evalCondition(q.showIf, answers);
}

function visibleSections() {
  const a = state.session.answers;
  return state.def.sections.filter((s) => {
    if (s.admin && !IS_ADMIN) return false;
    return evalCondition(s.showIf, a) && s.questions.some((q) => questionVisible(q, a));
  });
}

function visibleQuestionsOf(section) {
  const a = state.session.answers;
  return section.questions.filter((q) => questionVisible(q, a));
}

/* ================= api helpers ================= */

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.adminToken) headers['x-admin-token'] = state.adminToken;
  const res = await fetch(path, { headers, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---- autosave ---- */

function setAnswer(qid, value) {
  const empty = value === undefined || value === null || value === '' ||
    (Array.isArray(value) && value.length === 0) || value === false;
  if (empty) {
    delete state.session.answers[qid];
    state.pending[qid] = null;
  } else {
    state.session.answers[qid] = value;
    state.pending[qid] = value;
  }
  setSaveState('Saving…', false);
  clearTimeout(state.flushTimer);
  state.flushTimer = setTimeout(() => flushAnswers(), 700);
}

async function flushAnswers() {
  clearTimeout(state.flushTimer);
  const batch = state.pending;
  if (!Object.keys(batch).length) return true;
  state.pending = {};
  try {
    await api(`/api/sessions/${state.session.id}/answers`, {
      method: 'PUT',
      body: JSON.stringify({ answers: batch }),
    });
    setSaveState('✓ All changes saved', true);
    return true;
  } catch (err) {
    if (err.status === 403) {
      setSaveState('⚠ ' + err.message, false);
      return false;
    }
    Object.assign(state.pending, batch);
    setSaveState('⚠ Could not save — check connection', false);
    return false;
  }
}

function setSaveState(text, ok) {
  document.querySelectorAll('.save-state').forEach((el) => {
    el.textContent = text;
    el.classList.toggle('saved', !!ok);
  });
}

/* ================= misc ================= */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function isEmptyValue(v) {
  return v === undefined || v === null || v === '' || v === false ||
    (Array.isArray(v) && v.length === 0);
}

function validate(q, value) {
  if (isEmptyValue(value)) return q.required ? 'This field is required.' : null;
  switch (q.type) {
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.';
      break;
    case 'phone':
      if (!/^[+()\-\s\d]{6,25}$/.test(value)) return 'Enter a valid phone number.';
      break;
    case 'number':
      if (!/^[\d.,]+$/.test(String(value))) return 'Enter a number.';
      break;
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Pick a date.';
      break;
  }
  return null;
}

function statusBadge(status) {
  const map = {
    in_progress: ['In progress', 'badge-progress'],
    submitted: ['Needs review', 'badge-submitted'],
    reviewed: ['Reviewed', 'badge-reviewed'],
    completed: ['Reviewed', 'badge-reviewed'],
  };
  const [label, cls] = map[status] || [status, 'badge-progress'];
  return `<span class="badge ${cls}">${label}</span>`;
}

/* ================= client home ================= */

async function showHome() {
  if (IS_ADMIN) return showAdmin();
  topbarNote.textContent = '';
  state.def = null;
  state.session = null;
  state.previewOpen = false;
  app.classList.remove('wide');
  app.innerHTML = '<div class="loading">Loading…</div>';
  const [forms, mine] = await Promise.all([
    api('/api/forms'),
    api('/api/sessions/lookup', {
      method: 'POST',
      body: JSON.stringify({ ids: mySessionIds() }),
    }).catch(() => []),
  ]);
  state.forms = forms;

  const inProgress = mine.filter((s) => s.status === 'in_progress' && s.answered > 0);
  const submitted = mine.filter((s) => s.status !== 'in_progress');

  app.innerHTML = `
    <div class="hero">
      <h1>What would you like to do today?</h1>
      <p>Pick a request below — you'll fill in a clean electronic version of the form,
         page by page. When you submit, it is sent to our administrator for review,
         and you can download a copy for your records.</p>
    </div>
    <div class="form-grid">
      ${forms.map((f) => `
        <div class="form-card" data-form="${esc(f.id)}">
          <h3>${esc(f.title)}</h3>
          <p>${esc(f.description)}</p>
          <span class="cta">Start →</span>
        </div>`).join('')}
    </div>

    <h2 class="subhead">Continue where you left off</h2>
    <div class="session-list" id="resumeList">
      ${inProgress.length ? inProgress.map((s) => `
        <div class="session-item">
          <div class="meta">
            <b>${esc(s.formTitle)}</b>
            <span>${s.answered} answer${s.answered === 1 ? '' : 's'} saved · last updated ${new Date(s.updatedAt).toLocaleString()}</span>
          </div>
          <button class="btn ghost small" data-resume="${esc(s.id)}">Continue</button>
          <button class="btn danger-ghost small" data-discard="${esc(s.id)}">Discard</button>
        </div>`).join('')
      : '<div class="empty-note">Nothing in progress — your unfinished forms will appear here automatically.</div>'}
    </div>

    <h2 class="subhead">Your submitted forms</h2>
    <div class="session-list" id="doneList">
      ${submitted.length ? submitted.map((s) => `
        <div class="session-item">
          <div class="meta">
            <b>${esc(s.formTitle)}</b> ${statusBadge(s.status)}
            <span>submitted ${s.submittedAt ? new Date(s.submittedAt).toLocaleString() : ''}</span>
          </div>
          <a class="btn ghost small" href="/api/sessions/${esc(s.id)}/pdf?download=1">Download copy</a>
        </div>`).join('')
      : '<div class="empty-note">Forms you submit will be listed here, with a downloadable copy.</div>'}
    </div>
  `;

  app.querySelectorAll('.form-card').forEach((el) =>
    el.addEventListener('click', () => startForm(el.dataset.form)));
  app.querySelectorAll('[data-resume]').forEach((el) =>
    el.addEventListener('click', () => resumeSession(el.dataset.resume)));
  app.querySelectorAll('[data-discard]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (!confirm('Discard this saved form and its answers?')) return;
      await api(`/api/sessions/${el.dataset.discard}`, { method: 'DELETE' });
      forgetSession(el.dataset.discard);
      showHome();
    }));
}

async function startForm(formId) {
  app.innerHTML = '<div class="loading">Preparing the form…</div>';
  const def = await api(`/api/forms/${formId}`);
  const session = await api('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ formId }),
  });
  if (!IS_ADMIN) rememberSession(session.id);
  state.def = def;
  state.session = session;
  state.sectionIndex = 0;
  state.returnToReview = false;
  state.previewOpen = false;
  renderSection();
}

async function resumeSession(sessionId, toReview = false) {
  app.innerHTML = '<div class="loading">Loading saved answers…</div>';
  const session = await api(`/api/sessions/${sessionId}`);
  const def = await api(`/api/forms/${session.formId}`);
  state.def = def;
  state.session = session;
  state.returnToReview = false;
  state.previewOpen = false;
  if (!IS_ADMIN && session.status !== 'in_progress') {
    // submitted forms are read-only for clients
    return showHome();
  }
  if (toReview) return showReview();
  const sections = visibleSections();
  let idx = sections.findIndex((s) =>
    visibleQuestionsOf(s).some((q) => isEmptyValue(session.answers[q.id])));
  state.sectionIndex = idx === -1 ? sections.length - 1 : idx;
  renderSection();
}

/* ================= admin views ================= */

function showAdminLogin(message) {
  topbarNote.textContent = 'Admin';
  app.classList.remove('wide');
  app.innerHTML = `
    <div class="login-card">
      <h2>Administrator sign-in</h2>
      <p>Enter the admin password to review client submissions.</p>
      <input type="password" id="adminPass" placeholder="Admin password" autocomplete="current-password">
      <button class="btn primary" id="loginBtn">Sign in</button>
      <div class="error-msg" id="loginMsg">${esc(message || '')}</div>
    </div>
  `;
  const tryLogin = async () => {
    const password = document.getElementById('adminPass').value;
    const msg = document.getElementById('loginMsg');
    try {
      const { token } = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      state.adminToken = token;
      localStorage.setItem('pruforms.adminToken', token);
      showAdmin();
    } catch (err) {
      msg.textContent = err.message;
    }
  };
  document.getElementById('loginBtn').addEventListener('click', tryLogin);
  document.getElementById('adminPass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryLogin();
  });
  setTimeout(() => document.getElementById('adminPass').focus(), 30);
}

async function showAdmin() {
  if (!state.adminToken) return showAdminLogin();
  topbarNote.textContent = 'Admin dashboard';
  state.def = null;
  state.session = null;
  state.previewOpen = false;
  app.classList.remove('wide');
  app.innerHTML = '<div class="loading">Loading submissions…</div>';
  let sessions;
  try {
    sessions = await api('/api/sessions');
  } catch (err) {
    if (err.status === 401) {
      state.adminToken = null;
      localStorage.removeItem('pruforms.adminToken');
      return showAdminLogin('Session expired — please sign in again.');
    }
    throw err;
  }

  const needsReview = sessions.filter((s) => s.status === 'submitted');
  const others = sessions.filter((s) => s.status !== 'submitted');

  const row = (s) => `
    <div class="session-item">
      <div class="meta">
        <b>${esc(s.formTitle)}</b> ${statusBadge(s.status)}
        <span>${s.client ? esc(s.client) + ' · ' : ''}${s.answered} answers ·
          ${s.submittedAt ? 'submitted ' + new Date(s.submittedAt).toLocaleString() : 'updated ' + new Date(s.updatedAt).toLocaleString()}</span>
      </div>
      <button class="btn primary small" data-open="${esc(s.id)}">
        ${s.status === 'submitted' ? 'Review & edit' : 'Open'}
      </button>
      ${s.status !== 'in_progress'
        ? `<a class="btn ghost small" href="/api/sessions/${esc(s.id)}/pdf?download=1">Download</a>`
        : ''}
      <button class="btn danger-ghost small" data-del="${esc(s.id)}">Delete</button>
    </div>`;

  app.innerHTML = `
    <div class="hero">
      <h1>Submissions</h1>
      <p>Forms submitted by clients arrive here for review. Open one to edit any answer,
         add witness signatures, and produce the final document.
         <button class="btn ghost small" id="logoutBtn" style="float:right">Sign out</button></p>
    </div>
    <h2 class="subhead">Needs review ${needsReview.length ? `<span class="badge badge-submitted">${needsReview.length}</span>` : ''}</h2>
    <div class="session-list">
      ${needsReview.length ? needsReview.map(row).join('')
        : '<div class="empty-note">No submissions waiting for review.</div>'}
    </div>
    <h2 class="subhead">Everything else</h2>
    <div class="session-list">
      ${others.length ? others.map(row).join('')
        : '<div class="empty-note">Nothing here yet.</div>'}
    </div>
  `;

  document.getElementById('logoutBtn').addEventListener('click', () => {
    state.adminToken = null;
    localStorage.removeItem('pruforms.adminToken');
    showAdminLogin();
  });
  app.querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', () => resumeSession(el.dataset.open, true)));
  app.querySelectorAll('[data-del]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (!confirm('Delete this submission and its PDF permanently?')) return;
      await api(`/api/sessions/${el.dataset.del}`, { method: 'DELETE' });
      showAdmin();
    }));
}

/* ================= section page (electronic form) ================= */

function renderSection(focusQid) {
  const sections = visibleSections();
  if (state.sectionIndex >= sections.length) return showReview();
  if (state.sectionIndex < 0) state.sectionIndex = 0;
  const section = sections[state.sectionIndex];
  const questions = visibleQuestionsOf(section);
  topbarNote.textContent = state.def.title + (IS_ADMIN ? ' — admin edit' : '');
  state.pads = {};
  app.classList.toggle('wide', state.previewOpen);

  const pct = Math.round((state.sectionIndex / sections.length) * 100);

  app.innerHTML = `
    <div class="form-toolbar">
      <button class="btn ghost small" id="exitBtn" title="Leave this form">← ${IS_ADMIN ? 'Dashboard' : 'All forms'}</button>
      <div class="toolbar-title">
        <b>${esc(state.def.title)}</b>
        <span>Page ${state.sectionIndex + 1} of ${sections.length + 1} — ${esc(section.title)}</span>
      </div>
      <div class="toolbar-actions">
        <button class="btn small btn-save" id="saveBtn">Save</button>
        <button class="btn small btn-preview" id="previewBtn">${state.previewOpen ? 'Close preview' : 'Preview PDF'}</button>
      </div>
    </div>
    <div class="progress-wrap">
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="progress-label">
        <span>${sections.map((s, i) => `<span class="step-dot ${i < state.sectionIndex ? 'done' : ''} ${i === state.sectionIndex ? 'current' : ''}" title="${esc(s.title)}"></span>`).join('')}</span>
        <span>${pct}% complete</span>
      </div>
    </div>

    <div class="workspace ${state.previewOpen ? 'split' : ''}">
      <div class="form-col">
        <div class="page-card">
          <h2 class="page-title">${esc(section.title)}${section.admin ? ' <span class="badge badge-submitted">admin only</span>' : ''}</h2>
          ${section.intro ? `<p class="section-intro">${esc(section.intro)}</p>` : ''}
          <div id="fields"></div>
          <div class="nav-row">
            <button class="btn ghost" id="backBtn" ${state.sectionIndex === 0 && !state.returnToReview ? 'disabled' : ''}>← Back</button>
            <div class="right">
              ${state.returnToReview
                ? '<button class="btn primary" id="nextBtn">Save & return to review</button>'
                : `<button class="btn primary" id="nextBtn">${state.sectionIndex === sections.length - 1 ? 'Review answers →' : 'Next page →'}</button>`}
            </div>
          </div>
          <div class="save-state"></div>
        </div>
      </div>
      ${state.previewOpen ? previewPanelHtml() : ''}
    </div>
  `;

  const fieldsEl = document.getElementById('fields');
  for (const q of questions) fieldsEl.appendChild(buildField(q));

  document.getElementById('exitBtn').addEventListener('click', exitForm);
  document.getElementById('saveBtn').addEventListener('click', async () => {
    collectAllFieldValues();
    const ok = await flushAnswers();
    if (ok) setSaveState('✓ All changes saved', true);
  });
  document.getElementById('previewBtn').addEventListener('click', async () => {
    collectAllFieldValues();
    await flushAnswers();
    state.previewOpen = !state.previewOpen;
    renderSection();
  });
  document.getElementById('backBtn').addEventListener('click', async () => {
    collectAllFieldValues();
    await flushAnswers();
    if (state.returnToReview) { state.returnToReview = false; return showReview(); }
    state.sectionIndex -= 1;
    renderSection();
    window.scrollTo(0, 0);
  });
  document.getElementById('nextBtn').addEventListener('click', async () => {
    collectAllFieldValues();
    if (!validateSection(section)) return;
    await flushAnswers();
    if (state.returnToReview) { state.returnToReview = false; return showReview(); }
    state.sectionIndex += 1;
    renderSection();
    window.scrollTo(0, 0);
  });
  if (state.previewOpen) wirePreviewPanel();

  if (focusQid) {
    const el = document.querySelector(`[data-field="${CSS.escape(focusQid)}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.add('flash');
      const input = el.querySelector('input, textarea, select');
      if (input) input.focus();
    }
  }
}

function collectAllFieldValues() {
  document.querySelectorAll('#fields [data-field]').forEach((row) => {
    const qid = row.dataset.field;
    const input = row.querySelector('input[data-text], textarea[data-text], select[data-text]');
    if (input) {
      const v = input.value.trim();
      if ((state.session.answers[qid] || '') !== v) setAnswer(qid, v);
    }
    const pad = state.pads[qid];
    if (pad && !pad.isEmpty()) {
      const url = pad.toDataURL();
      if (state.session.answers[qid] !== url) setAnswer(qid, url);
    }
  });
}

function validateSection(section) {
  let firstBad = null;
  let ok = true;
  for (const q of visibleQuestionsOf(section)) {
    const row = document.querySelector(`[data-field="${CSS.escape(q.id)}"]`);
    if (!row) continue;
    // the admin may leave client-required questions as the client answered them
    const err = IS_ADMIN ? null : validate(q, state.session.answers[q.id]);
    row.classList.toggle('error', !!err);
    row.querySelector('.field-error').textContent = err || '';
    if (err && !firstBad) firstBad = row;
    if (err) ok = false;
  }
  if (firstBad) firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return ok;
}

function maybeRerender(section) {
  const before = Array.from(document.querySelectorAll('#fields [data-field]'))
    .map((el) => el.dataset.field).join(',');
  const after = visibleQuestionsOf(section).map((q) => q.id).join(',');
  if (before !== after) {
    collectAllFieldValues();
    renderSection();
    return;
  }
  const sBefore = document.querySelectorAll('.step-dot').length;
  if (sBefore !== visibleSections().length) renderSection();
}

/* ---------- field builders ---------- */

function buildField(q) {
  const row = document.createElement('div');
  row.className = 'field';
  row.dataset.field = q.id;
  const label = document.createElement('label');
  label.className = 'field-label';
  label.innerHTML = `${esc(q.q)}${q.required ? ' <span class="req">*</span>' : ''}` +
    (q.admin ? ' <span class="badge badge-submitted">admin</span>' : '');
  row.appendChild(label);
  if (q.help) {
    const help = document.createElement('div');
    help.className = 'field-help';
    help.textContent = q.help;
    row.appendChild(help);
  }
  const control = document.createElement('div');
  control.className = 'field-control';
  row.appendChild(control);
  const errEl = document.createElement('div');
  errEl.className = 'field-error';
  row.appendChild(errEl);

  const section = visibleSections()[state.sectionIndex];
  const existing = state.session.answers[q.id];

  if (['text', 'email', 'phone', 'number', 'date'].includes(q.type)) {
    const typeMap = { text: 'text', email: 'email', phone: 'tel', number: 'number', date: 'date' };
    const input = document.createElement('input');
    input.type = typeMap[q.type];
    input.dataset.text = '1';
    if (q.type === 'number') { input.min = '0'; input.step = 'any'; }
    if (existing !== undefined) input.value = existing;
    input.addEventListener('input', () => setAnswer(q.id, input.value.trim()));
    input.addEventListener('blur', () => maybeRerender(section));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault();
    });
    control.appendChild(input);
  } else if (q.type === 'textarea') {
    const input = document.createElement('textarea');
    input.dataset.text = '1';
    if (existing !== undefined) input.value = existing;
    input.addEventListener('input', () => setAnswer(q.id, input.value.trim()));
    input.addEventListener('blur', () => maybeRerender(section));
    control.appendChild(input);
  } else if (q.type === 'dropdown') {
    const select = document.createElement('select');
    select.dataset.text = '1';
    select.innerHTML = '<option value="">— Select —</option>' +
      q.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    if (existing !== undefined) select.value = existing;
    select.addEventListener('change', () => {
      setAnswer(q.id, select.value);
      maybeRerender(section);
    });
    control.appendChild(select);
  } else if (q.type === 'radio') {
    const wrap = document.createElement('div');
    wrap.className = 'opt-list';
    for (const o of q.options) {
      const div = document.createElement('div');
      div.className = 'opt' + (existing === o.value ? ' selected' : '');
      div.innerHTML = `<span class="dot"></span><span>${esc(o.label)}</span>`;
      div.addEventListener('click', () => {
        wrap.querySelectorAll('.opt').forEach((el) => el.classList.remove('selected'));
        div.classList.add('selected');
        setAnswer(q.id, o.value);
        maybeRerender(section);
      });
      wrap.appendChild(div);
    }
    control.appendChild(wrap);
  } else if (q.type === 'checkbox') {
    const div = document.createElement('div');
    div.className = 'opt checkbox' + (existing === true ? ' selected' : '');
    div.innerHTML = `<span class="dot"></span><span>${esc(q.label || 'Yes')}</span>`;
    div.addEventListener('click', () => {
      const val = !div.classList.contains('selected');
      div.classList.toggle('selected', val);
      setAnswer(q.id, val);
      maybeRerender(section);
    });
    control.appendChild(div);
  } else if (q.type === 'checkboxes') {
    const chosen = new Set(Array.isArray(existing) ? existing : []);
    const wrap = document.createElement('div');
    wrap.className = 'opt-list';
    for (const o of q.options) {
      const div = document.createElement('div');
      div.className = 'opt checkbox' + (chosen.has(o.value) ? ' selected' : '');
      div.innerHTML = `<span class="dot"></span><span>${esc(o.label)}</span>`;
      div.addEventListener('click', () => {
        if (chosen.has(o.value)) chosen.delete(o.value); else chosen.add(o.value);
        div.classList.toggle('selected', chosen.has(o.value));
        setAnswer(q.id, Array.from(chosen));
        maybeRerender(section);
      });
      wrap.appendChild(div);
    }
    control.appendChild(wrap);
  } else if (q.type === 'signature') {
    buildSignatureControl(control, q, existing);
  } else {
    control.textContent = `Unsupported type: ${q.type}`;
  }
  return row;
}

function buildSignatureControl(control, q, existing) {
  const saved = typeof existing === 'string' ? existing : null;
  control.innerHTML = `
    ${saved ? `<div class="sig-saved">
        <img class="sig-preview" src="${saved}" alt="signature">
        <button class="btn ghost small" data-redraw>Redraw</button>
      </div>` : ''}
    <div class="sig-wrap" ${saved ? 'style="display:none"' : ''}>
      <canvas class="sig-canvas"></canvas>
      <div class="sig-tools">
        <button class="btn ghost small" data-clear>Clear</button>
        <button class="btn ghost small" data-undo>Undo</button>
      </div>
      <p class="sig-hint">Draw with your mouse, finger, or stylus. It saves automatically.</p>
    </div>
  `;
  const wrapEl = control.querySelector('.sig-wrap');
  const canvas = control.querySelector('.sig-canvas');
  const ensurePad = () => {
    if (!state.pads[q.id]) {
      state.pads[q.id] = new SignaturePad(canvas, {
        onChange: () => {
          const pad = state.pads[q.id];
          setAnswer(q.id, pad.isEmpty() ? '' : pad.toDataURL());
        },
      });
    }
    return state.pads[q.id];
  };
  if (!saved) setTimeout(ensurePad, 40);
  const redraw = control.querySelector('[data-redraw]');
  if (redraw) redraw.addEventListener('click', () => {
    control.querySelector('.sig-saved').style.display = 'none';
    wrapEl.style.display = '';
    setAnswer(q.id, '');
    setTimeout(ensurePad, 40);
  });
  control.querySelector('[data-clear]').addEventListener('click', () => ensurePad().clear());
  control.querySelector('[data-undo]').addEventListener('click', () => ensurePad().undo());
}

/* ---------- exit ---------- */

async function exitForm() {
  if (!state.session) return showHome();
  collectAllFieldValues();
  await flushAnswers();
  if (IS_ADMIN) return showAdmin();
  const answered = Object.keys(state.session.answers).length;
  if (answered === 0) {
    await api(`/api/sessions/${state.session.id}`, { method: 'DELETE' }).catch(() => {});
    forgetSession(state.session.id);
    return showHome();
  }
  if (state.session.status !== 'in_progress') return showHome();
  const keep = confirm(
    'Keep your answers so you can continue later?\n\n' +
    'OK — save and go back to all forms\n' +
    'Cancel — discard this form completely'
  );
  if (!keep) {
    if (!confirm('Really discard all answers for this form?')) return;
    await api(`/api/sessions/${state.session.id}`, { method: 'DELETE' }).catch(() => {});
    forgetSession(state.session.id);
  }
  showHome();
}

/* ================= PDF preview panel ================= */

function previewUrl() {
  return `/api/sessions/${state.session.id}/preview.pdf?t=${Date.now()}`;
}

function previewPanelHtml() {
  return `
    <div class="preview-col">
      <div class="preview-head">
        <b>Document preview</b>
        <span class="preview-note">Answers placed on the official form</span>
        <button class="btn ghost small" id="previewRefresh">⟳ Refresh</button>
      </div>
      <iframe class="preview-frame" id="previewFrame" title="PDF preview" src="${previewUrl()}"></iframe>
    </div>
  `;
}

function wirePreviewPanel() {
  const btn = document.getElementById('previewRefresh');
  if (btn) btn.addEventListener('click', async () => {
    collectAllFieldValues();
    await flushAnswers();
    document.getElementById('previewFrame').src = previewUrl();
  });
}

/* ================= review ================= */

function displayValue(q, v) {
  if (isEmptyValue(v)) return '<span class="unanswered">Not answered</span>';
  if (q.type === 'signature') return `<img src="${v}" alt="signature">`;
  if (q.type === 'checkbox') return v ? esc(q.label || 'Yes') : 'No';
  if (q.type === 'radio' || q.type === 'dropdown') {
    const o = (q.options || []).find((o) => o.value === v);
    return esc(o ? o.label : v);
  }
  if (q.type === 'checkboxes') {
    return esc((Array.isArray(v) ? v : [v])
      .map((x) => ((q.options || []).find((o) => o.value === x) || { label: x }).label)
      .join(', '));
  }
  if (q.type === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    return m ? `${m[2]}/${m[3]}/${m[1]}` : esc(v);
  }
  return esc(String(v));
}

async function showReview() {
  await flushAnswers();
  topbarNote.textContent = `${state.def.title} — ${IS_ADMIN ? 'Admin review' : 'Review'}`;
  app.classList.add('wide');
  const sections = visibleSections();
  const answers = state.session.answers;

  const missingRequired = [];
  if (!IS_ADMIN) {
    for (const s of sections) {
      for (const q of visibleQuestionsOf(s)) {
        if (q.required && isEmptyValue(answers[q.id])) missingRequired.push(q);
      }
    }
  }

  const confirmLabel = IS_ADMIN
    ? 'Finalize — generate reviewed PDF'
    : 'Submit form for review';

  app.innerHTML = `
    <div class="form-toolbar">
      <button class="btn ghost small" id="exitBtn">← ${IS_ADMIN ? 'Dashboard' : 'All forms'}</button>
      <div class="toolbar-title">
        <b>${esc(state.def.title)}</b>
        <span>${IS_ADMIN
          ? 'Admin review — edit anything, add witness signatures, then finalize'
          : 'Final review — check your answers against the document preview'}</span>
      </div>
      <div class="toolbar-actions"></div>
    </div>
    <div class="workspace split">
      <div class="form-col">
        <div class="review-head">
          <h2>${IS_ADMIN ? 'Review this submission' : 'Review your answers'}</h2>
          <p>${IS_ADMIN
            ? 'The preview shows the client’s answers on the official PDF. Use "Edit page" to change anything or to complete the witness/admin sections.'
            : 'The preview on the right shows your answers inserted into the official PDF. When you submit, the form is sent to our administrator for review and locked for editing.'}</p>
        </div>
        ${sections.map((s, si) => `
          <div class="review-section">
            <h3>
              <span>${esc(s.title)}</span>
              <button class="btn ghost small" data-edit-section="${si}">Edit page</button>
            </h3>
            ${visibleQuestionsOf(s).map((q) => `
              <div class="review-row">
                <div class="rq">${esc(q.q)}</div>
                <div class="ra">${displayValue(q, answers[q.id])}</div>
                <button class="btn ghost small" data-edit="${esc(q.id)}" data-sec="${si}">
                  ${q.type === 'signature' ? 'Redraw' : 'Edit'}
                </button>
              </div>`).join('')}
          </div>`).join('')}
        <div class="nav-row">
          <button class="btn ghost" id="backToQ">← Back to the form</button>
          <div class="right">
            <button class="btn primary" id="confirmBtn" ${missingRequired.length ? 'disabled' : ''}>
              ${confirmLabel}
            </button>
          </div>
        </div>
        <div class="error-msg" style="text-align:right">${missingRequired.length
          ? `Please answer ${missingRequired.length} required question${missingRequired.length === 1 ? '' : 's'} first (marked "Not answered").`
          : ''}</div>
      </div>
      ${previewPanelHtml()}
    </div>
  `;

  document.getElementById('exitBtn').addEventListener('click', exitForm);
  wirePreviewPanel();
  app.querySelectorAll('[data-edit]').forEach((el) =>
    el.addEventListener('click', () => {
      const sections2 = visibleSections();
      state.sectionIndex = Number(el.dataset.sec);
      if (state.sectionIndex >= sections2.length) state.sectionIndex = sections2.length - 1;
      state.returnToReview = true;
      state.previewOpen = false;
      renderSection(el.dataset.edit);
    }));
  app.querySelectorAll('[data-edit-section]').forEach((el) =>
    el.addEventListener('click', () => {
      state.sectionIndex = Number(el.dataset.editSection);
      state.returnToReview = true;
      state.previewOpen = false;
      renderSection();
    }));
  document.getElementById('backToQ').addEventListener('click', () => {
    state.sectionIndex = visibleSections().length - 1;
    state.returnToReview = false;
    renderSection();
  });
  document.getElementById('confirmBtn').addEventListener('click', generatePdf);
}

/* ================= generation & export ================= */

async function generatePdf() {
  const btn = document.getElementById('confirmBtn');
  btn.disabled = true;
  btn.textContent = 'Generating the PDF…';
  try {
    const out = await api(`/api/sessions/${state.session.id}/generate`, { method: 'POST' });
    state.session.status = out.status;
    showDone();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = IS_ADMIN ? 'Finalize — generate reviewed PDF' : 'Submit form for review';
    alert(err.message);
  }
}

function printPdf(sessionId) {
  const frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.src = `/api/sessions/${sessionId}/pdf`;
  frame.onload = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      window.open(frame.src, '_blank');
    }
  };
  document.body.appendChild(frame);
}

function showDone() {
  const sid = state.session.id;
  topbarNote.textContent = state.def.title;
  app.classList.remove('wide');
  app.innerHTML = `
    <div class="done-card">
      <div class="big">${IS_ADMIN ? '✅' : '📨'}</div>
      <h2>${IS_ADMIN ? 'Submission finalized' : 'Your form has been submitted'}</h2>
      <p>${IS_ADMIN
        ? `The reviewed <b>${esc(state.def.title)}</b> PDF has been generated and saved.`
        : `Thank you! Your <b>${esc(state.def.title)}</b> was sent to our administrator for review.
           You can download a copy for your records below.`}</p>
      <div class="done-actions">
        <a class="btn primary" href="/api/sessions/${sid}/pdf?download=1">Download PDF</a>
        <button class="btn ghost" id="printBtn">Print</button>
        ${IS_ADMIN ? '<button class="btn ghost" id="emailBtn">Send by email</button>' : ''}
        <button class="btn ghost" id="homeBtn">${IS_ADMIN ? 'Back to dashboard' : 'Done'}</button>
      </div>
      ${IS_ADMIN ? `
        <div class="email-row" id="emailRow" style="display:none">
          <input type="email" id="emailTo" placeholder="name@example.com">
          <button class="btn primary" id="emailSend">Send</button>
        </div>
        <div class="error-msg" id="emailMsg" style="text-align:center"></div>` : ''}
      <iframe class="pdf-frame" src="/api/sessions/${sid}/pdf" title="Completed PDF preview"></iframe>
    </div>
  `;
  document.getElementById('printBtn').addEventListener('click', () => printPdf(sid));
  document.getElementById('homeBtn').addEventListener('click', () => (IS_ADMIN ? showAdmin() : showHome()));
  if (IS_ADMIN) {
    document.getElementById('emailBtn').addEventListener('click', () => {
      const row = document.getElementById('emailRow');
      row.style.display = row.style.display === 'none' ? 'flex' : 'none';
    });
    document.getElementById('emailSend').addEventListener('click', async () => {
      const to = document.getElementById('emailTo').value.trim();
      const msg = document.getElementById('emailMsg');
      msg.textContent = 'Sending…';
      try {
        await api(`/api/sessions/${sid}/email`, {
          method: 'POST',
          body: JSON.stringify({ to }),
        });
        msg.textContent = '✓ Sent!';
      } catch (err) {
        msg.textContent = err.message;
      }
    });
  }
}

/* ================= boot ================= */

document.getElementById('brandHome').addEventListener('click', () => {
  if (!state.def) return showHome();
  exitForm();
});

showHome().catch((err) => {
  app.innerHTML = `<div class="loading">Could not load: ${esc(err.message)}</div>`;
});
