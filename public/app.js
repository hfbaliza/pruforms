'use strict';

/* ================= state ================= */

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

function visibleSections() {
  const a = state.session.answers;
  return state.def.sections.filter(
    (s) => evalCondition(s.showIf, a) && s.questions.some((q) => evalCondition(q.showIf, a))
  );
}

function visibleQuestionsOf(section) {
  const a = state.session.answers;
  return section.questions.filter((q) => evalCondition(q.showIf, a));
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

/* ---- autosave: answers merge into state immediately, network flush is debounced ---- */

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
  } catch {
    Object.assign(state.pending, batch); // retry next flush
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

/* ================= misc helpers ================= */

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

/* ================= home ================= */

async function showHome() {
  topbarNote.textContent = '';
  state.def = null;
  state.session = null;
  state.previewOpen = false;
  app.classList.remove('wide');
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
      <p>Pick a request below — you'll fill in a clean electronic version of the form,
         page by page, and we'll produce the completed official PDF for you.</p>
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
  app.innerHTML = '<div class="loading">Preparing the form…</div>';
  const def = await api(`/api/forms/${formId}`);
  const session = await api('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ formId }),
  });
  state.def = def;
  state.session = session;
  state.sectionIndex = 0;
  state.returnToReview = false;
  state.previewOpen = false;
  renderSection();
}

async function resumeSession(sessionId, toReview = false) {
  app.innerHTML = '<div class="loading">Loading your saved answers…</div>';
  const session = await api(`/api/sessions/${sessionId}`);
  const def = await api(`/api/forms/${session.formId}`);
  state.def = def;
  state.session = session;
  state.returnToReview = false;
  state.previewOpen = false;
  if (toReview) return showReview();
  // resume at the first page containing an unanswered question
  const sections = visibleSections();
  let idx = sections.findIndex((s) =>
    visibleQuestionsOf(s).some((q) => isEmptyValue(session.answers[q.id])));
  state.sectionIndex = idx === -1 ? sections.length - 1 : idx;
  renderSection();
}

/* ================= section page (electronic form) ================= */

function renderSection(focusQid) {
  const sections = visibleSections();
  if (state.sectionIndex >= sections.length) return showReview();
  if (state.sectionIndex < 0) state.sectionIndex = 0;
  const section = sections[state.sectionIndex];
  const questions = visibleQuestionsOf(section);
  topbarNote.textContent = state.def.title;
  state.pads = {};
  app.classList.toggle('wide', state.previewOpen);

  const pct = Math.round((state.sectionIndex / sections.length) * 100);

  app.innerHTML = `
    <div class="form-toolbar">
      <button class="btn ghost small" id="exitBtn" title="Leave this form">← All forms</button>
      <div class="toolbar-title">
        <b>${esc(state.def.title)}</b>
        <span>Page ${state.sectionIndex + 1} of ${sections.length + 1} — ${esc(section.title)}</span>
      </div>
      <div class="toolbar-actions">
        <button class="btn ghost small" id="saveBtn">💾 Save</button>
        <button class="btn ghost small" id="previewBtn">${state.previewOpen ? '✕ Close preview' : '👁 Preview PDF'}</button>
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
          <h2 class="page-title">${esc(section.title)}</h2>
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

/** Read every text-like control on the page into state (radios etc. update on click). */
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
    const err = validate(q, state.session.answers[q.id]);
    row.classList.toggle('error', !!err);
    row.querySelector('.field-error').textContent = err || '';
    if (err && !firstBad) firstBad = row;
    if (err) ok = false;
  }
  if (firstBad) firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return ok;
}

/** A change to a gate-style answer can reveal/hide questions — re-render if so. */
function maybeRerender(section) {
  const before = Array.from(document.querySelectorAll('#fields [data-field]'))
    .map((el) => el.dataset.field).join(',');
  const after = visibleQuestionsOf(section).map((q) => q.id).join(',');
  if (before !== after) {
    collectAllFieldValues();
    renderSection();
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
  label.innerHTML = `${esc(q.q)}${q.required ? ' <span class="req">*</span>' : ''}`;
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
  collectAllFieldValues();
  await flushAnswers();
  const answered = Object.keys(state.session.answers).length;
  if (answered === 0) {
    // nothing entered — quietly discard the empty session
    await api(`/api/sessions/${state.session.id}`, { method: 'DELETE' }).catch(() => {});
    return showHome();
  }
  const keep = confirm(
    'Keep your answers so you can continue later?\n\n' +
    'OK — save and go back to all forms\n' +
    'Cancel — discard this form completely'
  );
  if (!keep) {
    if (!confirm('Really discard all answers for this form?')) return;
    await api(`/api/sessions/${state.session.id}`, { method: 'DELETE' }).catch(() => {});
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
        <span class="preview-note">Your answers, placed on the official form</span>
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
  topbarNote.textContent = `${state.def.title} — Review`;
  app.classList.add('wide');
  const sections = visibleSections();
  const answers = state.session.answers;

  const missingRequired = [];
  for (const s of sections) {
    for (const q of visibleQuestionsOf(s)) {
      if (q.required && isEmptyValue(answers[q.id])) missingRequired.push(q);
    }
  }

  app.innerHTML = `
    <div class="form-toolbar">
      <button class="btn ghost small" id="exitBtn">← All forms</button>
      <div class="toolbar-title">
        <b>${esc(state.def.title)}</b>
        <span>Final review — check your answers against the document preview</span>
      </div>
      <div class="toolbar-actions"></div>
    </div>
    <div class="workspace split">
      <div class="form-col">
        <div class="review-head">
          <h2>Review your answers</h2>
          <p>The preview on the right shows your answers inserted into the official PDF.
             Edit anything that isn't right, then confirm to generate the final document.</p>
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
              Confirm & generate PDF
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
      state.sectionIndex = Number(el.dataset.sec);
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
  app.classList.remove('wide');
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
  if (!state.def) return showHome();
  exitForm();
});

showHome().catch((err) => {
  app.innerHTML = `<div class="loading">Could not load: ${esc(err.message)}</div>`;
});
