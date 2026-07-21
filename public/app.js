'use strict';

/* ================= state ================= */

const app = document.getElementById('app');
const topbarNote = document.getElementById('topbarNote');

const state = {
  forms: [],
  def: null,          // current form definition
  session: null,      // {id, formId, answers, status}
  flow: [],           // visible questions for current answers
  index: 0,
  returnToReview: false,
  pad: null,
};

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

function computeFlow() {
  const out = [];
  for (const section of state.def.sections) {
    if (!evalCondition(section.showIf, state.session.answers)) continue;
    for (const q of section.questions) {
      if (!evalCondition(q.showIf, state.session.answers)) continue;
      out.push({ section, question: q });
    }
  }
  state.flow = out;
}

/* ================= api helpers ================= */

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const saveQueue = { timer: null };
function saveAnswer(qid, value, cb) {
  const sid = state.session.id;
  setSaveState('Saving…', false);
  api(`/api/sessions/${sid}/answers`, {
    method: 'PUT',
    body: JSON.stringify({ id: qid, value }),
  })
    .then(() => { setSaveState('✓ Saved', true); if (cb) cb(); })
    .catch(() => setSaveState('⚠ Could not save — check connection', false));
}

function setSaveState(text, ok) {
  const el = document.querySelector('.save-state');
  if (el) { el.textContent = text; el.classList.toggle('saved', !!ok); }
}

/* ================= views ================= */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function showHome() {
  topbarNote.textContent = '';
  state.def = null;
  state.session = null;
  app.innerHTML = '<div class="loading">Loading…</div>';
  const [forms, sessions] = await Promise.all([
    api('/api/forms'),
    api('/api/sessions').catch(() => []),
  ]);
  state.forms = forms;

  const inProgress = sessions.filter((s) => s.status === 'in_progress' && s.answered > 0);
  const completed = sessions.filter((s) => s.status === 'completed');

  app.innerHTML = `
    <div class="hero">
      <h1>What would you like to do today?</h1>
      <p>Pick a request below — we'll walk you through it one question at a time.
         No paperwork to decipher; we fill in the official form for you.</p>
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

    <h2 class="subhead">Your completed documents</h2>
    <div class="session-list" id="doneList">
      ${completed.length ? completed.map((s) => `
        <div class="session-item">
          <div class="meta">
            <b>${esc(s.formTitle)}</b>
            <span>completed ${new Date(s.updatedAt).toLocaleString()}</span>
          </div>
          <a class="btn ghost small" href="/api/sessions/${esc(s.id)}/pdf?download=1">Download</a>
          <button class="btn ghost small" data-print="${esc(s.id)}">Print</button>
          <button class="btn ghost small" data-reopen="${esc(s.id)}">Open</button>
        </div>`).join('')
      : '<div class="empty-note">Completed forms will be saved here for future access.</div>'}
    </div>
  `;

  app.querySelectorAll('.form-card').forEach((el) =>
    el.addEventListener('click', () => startForm(el.dataset.form)));
  app.querySelectorAll('[data-resume]').forEach((el) =>
    el.addEventListener('click', () => resumeSession(el.dataset.resume)));
  app.querySelectorAll('[data-reopen]').forEach((el) =>
    el.addEventListener('click', () => resumeSession(el.dataset.reopen, true)));
  app.querySelectorAll('[data-discard]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (!confirm('Discard this saved form and its answers?')) return;
      await api(`/api/sessions/${el.dataset.discard}`, { method: 'DELETE' });
      showHome();
    }));
  app.querySelectorAll('[data-print]').forEach((el) =>
    el.addEventListener('click', () => printPdf(el.dataset.print)));
}

async function startForm(formId) {
  app.innerHTML = '<div class="loading">Preparing your interview…</div>';
  const def = await api(`/api/forms/${formId}`);
  const session = await api('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ formId }),
  });
  state.def = def;
  state.session = session;
  state.index = 0;
  state.returnToReview = false;
  computeFlow();
  renderQuestion();
}

async function resumeSession(sessionId, toReview = false) {
  app.innerHTML = '<div class="loading">Loading your saved answers…</div>';
  const session = await api(`/api/sessions/${sessionId}`);
  const def = await api(`/api/forms/${session.formId}`);
  state.def = def;
  state.session = session;
  state.returnToReview = false;
  computeFlow();
  if (toReview) return showReview();
  // resume at first unanswered visible question
  const idx = state.flow.findIndex(({ question }) => {
    const v = session.answers[question.id];
    return v === undefined || v === null || v === '';
  });
  state.index = idx === -1 ? state.flow.length - 1 : idx;
  renderQuestion();
}

/* ================= interview ================= */

function answerOf(q) {
  return state.session.answers[q.id];
}

function isAnswered(q) {
  const v = answerOf(q);
  return !(v === undefined || v === null || v === '' ||
    (Array.isArray(v) && v.length === 0));
}

function validate(q, value) {
  if (value === undefined || value === null || value === '' ||
      (Array.isArray(value) && value.length === 0)) {
    return q.required ? 'This question is required.' : null;
  }
  switch (q.type) {
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address.';
      break;
    case 'phone':
      if (!/^[+()\-\s\d]{6,25}$/.test(value)) return 'Please enter a valid phone number.';
      break;
    case 'number':
      if (!/^[\d.,]+$/.test(String(value))) return 'Please enter a number.';
      break;
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Please pick a date.';
      break;
  }
  return null;
}

function renderQuestion() {
  computeFlow();
  if (state.index >= state.flow.length) return showReview();
  if (state.index < 0) state.index = 0;

  const { section, question: q } = state.flow[state.index];
  topbarNote.textContent = state.def.title;

  const total = state.flow.length;
  const pct = Math.round((state.index / total) * 100);
  const showIntro = section.intro &&
    state.flow.findIndex((f) => f.section === section) === state.index;

  app.innerHTML = `
    <div class="progress-wrap">
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="progress-label">
        <span>Question ${state.index + 1} of ${total}</span>
        <span>${pct}% complete</span>
      </div>
    </div>
    <div class="qcard">
      <span class="section-tag">${esc(section.title)}</span>
      ${showIntro ? `<p class="section-intro">${esc(section.intro)}</p>` : ''}
      <h2>${esc(q.q)}</h2>
      ${q.help ? `<p class="help">${esc(q.help)}</p>` : ''}
      <div class="answer-area" id="answerArea"></div>
      <div class="error-msg" id="errorMsg"></div>
      <div class="nav-row">
        <button class="btn ghost" id="backBtn" ${state.index === 0 && !state.returnToReview ? 'disabled' : ''}>← Back</button>
        <div class="right">
          ${!q.required ? '<button class="btn ghost" id="skipBtn">Skip</button>' : ''}
          <button class="btn primary" id="nextBtn">${state.returnToReview ? 'Save & return to review' : 'Next →'}</button>
        </div>
      </div>
      <div class="save-state"></div>
    </div>
  `;

  const area = document.getElementById('answerArea');
  const nextBtn = document.getElementById('nextBtn');
  const errorMsg = document.getElementById('errorMsg');
  let getValue = renderInput(area, q, () => nextBtn.click());

  document.getElementById('backBtn').addEventListener('click', () => {
    if (state.returnToReview) return showReview();
    state.index -= 1;
    renderQuestion();
  });

  const skipBtn = document.getElementById('skipBtn');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      delete state.session.answers[q.id];
      saveAnswer(q.id, null);
      advance();
    });
  }

  nextBtn.addEventListener('click', () => {
    const value = getValue();
    const err = validate(q, value);
    if (err) { errorMsg.textContent = err; return; }
    errorMsg.textContent = '';
    if (value === undefined || value === null || value === '' ||
        (Array.isArray(value) && value.length === 0)) {
      delete state.session.answers[q.id];
      saveAnswer(q.id, null);
    } else {
      state.session.answers[q.id] = value;
      saveAnswer(q.id, value);
    }
    advance();
  });

  function advance() {
    if (state.returnToReview) { state.returnToReview = false; return showReview(); }
    computeFlow();
    // find the position of the current question again (flow may have changed)
    const pos = state.flow.findIndex((f) => f.question.id === q.id);
    state.index = (pos === -1 ? state.index : pos) + 1;
    renderQuestion();
  }
}

/** Renders the input control for a question; returns a function that reads the current value. */
function renderInput(area, q, autoAdvance) {
  const existing = answerOf(q);

  if (['text', 'email', 'phone', 'number', 'date'].includes(q.type)) {
    const typeMap = { text: 'text', email: 'email', phone: 'tel', number: 'number', date: 'date' };
    const input = document.createElement('input');
    input.type = typeMap[q.type];
    if (q.type === 'number') { input.min = '0'; input.step = 'any'; }
    if (q.placeholder) input.placeholder = q.placeholder;
    if (existing !== undefined) input.value = existing;
    area.appendChild(input);
    setTimeout(() => input.focus(), 30);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); autoAdvance(); }
    });
    return () => input.value.trim();
  }

  if (q.type === 'textarea') {
    const input = document.createElement('textarea');
    if (existing !== undefined) input.value = existing;
    area.appendChild(input);
    setTimeout(() => input.focus(), 30);
    return () => input.value.trim();
  }

  if (q.type === 'dropdown') {
    const select = document.createElement('select');
    select.innerHTML = '<option value="">— Select —</option>' +
      q.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    if (existing !== undefined) select.value = existing;
    area.appendChild(select);
    return () => select.value;
  }

  if (q.type === 'radio') {
    let value = existing;
    const wrap = document.createElement('div');
    wrap.className = 'opt-list';
    for (const o of q.options) {
      const div = document.createElement('div');
      div.className = 'opt' + (value === o.value ? ' selected' : '');
      div.innerHTML = `<span class="dot"></span><span>${esc(o.label)}</span>`;
      div.addEventListener('click', () => {
        value = o.value;
        wrap.querySelectorAll('.opt').forEach((el) => el.classList.remove('selected'));
        div.classList.add('selected');
      });
      wrap.appendChild(div);
    }
    area.appendChild(wrap);
    return () => value;
  }

  if (q.type === 'checkbox') {
    let value = existing === true;
    const div = document.createElement('div');
    div.className = 'opt checkbox' + (value ? ' selected' : '');
    div.innerHTML = `<span class="dot"></span><span>${esc(q.label || 'Yes')}</span>`;
    div.addEventListener('click', () => {
      value = !value;
      div.classList.toggle('selected', value);
    });
    area.appendChild(div);
    return () => value;
  }

  if (q.type === 'checkboxes') {
    const value = new Set(Array.isArray(existing) ? existing : []);
    const wrap = document.createElement('div');
    wrap.className = 'opt-list';
    for (const o of q.options) {
      const div = document.createElement('div');
      div.className = 'opt checkbox' + (value.has(o.value) ? ' selected' : '');
      div.innerHTML = `<span class="dot"></span><span>${esc(o.label)}</span>`;
      div.addEventListener('click', () => {
        if (value.has(o.value)) value.delete(o.value); else value.add(o.value);
        div.classList.toggle('selected', value.has(o.value));
      });
      wrap.appendChild(div);
    }
    area.appendChild(wrap);
    return () => Array.from(value);
  }

  if (q.type === 'signature') {
    let saved = typeof existing === 'string' ? existing : null;
    area.innerHTML = `
      ${saved ? `<div id="sigSaved">
          <p class="sig-hint">Your saved signature:</p>
          <img class="sig-preview" src="${saved}" alt="signature">
          <div class="sig-tools"><button class="btn ghost small" id="redrawBtn">Redraw</button></div>
        </div>` : ''}
      <div class="sig-wrap" id="sigWrap" ${saved ? 'style="display:none"' : ''}>
        <canvas class="sig-canvas" id="sigCanvas"></canvas>
        <div class="sig-baseline"></div>
        <div class="sig-tools">
          <button class="btn ghost small" id="sigClear">Clear</button>
          <button class="btn ghost small" id="sigUndo">Undo</button>
        </div>
        <p class="sig-hint">Draw your signature above the line using your mouse, finger, or stylus.</p>
      </div>
    `;
    const wrapEl = document.getElementById('sigWrap');
    const canvas = document.getElementById('sigCanvas');
    let pad = null;
    const ensurePad = () => {
      if (!pad) pad = new SignaturePad(canvas);
      return pad;
    };
    if (!saved) setTimeout(ensurePad, 40);
    const redrawBtn = document.getElementById('redrawBtn');
    if (redrawBtn) redrawBtn.addEventListener('click', () => {
      saved = null;
      document.getElementById('sigSaved').style.display = 'none';
      wrapEl.style.display = '';
      setTimeout(ensurePad, 40);
    });
    document.getElementById('sigClear').addEventListener('click', () => ensurePad().clear());
    document.getElementById('sigUndo').addEventListener('click', () => ensurePad().undo());
    return () => {
      if (saved) return saved;
      if (pad && !pad.isEmpty()) return pad.toDataURL();
      return '';
    };
  }

  area.textContent = 'Unsupported question type: ' + q.type;
  return () => '';
}

/* ================= review ================= */

function displayValue(q, v) {
  if (v === undefined || v === null || v === '' ||
      (Array.isArray(v) && v.length === 0)) {
    return '<span class="unanswered">Not answered</span>';
  }
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

function showReview() {
  computeFlow();
  topbarNote.textContent = `${state.def.title} — Review`;
  const bySection = [];
  for (const item of state.flow) {
    const last = bySection[bySection.length - 1];
    if (!last || last.section !== item.section) {
      bySection.push({ section: item.section, items: [item] });
    } else {
      last.items.push(item);
    }
  }

  const missingRequired = state.flow.filter(({ question }) =>
    question.required && !isAnswered(question));

  app.innerHTML = `
    <div class="review-head">
      <h2>Review your answers</h2>
      <p>Check everything below. You can edit any answer or redraw a signature before we prepare the final document.</p>
    </div>
    ${bySection.map(({ section, items }) => `
      <div class="review-section">
        <h3>${esc(section.title)}</h3>
        ${items.map(({ question }) => `
          <div class="review-row">
            <div class="rq">${esc(question.q)}</div>
            <div class="ra">${displayValue(question, answerOf(question))}</div>
            <button class="btn ghost small" data-edit="${esc(question.id)}">
              ${question.type === 'signature' ? 'Redraw' : 'Edit'}
            </button>
          </div>`).join('')}
      </div>`).join('')}
    <div class="nav-row">
      <button class="btn ghost" id="backToQ">← Back to questions</button>
      <div class="right">
        <button class="btn primary" id="confirmBtn" ${missingRequired.length ? 'disabled' : ''}>
          Confirm & generate PDF
        </button>
      </div>
    </div>
    <div class="error-msg" style="text-align:right">${missingRequired.length
      ? `Please answer ${missingRequired.length} required question${missingRequired.length === 1 ? '' : 's'} first (marked "Not answered").`
      : ''}</div>
  `;

  app.querySelectorAll('[data-edit]').forEach((el) =>
    el.addEventListener('click', () => {
      const idx = state.flow.findIndex((f) => f.question.id === el.dataset.edit);
      if (idx !== -1) {
        state.index = idx;
        state.returnToReview = true;
        renderQuestion();
      }
    }));
  document.getElementById('backToQ').addEventListener('click', () => {
    state.index = state.flow.length - 1;
    state.returnToReview = false;
    renderQuestion();
  });
  document.getElementById('confirmBtn').addEventListener('click', generatePdf);
}

/* ================= generation & export ================= */

async function generatePdf() {
  const btn = document.getElementById('confirmBtn');
  btn.disabled = true;
  btn.textContent = 'Generating your PDF…';
  try {
    await api(`/api/sessions/${state.session.id}/generate`, { method: 'POST' });
    showDone();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Confirm & generate PDF';
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
  app.innerHTML = `
    <div class="done-card">
      <div class="big">✅</div>
      <h2>Your document is ready</h2>
      <p>We filled the official <b>${esc(state.def.title)}</b> form with your answers and signatures.
         It is saved here for future access.</p>
      <div class="done-actions">
        <a class="btn primary" href="/api/sessions/${sid}/pdf?download=1">Download PDF</a>
        <button class="btn ghost" id="printBtn">Print</button>
        <button class="btn ghost" id="emailBtn">Send by email</button>
        <button class="btn ghost" id="homeBtn">Done</button>
      </div>
      <div class="email-row" id="emailRow" style="display:none">
        <input type="email" id="emailTo" placeholder="name@example.com">
        <button class="btn primary" id="emailSend">Send</button>
      </div>
      <div class="error-msg" id="emailMsg" style="text-align:center"></div>
      <iframe class="pdf-frame" src="/api/sessions/${sid}/pdf" title="Completed PDF preview"></iframe>
    </div>
  `;
  document.getElementById('printBtn').addEventListener('click', () => printPdf(sid));
  document.getElementById('homeBtn').addEventListener('click', showHome);
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

/* ================= boot ================= */

document.getElementById('brandHome').addEventListener('click', () => {
  if (!state.def || confirm('Return to home? Your answers are saved automatically.')) {
    showHome();
  }
});

showHome().catch((err) => {
  app.innerHTML = `<div class="loading">Could not load: ${esc(err.message)}</div>`;
});
