'use strict';

// Evaluate a showIf condition (or AND-array of conditions) against answers.
// Condition shapes: {q, eq}, {q, ne}, {q, in:[..]}, {q, gte:n}, {q, truthy:true}
function evalCondition(cond, answers) {
  if (!cond) return true;
  if (Array.isArray(cond)) return cond.every((c) => evalCondition(c, answers));
  if (cond.or) return cond.or.some((c) => evalCondition(c, answers));
  const v = answers[cond.q];
  if ('eq' in cond) return v === cond.eq;
  if ('ne' in cond) return v !== cond.ne;
  if ('in' in cond) {
    return Array.isArray(v)
      ? v.some((x) => cond.in.includes(x))
      : cond.in.includes(v);
  }
  if ('gte' in cond) return Number(v) >= cond.gte;
  if ('truthy' in cond) {
    const t = !(v === undefined || v === null || v === '' || v === false ||
      (Array.isArray(v) && v.length === 0));
    return cond.truthy ? t : !t;
  }
  return true;
}

// Flatten a definition into the ordered list of questions visible for the
// given answers. Each entry carries its section title. Questions/sections
// flagged `admin: true` are only included when includeAdmin is set — they are
// filled in by the reviewing admin, not the client.
function visibleQuestions(definition, answers, includeAdmin = false) {
  const out = [];
  for (const section of definition.sections) {
    if (section.admin && !includeAdmin) continue;
    if (!evalCondition(section.showIf, answers)) continue;
    for (const q of section.questions) {
      if (q.admin && !includeAdmin) continue;
      if (!evalCondition(q.showIf, answers)) continue;
      out.push({ section, question: q });
    }
  }
  return out;
}

module.exports = { evalCondition, visibleQuestions };
