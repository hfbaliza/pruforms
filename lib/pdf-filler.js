'use strict';

const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, StandardFonts, rgb } = require('pdf-lib');
const { evalCondition } = require('./conditions');

const FORMS_DIR = path.join(__dirname, '..', 'forms');

// One uniform font size for every single-line box; the filler only shrinks
// below this when a specific answer genuinely doesn't fit its box.
const BASE_SIZE = 9;

// ---------- value formatting ----------

// Dates are stored as "yyyy-mm-dd" (from <input type=date>).
function dateParts(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  return { yyyy: m[1], mm: m[2], dd: m[3] };
}

function formatValue(value, format) {
  if (value === undefined || value === null) return '';
  switch (format) {
    case 'date_mdY': {
      const p = dateParts(value);
      return p ? `${p.mm}/${p.dd}/${p.yyyy}` : String(value);
    }
    case 'date_digits': {
      const p = dateParts(value);
      return p ? `${p.mm}${p.dd}${p.yyyy}` : String(value).replace(/\D/g, '');
    }
    case 'date_MM': {
      const p = dateParts(value);
      return p ? p.mm : '';
    }
    case 'date_DD': {
      const p = dateParts(value);
      return p ? p.dd : '';
    }
    case 'date_YYYY': {
      const p = dateParts(value);
      return p ? p.yyyy : '';
    }
    default:
      return String(value);
  }
}

function resolveTemplate(template, answers) {
  return template
    .replace(/\{(\w+)\}/g, (_, qid) => {
      const v = answers[qid];
      if (v === undefined || v === null) return '';
      const p = dateParts(v);
      if (p) return `${p.mm}/${p.dd}/${p.yyyy}`;
      return String(v);
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function isTruthyAnswer(v) {
  return !(
    v === undefined ||
    v === null ||
    v === '' ||
    v === false ||
    v === 'no' ||
    (Array.isArray(v) && v.length === 0)
  );
}

// tbox is [x, top, w, h] with y measured from the TOP of the page (as produced
// by structure extraction); convert to a bottom-origin rect [x0, y0, x1, y1].
function rectOf(spec, page) {
  if (spec.rect) return spec.rect;
  if (spec.tbox) {
    const [x, top, w, h] = spec.tbox;
    const ph = page.getHeight();
    return [x, ph - top - h, x + w, ph - top];
  }
  throw new Error('draw action needs rect or tbox');
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ---------- main entry ----------

async function generatePdf(definition, answers) {
  const pdfBytes = fs.readFileSync(path.join(FORMS_DIR, definition.pdf));
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.05, 0.05, 0.25);

  let form = null;
  try {
    form = doc.getForm();
  } catch {
    form = null;
  }

  // Collect the mapping actions of every *visible* answered question, in two
  // passes: form-field actions first (before flatten), then overlay drawing
  // (after flatten) so signatures and overlay text sit on top of the page.
  const fieldActions = [];
  const drawActions = [];

  for (const section of definition.sections) {
    if (!evalCondition(section.showIf, answers)) continue;
    for (const q of section.questions) {
      if (!evalCondition(q.showIf, answers)) continue;
      const value = answers[q.id];
      for (const action of q.map || []) {
        const hasValue = action.value !== undefined || isTruthyAnswer(value) ||
          value === 0 || (typeof value === 'string' && value !== '');
        if (!hasValue) continue;
        if (action.when && !evalCondition(action.when, answers)) continue;
        const entry = { action, value, question: q };
        if (action.image || action.draw || action.drawWrap || action.drawX || action.drawComb) {
          drawActions.push(entry);
        } else {
          fieldActions.push(entry);
        }
      }
    }
  }

  const problems = [];

  // ----- pass 1: AcroForm fields -----
  if (form) {
    for (const { action, value, question } of fieldActions) {
      try {
        applyFieldAction(form, font, action, value, answers, question);
      } catch (err) {
        problems.push(`${question.id}: ${err.message}`);
      }
    }
    try {
      form.updateFieldAppearances(font);
    } catch {
      /* best effort */
    }
    try {
      form.flatten();
    } catch {
      // Fall back: keep fields but make them read-only so the output is not
      // accidentally editable.
      try {
        for (const f of form.getFields()) f.enableReadOnly();
        form.updateFieldAppearances(font);
      } catch {
        /* best effort */
      }
    }
  }

  // ----- pass 2: overlays (signatures, text for non-fillable areas) -----
  for (const { action, value, question } of drawActions) {
    try {
      await applyDrawAction(doc, font, ink, action, value, answers, question);
    } catch (err) {
      problems.push(`${question.id}: ${err.message}`);
    }
  }

  const out = await doc.save();
  return { bytes: Buffer.from(out), problems };
}

function textForAction(action, value, answers, question) {
  let text;
  if (action.value !== undefined) {
    text = resolveTemplate(action.value, answers);
  } else {
    text = formatValue(value, action.format);
  }
  const type = question ? question.type : 'text';
  const noUpper = type === 'email' || action.upper === false;
  if (!noUpper && typeof text === 'string') text = text.toUpperCase();
  return text;
}

function applyFieldAction(form, font, action, value, answers, question) {
  if (action.text) {
    const field = form.getTextField(action.text);
    ensureDefaultAppearance(field, action.size || 9);
    if (action.multiline) field.enableMultiline();
    const maxLen = field.getMaxLength();
    let text = textForAction(action, value, answers, question);
    if (maxLen !== undefined && maxLen !== null && text.length > maxLen) {
      text = text.slice(0, maxLen);
    }
    // shrink the font until single-line text fits the field width
    let size = action.multiline ? action.size || 8 : BASE_SIZE;
    if (!action.multiline) {
      try {
        const rect = field.acroField.getWidgets()[0].getRectangle();
        // filled text is uppercased (no descenders), so only genuinely tiny
        // boxes force a smaller size — everything else stays at BASE_SIZE
        if (rect.height < 8) size = Math.max(5, rect.height - 1);
        while (size > 4.5 && font.widthOfTextAtSize(text, size) > rect.width - 4) {
          size -= 0.5;
        }
      } catch {
        /* keep configured size */
      }
    }
    field.setFontSize(size);
    field.setText(text);
    return;
  }
  if (action.comb) {
    const text = textForAction(action, value, answers, question).replace(
      action.format && action.format.startsWith('date') ? /[^0-9]/g : /\s/g,
      ''
    );
    action.comb.forEach((name, i) => {
      const field = form.getTextField(name);
      ensureDefaultAppearance(field, action.size || 9);
      field.setText(i < text.length ? text[i] : '');
    });
    return;
  }
  if (action.lines) {
    const limit = action.chars || 45;
    const text = textForAction(action, value, answers, question);
    let rest = text;
    for (const name of action.lines) {
      const field = form.getTextField(name);
      ensureDefaultAppearance(field, action.size || 9);
      if (rest.length <= limit) {
        field.setText(rest);
        rest = '';
      } else {
        let cut = rest.lastIndexOf(' ', limit);
        if (cut <= 0) cut = limit;
        field.setText(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (action.size) field.setFontSize(action.size);
    }
    return;
  }
  if (action.check) {
    if (isTruthyAnswer(value) || action.when) {
      const field = form.getCheckBox(action.check);
      field.check();
    }
    return;
  }
  if (action.checkEach) {
    const selected = Array.isArray(value) ? value : [value];
    for (const v of selected) {
      const name = action.checkEach[v];
      if (name) form.getCheckBox(name).check();
    }
    return;
  }
  if (action.radio) {
    const exportValue =
      (action.valueMap && action.valueMap[value]) || String(value);
    try {
      form.getRadioGroup(action.radio).select(exportValue);
    } catch {
      // Some source-PDF button groups are mis-typed (checkbox with several
      // on-states, or a radio with a bogus /Opt array). Select by setting the
      // field value and widget appearance states directly.
      selectButtonLowLevel(form, action.radio, exportValue);
    }
    return;
  }
  throw new Error(`unknown field action ${JSON.stringify(Object.keys(action))}`);
}

// Some source-PDF fields have no /DA entry, which makes pdf-lib's
// setFontSize/appearance generation throw. Give them a sane default.
function ensureDefaultAppearance(field, size) {
  try {
    const da = field.acroField.getDefaultAppearance();
    if (!da) field.acroField.setDefaultAppearance(`/Helv ${size} Tf 0 g`);
  } catch {
    try {
      field.acroField.setDefaultAppearance(`/Helv ${size} Tf 0 g`);
    } catch {
      /* leave as-is */
    }
  }
}

function selectButtonLowLevel(form, name, exportValue) {
  const field = form.getField(name);
  const acro = field.acroField;
  const target = PDFName.of(exportValue);
  let found = false;
  for (const widget of acro.getWidgets()) {
    const on = widget.getOnValue();
    const isOn = on === target;
    if (isOn) found = true;
    widget.setAppearanceState(isOn ? on : PDFName.of('Off'));
  }
  if (!found) throw new Error(`option "${exportValue}" not found on "${name}"`);
  acro.dict.set(PDFName.of('V'), target);
}

async function applyDrawAction(doc, font, ink, action, value, answers, question) {
  if (action.image) {
    const spec = action.image;
    const page = doc.getPage(spec.page - 1);
    const dataUrl = action.valueFrom ? answers[action.valueFrom] : value;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png')) {
      return;
    }
    const png = await doc.embedPng(dataUrl);
    const [x0, y0, x1, y1] = rectOf(spec, page);
    const boxW = x1 - x0;
    const boxH = (y1 - y0) * (spec.grow || 1);
    const scale = Math.min(boxW / png.width, boxH / png.height);
    const w = png.width * scale;
    const h = png.height * scale;
    // anchor at the bottom of the field box, horizontally centered, letting
    // the signature rise above short boxes ("sign over printed name")
    page.drawImage(png, {
      x: x0 + (boxW - w) / 2,
      y: y0 + 1,
      width: w,
      height: h,
    });
    return;
  }
  if (action.drawX) {
    const spec = action.drawX;
    if (spec.when !== undefined) {
      const match = Array.isArray(value)
        ? value.map(String).includes(String(spec.when))
        : String(value) === String(spec.when);
      if (!match) return;
    } else if (!isTruthyAnswer(value)) {
      return;
    }
    const page = doc.getPage(spec.page - 1);
    let x, y;
    if (spec.tat) {
      x = spec.tat[0];
      y = page.getHeight() - spec.tat[1] - (spec.size || 9);
    } else {
      [x, y] = spec.at;
    }
    page.drawText('X', { x, y, size: spec.size || 9, font, color: ink });
    return;
  }
  if (action.draw) {
    const spec = action.draw;
    const page = doc.getPage(spec.page - 1);
    const [x0, y0, x1, y1] = rectOf(spec, page);
    const template = spec.value !== undefined ? spec.value : action.value;
    let text = template !== undefined
      ? resolveTemplate(template, answers)
      : formatValue(value, spec.format || action.format);
    if (spec.upper !== false && (!question || question.type !== 'email')) {
      text = text.toUpperCase();
    }
    let size = y1 - y0 < 8 ? Math.max(5, y1 - y0 - 1) : BASE_SIZE;
    while (size > 5 && font.widthOfTextAtSize(text, size) > x1 - x0 - 2) {
      size -= 0.5;
    }
    let x = x0 + 1;
    if (spec.align === 'center') {
      x = x0 + (x1 - x0 - font.widthOfTextAtSize(text, size)) / 2;
    }
    const y = y0 + ((y1 - y0) - size * 0.72) / 2;
    page.drawText(text, { x, y, size, font, color: ink });
    return;
  }
  if (action.drawWrap) {
    const spec = action.drawWrap;
    const page = doc.getPage(spec.page - 1);
    const [x0, y0, x1, y1] = rectOf(spec, page);
    const size = spec.size || 8;
    const lineh = spec.lineh || size + 2.5;
    const template = spec.value !== undefined ? spec.value : action.value;
    let text = template !== undefined
      ? resolveTemplate(template, answers).toUpperCase()
      : textForAction(action, value, answers, question);
    const lines = wrapText(text, font, size, x1 - x0 - 4);
    let y = y1 - size;
    for (const line of lines) {
      if (y < y0 - 1) break;
      page.drawText(line, { x: x0 + 2, y, size, font, color: ink });
      y -= lineh;
    }
    return;
  }
  if (action.drawComb) {
    const spec = action.drawComb;
    const page = doc.getPage(spec.page - 1);
    let text = textForAction(action, value, answers, question);
    if (spec.format) text = formatValue(value, spec.format);
    text = text.replace(/\s/g, '');
    const size = spec.size || 9;
    const ph = page.getHeight();
    const y = spec.top !== undefined
      ? ph - spec.top - size
      : spec.tat ? ph - spec.tat[1] - size : spec.at[1];
    const startX = spec.tat ? spec.tat[0] : spec.at ? spec.at[0] : 0;
    const count = spec.xs ? spec.xs.length : spec.count || text.length;
    for (let i = 0; i < text.length && i < count; i++) {
      const cw = font.widthOfTextAtSize(text[i], size);
      // spec.xs lists explicit cell centers (for unevenly spaced box groups);
      // otherwise cells are uniform: startX + i * pitch
      const x = spec.xs
        ? spec.xs[i] - cw / 2
        : startX + i * spec.pitch + (spec.pitch - cw) / 2;
      page.drawText(text[i], { x, y, size, font, color: ink });
    }
    return;
  }
  throw new Error(`unknown draw action ${JSON.stringify(Object.keys(action))}`);
}

module.exports = { generatePdf, formatValue };
