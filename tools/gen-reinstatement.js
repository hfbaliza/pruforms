'use strict';
// Generates definitions/reinstatement.json (form has no AcroForm fields, so
// everything is a coordinate overlay; tbox/tat coordinates are top-origin).
const fs = require('fs');

const q = (o) => o;

// ---- person-details column builder (page 1) ----
// Left column (Life Insured) x=37; right column (Policyowner) x=309.
function personQuestions(prefix, x, who, extraShowIf) {
  const S = (dx, top, w, h = 13) => ({ tbox: [x + dx, top, w, h] });
  const sif = (cond) => (extraShowIf ? [extraShowIf, cond].flat().filter(Boolean) : cond || undefined);
  const wide = x === 37 ? 256 : 249;
  return [
    q({ id: `${prefix}_surname`, q: `What is ${who} surname?`, type: 'text', required: true,
      showIf: sif(), map: [{ draw: { page: 1, ...S(0, 360, wide), size: 9 } }] }),
    q({ id: `${prefix}_given`, q: `What is ${who} given name?`, type: 'text', required: true,
      showIf: sif(), map: [{ draw: { page: 1, ...S(0, 381.5, wide), size: 9 } }] }),
    q({ id: `${prefix}_middle`, q: `What is ${who} middle name?`, type: 'text',
      showIf: sif(), map: [{ draw: { page: 1, ...S(0, 404, wide), size: 9 } }] }),
    q({ id: `${prefix}_other`, q: `Does ${who.replace(' your', '')} have any other legal name or alias? If so, type it; otherwise skip.`, type: 'text',
      showIf: sif(), map: [{ draw: { page: 1, ...S(0, 426.5, x === 37 ? 210 : 209), size: 8 } }] }),
    q({ id: `${prefix}_suffix`, q: `Name suffix (e.g. Jr., III)? Skip if none.`, type: 'text',
      showIf: sif(), map: [{ draw: { page: 1, tbox: [x === 37 ? 252 : 525, 426.5, x === 37 ? 41 : 33, 13], size: 8 } }] }),
    q({ id: `${prefix}_salutation`, q: `Preferred salutation (e.g. Mr., Mrs., Miss)?`, type: 'text',
      showIf: sif(), map: [{ draw: { page: 1, ...S(0, 451.5, wide), size: 9 } }] }),
    q({ id: `${prefix}_dob`, q: `What is ${who} date of birth?`, type: 'date', required: true,
      showIf: sif(),
      map: [{ drawComb: { page: 1, top: 478.5, size: 8.5, format: 'date_digits',
        xs: [43.2, 55.6, 70, 82.8, 97.6, 109.9, 122.4, 134.7].map((v) => v + (x === 37 ? 0 : 272.5)) } }] }),
    q({ id: `${prefix}_nationality`, q: `What is ${who} nationality?`, type: 'text', required: true,
      showIf: sif(), map: [{ draw: { page: 1, tbox: [x === 37 ? 151 : 423, 478.5, x === 37 ? 142 : 135, 13], size: 9 } }] }),
    q({ id: `${prefix}_mobile`, q: `What is ${who} mobile number?`, type: 'phone', required: true,
      showIf: sif(), map: [{ draw: { page: 1, tbox: [x + 1, 502.5, 145, 13], size: 9 } }] }),
    q({ id: `${prefix}_email`, q: `What is ${who} email address?`, type: 'email',
      showIf: sif(), map: [{ draw: { page: 1, tbox: [x === 37 ? 189 : 461, 502.5, x === 37 ? 104 : 97, 13], size: 8, upper: false } }] }),
    q({ id: `${prefix}_address`, q: `What is ${who} present address?`, help: 'Number, street, municipality/city, province.', type: 'textarea', required: true,
      showIf: sif(), map: [{ drawWrap: { page: 1, ...S(0, 527.5, wide, 28), size: 8, lineh: 13.5 } }] }),
    q({ id: `${prefix}_country`, q: `Which country is that address in?`, type: 'text', required: true,
      showIf: sif(), map: [{ draw: { page: 1, tbox: [x + 3, 564, 143, 13], size: 9 } }] }),
    q({ id: `${prefix}_zip`, q: `What is the ZIP code?`, type: 'text',
      showIf: sif(), map: [{ draw: { page: 1, tbox: [x === 37 ? 189 : 462, 564, x === 37 ? 104 : 96, 13], size: 9 } }] }),
    q({ id: `${prefix}_occupation`, q: `What is ${who} occupation?`, help: 'State exact duties; if a member of AFP/PNP, state rank.', type: 'text', required: true,
      showIf: sif(), map: [{ draw: { page: 1, ...S(0, 589, wide), size: 8 } }] }),
    q({ id: `${prefix}_income`, q: `What is ${who} gross annual income (in PhP)?`, type: 'number', required: true,
      showIf: sif(), map: [{ draw: { page: 1, ...S(0, 614, wide), size: 9 } }] }),
  ];
}

// ---- statement of insurability rows (page 2) ----
const soiRows = [
  ['q1', 117.5, 'Is {W} in good health, free from all diseases, deformities and abnormalities?', 24],
  ['q2a', 145.5, 'Since the issuance of the Policy/ies or the last reinstatement, has {W} ever had any illness or recurrent illness, injury, medication, or disease?', 20],
  ['q2b', 167.5, 'Ever had any medical consultation, hospitalization, or surgical operation due to any condition, or been prescribed for or attended by a physician or practitioner for any cause, or undergone any diagnostic test/s?', 18],
  ['q2c', 187.5, 'Ever been confined or hospitalized in a clinic, institution, or other medical facility?', 12],
  ['q2d', 201.5, 'Ever changed the customary occupation, or country of residence?', 16],
  ['q2e', 219.5, 'Ever had any application for life, accident or health insurance, or reinstatement that was declined, postponed, rated, or modified?', 16],
  ['q2f', 237.5, 'Experienced death among the immediate members of the family?', 17],
  ['q3', 256.5, 'For female clients: is she now pregnant? If yes, note how many months in the details.', 14],
];

function soiQuestions() {
  const out = [];
  out.push(q({
    id: 'soi_po_applies',
    q: 'Does the Policyowner also need to answer the health questions? (Only if the policy has an existing payor waiver or payor term rider.)',
    type: 'radio', required: true,
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No, Life Insured only' }],
    map: [],
  }));
  const yesNo = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
  for (const [key, top, text, detailH] of soiRows) {
    const liQ = `soi_${key}_li`;
    const poQ = `soi_${key}_po`;
    out.push(q({
      id: liQ, q: `Life Insured — ${text.replace('{W}', 'the Life Insured')}`,
      type: 'radio', required: true, options: yesNo,
      map: [
        { drawX: { page: 2, tat: [363.5, top], size: 8, when: 'yes' } },
        { drawX: { page: 2, tat: [393.5, top], size: 8, when: 'no' } },
      ],
    }));
    out.push(q({
      id: poQ, q: `Policyowner — ${text.replace('{W}', 'the Policyowner')}`,
      type: 'radio', options: yesNo, showIf: { q: 'soi_po_applies', eq: 'yes' },
      map: [
        { drawX: { page: 2, tat: [422.5, top], size: 8, when: 'yes' } },
        { drawX: { page: 2, tat: [452.5, top], size: 8, when: 'no' } },
      ],
    }));
    // Question 1 asks about *good* health, so details are needed on "No";
    // every other row needs details on "Yes".
    const detailTrigger = key === 'q1' ? 'no' : 'yes';
    out.push(q({
      id: `soi_${key}_details`,
      q: `Please give the details for that "${detailTrigger === 'no' ? 'No' : 'Yes'}" answer.`,
      type: 'textarea', required: true,
      showIf: { or: [{ q: liQ, eq: detailTrigger }, { q: poQ, eq: detailTrigger }] },
      map: [{ drawWrap: { page: 2, tbox: [479, top - 2, 84, detailH], size: 6, lineh: 6.5 } }],
    }));
  }
  return out;
}

const definition = {
  id: 'reinstatement',
  title: 'Reinstatement Form',
  description: 'Reinstate a lapsed individual policy — updating, redating, or premium resumption.',
  pdf: 'reinstatement.pdf',
  sections: [
    {
      id: 'type', title: 'Type of Reinstatement',
      questions: [
        q({
          id: 'reinstatement_type', q: 'What type of reinstatement are you requesting?',
          type: 'radio', required: true,
          options: [
            { value: 'updating', label: 'Updating' },
            { value: 'redating', label: 'Redating' },
            { value: 'premium_resumption', label: 'Premium Resumption' },
          ],
          map: [
            { drawX: { page: 1, tat: [44, 241.5], size: 8, when: 'updating' } },
            { drawX: { page: 1, tat: [44, 269.5], size: 8, when: 'redating' } },
            { drawX: { page: 1, tat: [44, 297.5], size: 8, when: 'premium_resumption' } },
          ],
        }),
        q({
          id: 'requirements', q: 'Which requirements are you submitting with this form?',
          help: 'Tick everything that applies. If reinstating under a monthly mode of payment, one of the last two is strictly required.',
          type: 'checkboxes',
          options: [
            { value: 'form', label: 'Duly dated and signed Reinstatement Form' },
            { value: 'underwriting', label: 'Underwriting routine requirements' },
            { value: 'payment', label: 'Payment of reinstatement cost' },
            { value: 'pdc', label: 'Twelve (12) post-dated checks (PDC), PDC certification and PDC Monthly Agreement form' },
            { value: 'autopay', label: 'Proof of enrolment to auto-payment facility (Auto Charge, Auto Debit, PDC)' },
          ],
          map: [
            { drawX: { page: 1, tat: [143, 235.5], size: 7, when: 'form' } },
            { drawX: { page: 1, tat: [142, 251.5], size: 7, when: 'underwriting' } },
            { drawX: { page: 1, tat: [143, 260.5], size: 7, when: 'payment' } },
            { drawX: { page: 1, tat: [143, 281.5], size: 7, when: 'pdc' } },
            { drawX: { page: 1, tat: [143, 291.5], size: 7, when: 'autopay' } },
          ],
        }),
        q({
          id: 'records_consent',
          q: 'Do you consent to updating Pru Life UK’s records based on the Life Insured and Policyowner details provided in this form?',
          type: 'checkbox',
          label: 'Yes, I consent',
          map: [{ drawX: { page: 1, tat: [42.5, 319.5], size: 8 } }],
        }),
        q({
          id: 'policy_num_1', q: 'What is the policy number to reinstate?', type: 'text', required: true,
          map: [{ drawComb: { page: 1, tat: [472.5, 177], pitch: 11.6, count: 8, size: 8 } }],
        }),
        q({
          id: 'policy_num_2', q: 'A second policy number, if this request covers another policy? (Skip if not.)', type: 'text',
          map: [{ drawComb: { page: 1, tat: [472.5, 191.5], pitch: 11.6, count: 8, size: 8 } }],
        }),
        q({
          id: 'policy_num_3', q: 'A third policy number? (Skip if not.)', type: 'text',
          map: [{ drawComb: { page: 1, tat: [472.5, 206], pitch: 11.6, count: 8, size: 8 } }],
        }),
      ],
    },
    {
      id: 'life_insured', title: 'Details of Life Insured',
      questions: personQuestions('li', 37, "the Life Insured's", null),
    },
    {
      id: 'policyowner', title: 'Details of Policyowner',
      questions: [
        q({
          id: 'po_same',
          q: 'Is the Policyowner the same person as the Life Insured?',
          type: 'radio', required: true,
          options: [{ value: 'yes', label: 'Yes, the same person' }, { value: 'no', label: 'No, a different person' }],
          map: [{ drawX: { page: 1, tat: [468.5, 335], size: 7, when: 'yes' } }],
        }),
        ...personQuestions('po', 309, "the Policyowner's", { q: 'po_same', eq: 'no' }),
      ],
    },
    {
      id: 'payment', title: 'Payment Information',
      questions: [
        q({
          id: 'personally_paying',
          q: 'Are you personally paying for this policy?',
          type: 'radio', required: true,
          options: [
            { value: 'yes', label: 'Yes — I, the Policyowner, am paying for this policy' },
            { value: 'no', label: 'No — a third-party payor will be paying (please also accomplish the KYC for third-party payor form)' },
          ],
          map: [
            { drawX: { page: 1, tat: [176.5, 653.5], size: 8, when: 'yes' } },
            { drawX: { page: 1, tat: [361.5, 653.5], size: 8, when: 'no' } },
          ],
        }),
        q({
          id: 'reinstatement_cost', q: 'What is the reinstatement cost (amount you are paying)?',
          type: 'number',
          map: [{ draw: { page: 1, tbox: [38, 690.5, 240, 14], size: 9 } }],
        }),
        q({
          id: 'payment_method', q: 'How will you pay?',
          type: 'radio', required: true,
          options: [
            { value: 'credit', label: 'Credit Card' },
            { value: 'cash', label: 'Cash' },
            { value: 'cheque', label: 'Cheque' },
          ],
          map: [
            { drawX: { page: 1, tat: [289, 692.5], size: 8, when: 'credit' } },
            { drawX: { page: 1, tat: [415, 692.5], size: 8, when: 'cash' } },
            { drawX: { page: 1, tat: [511, 692.5], size: 8, when: 'cheque' } },
          ],
        }),
      ],
    },
    {
      id: 'insurability', title: 'Statement of Insurability',
      intro: 'This section should be completed by the Life Insured. The Policyowner portion should be completed if the Policy/ies has/have an existing payor waiver/payor term rider.',
      questions: soiQuestions(),
    },
    {
      id: 'declaration', title: 'Declaration & Signatures',
      intro: 'By signing, you declare and agree to the statements printed in the "Please read carefully before signing" section of the form, and acknowledge the Purpose Statement on data privacy.',
      questions: [
        q({
          id: 'executed_place', q: 'Where are you completing this form? (city/municipality)', type: 'text', required: true,
          map: [{ draw: { page: 2, tbox: [152, 577, 195, 14], size: 9 } }],
        }),
        q({
          id: 'executed_date', q: 'What is today’s date?', type: 'date', required: true,
          map: [{ drawComb: { page: 2, top: 579.5, size: 8, format: 'date_digits',
            xs: [390.8, 402.3, 417.5, 429.7, 444.7, 457.0, 469.4, 481.5] } }],
        }),
        q({
          id: 'li_signature', q: 'Life Insured — please draw your customary signature.',
          help: 'This certifies that the signature appearing on all your forms and valid IDs is your customary signature.',
          type: 'signature', required: true,
          map: [
            { image: { page: 2, tbox: [252, 648, 133, 46], grow: 1 } },
            { draw: { page: 2, tbox: [252, 694, 133, 9], size: 7, align: 'center', value: '{li_given} {li_middle} {li_surname}' } },
          ],
        }),
        q({
          id: 'po_signature', q: 'Policyowner — please draw your customary signature (if other than the Life Insured).',
          type: 'signature',
          showIf: { q: 'po_same', eq: 'no' },
          map: [
            { image: { page: 2, tbox: [414, 648, 133, 46], grow: 1 } },
            { draw: { page: 2, tbox: [414, 694, 133, 9], size: 7, align: 'center', value: '{po_given} {po_middle} {po_surname}' } },
          ],
        }),
      ],
    },
  ],
};

fs.writeFileSync(
  require('path').join(__dirname, '..', 'definitions', 'reinstatement.json'),
  JSON.stringify(definition, null, 2) + '\n'
);
console.log('wrote reinstatement.json with',
  definition.sections.reduce((n, s) => n + s.questions.length, 0), 'questions');
