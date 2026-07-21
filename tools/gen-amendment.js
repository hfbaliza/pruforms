'use strict';
// Generates definitions/policy-amendment.json
const fs = require('fs');

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const combo = (base, n) =>
  Array.from({ length: n }, (_, i) => `${base}${i}`);

// D.DATE-A-1.0.0 .. D.DATE-A-1.7.0 style
const dateComb = (mid) =>
  Array.from({ length: 8 }, (_, i) => `D.DATE-A-1.${i}.${mid}`);

const sections = [];

// ---------- Policyowner details (always) ----------
sections.push({
  id: 'policyowner',
  title: 'Details of Policyowner',
  questions: [
    { id: 'policy_num_1', q: 'What is the policy number you want to amend?', type: 'text', required: true,
      map: [{ comb: combo('Text1.', 8), format: 'chars' }] },
    { id: 'policy_num_2', q: 'A second policy number covered by this same request? (Skip if none.)',
      help: 'One form may be used for multiple policies for minor amendments, or major amendments where the Policyowner, Life Insured and Irrevocable Beneficiaries are all the same.',
      type: 'text',
      map: [{ comb: combo('Text2.', 8), format: 'chars' }] },
    { id: 'policy_num_3', q: 'A third policy number? (Skip if none.)', type: 'text',
      map: [{ comb: combo('Text3.', 8), format: 'chars' }] },
    { id: 'po_surname', q: 'What is your surname?', type: 'text', required: true,
      map: [{ text: 'DETAILS OF LIFE INSURED-SURNAME', size: 9 }] },
    { id: 'po_given', q: 'What is your given name?', type: 'text', required: true,
      map: [{ lines: ['DETAILS OF LIFE INSURED-GIVEN NAME1', 'DETAILS OF LIFE INSURED-GIVEN NAME2'], chars: 44, size: 9 }] },
    { id: 'po_middle', q: 'What is your middle name?', type: 'text',
      map: [{ text: 'DETAILS OF LIFE INSURED-MIDDLE', size: 9 }] },
    { id: 'po_other', q: 'Do you have any other legal name or alias? (Skip if none.)', type: 'text',
      map: [{ text: 'DETAILS OF LIFE INSURED-OTHERS', size: 9 }] },
    { id: 'po_dob', q: 'What is your date of birth?', type: 'date', required: true,
      map: [{ comb: dateComb('0'), format: 'date_digits' }] },
    { id: 'po_nationality', q: 'What is your nationality?', type: 'text', required: true,
      map: [{ text: 'Nationality', size: 9 }] },
    { id: 'po_mobile', q: 'What is your mobile number?', type: 'phone', required: true,
      map: [{ text: 'MOBILE NUM1', size: 9 }] },
    { id: 'po_tel', q: 'What is your telephone (landline) number? (Skip if none.)', type: 'phone',
      map: [{ text: 'TEL NO1', size: 9 }] },
    { id: 'po_occupation', q: 'What is your occupation?',
      help: 'State exact duties; if a member of AFP/PNP, state rank.', type: 'text', required: true,
      map: [{ text: 'OCCUPATION1', size: 8 }] },
    { id: 'po_employer', q: 'What is the name of your employer or business?', type: 'text',
      map: [{ text: 'EMPLOYER', size: 8 }] },
    { id: 'us_tax', q: 'Do you currently file a tax return in the United States of America?',
      type: 'radio', required: true,
      options: [{ value: '1', label: 'Yes' }, { value: '2', label: 'No' }],
      map: [{ radio: 'YN1' }] },
    { id: 'kyc_changes',
      q: 'Are there changes in your personal details as Policyowner in the records of Pru Life UK?',
      help: 'If yes, you will be asked to fill out the additional KYC details section.',
      type: 'radio', required: true,
      options: [{ value: '1', label: 'Yes' }, { value: '2', label: 'No' }],
      map: [{ radio: 'YN2' }] },
  ],
});

// ---------- Section 1: additional KYC ----------
sections.push({
  id: 'kyc',
  title: 'Additional KYC Details of the Policyowner',
  intro: 'Any information provided in this section will be used to update your personal details in Pru Life UK records. Skip any item with no change.',
  showIf: { q: 'kyc_changes', eq: '1' },
  questions: [
    { id: 'kyc_gender', q: 'What is your gender?', type: 'radio',
      options: [{ value: '1', label: 'Male' }, { value: '2', label: 'Female' }],
      map: [{ radio: 'G1' }] },
    { id: 'kyc_salutation', q: 'What salutation do you prefer? (e.g. Mr., Mrs., Miss)', type: 'text',
      map: [{ text: 'SALUTATION eg Mr Mrs Miss etc', size: 9 }] },
    { id: 'kyc_age', q: 'What is your age?', type: 'number',
      map: [{ text: 'AGE', size: 9 }] },
    { id: 'kyc_pob', q: 'What is your place of birth? (city/province, country)', type: 'text',
      map: [{ text: 'PLACE OF BIRTH cityprovince country', size: 9 }] },
    { id: 'kyc_civil', q: 'What is your civil status?', type: 'dropdown',
      options: [
        { value: '1', label: 'Single' },
        { value: '2', label: 'Married' },
        { value: '3', label: 'Others' },
      ],
      map: [{ radio: 'CS1' }] },
    { id: 'kyc_civil_others', q: 'Please specify your civil status.', type: 'text', required: true,
      showIf: { q: 'kyc_civil', eq: '3' },
      map: [{ text: 'CIVIL STATUS Single Married Others', size: 8 }] },
    { id: 'kyc_tin', q: 'What is your TIN (Tax Identification Number)?', type: 'text',
      map: [{ text: 'TIN SSSGSIS', size: 9 }] },
    { id: 'kyc_sss', q: 'What is your SSS/GSIS number?', type: 'text',
      map: [{ text: 'SSSGSIS', size: 9 }] },
    { id: 'kyc_mobile', q: 'What is your updated mobile number?', type: 'phone',
      map: [{ text: 'MOBILE NUMBER TELEPHONE NUMBER EMAIL ADDRESS.0', size: 9 }] },
    { id: 'kyc_tel', q: 'What is your updated telephone number?', type: 'phone',
      map: [{ text: 'MOBILE NUMBER TELEPHONE NUMBER EMAIL ADDRESS.1', size: 9 }] },
    { id: 'kyc_email', q: 'What is your updated email address?', type: 'email',
      map: [{ text: 'MOBILE NUMBER TELEPHONE NUMBER EMAIL ADDRESS.2', size: 8 }] },
    { id: 'kyc_emp_tel', q: 'What is your employer/business telephone number?', type: 'phone',
      map: [{ text: 'EMPLOYER/BUSINESS TELEPHONE NUMBER1.0', size: 9 }] },
    { id: 'kyc_emp_mobile', q: 'What is your employer/business mobile number?', type: 'phone',
      map: [{ text: 'EMPLOYER/BUSINESS TELEPHONE NUMBER1.1', size: 9 }] },
    { id: 'kyc_emp_email', q: 'What is your employer/business email address?', type: 'email',
      map: [{ text: 'EMPLOYER/BUSINESS TELEPHONE NUMBER1.2', size: 8 }] },
    { id: 'kyc_emp_address', q: 'What is your employer/business address?',
      help: 'Number, street, municipality/city, province.', type: 'textarea',
      map: [{ text: 'EMPLOYER/BUSINESS ADDRESS (number, street, municipality/city, province)1', multiline: true, size: 8 }] },
    { id: 'kyc_emp_country', q: 'Which country is your employer/business address in?', type: 'text',
      map: [{ text: 'COUNTRY1', size: 9 }] },
    { id: 'kyc_emp_zip', q: 'ZIP code of your employer/business address?', type: 'text',
      map: [{ text: 'ZIp1', size: 9 }] },
    { id: 'kyc_income', q: 'What is your gross annual income (in PhP)?', type: 'number',
      map: [{ text: 'GROSS ANNUAL INCOME in PhP', size: 9 }] },
    { id: 'kyc_networth', q: 'What is your net worth (in PhP)?', type: 'number',
      map: [{ text: 'NET WORTH in PhP', size: 9 }] },
    { id: 'kyc_funds', q: 'What is your source of funds?', type: 'radio',
      options: [
        { value: '1', label: 'Salary' },
        { value: '2', label: 'Business' },
        { value: '3', label: 'Others' },
      ],
      map: [{ radio: 'SF1' }] },
    { id: 'kyc_funds_others', q: 'Please specify your source of funds.', type: 'text', required: true,
      showIf: { q: 'kyc_funds', eq: '3' },
      map: [{ text: 'SOURCES OF FUNDS Salary Business Others', size: 8 }] },
    { id: 'kyc_present_address', q: 'What is your present address?',
      help: 'Number, street, municipality/city, province.', type: 'textarea',
      map: [{ text: 'PRESENT ADDRESS number street municipalitycity province COUNTRY ZIP CODE', multiline: true, size: 8 }] },
    { id: 'kyc_present_country', q: 'Which country is your present address in?', type: 'text',
      map: [{ text: 'COUNTRY2', size: 9 }] },
    { id: 'kyc_present_zip', q: 'ZIP code of your present address?', type: 'text',
      map: [{ text: 'ZIp2', size: 9 }] },
    { id: 'kyc_perm_same', q: 'Is your permanent address the same as your present address?', type: 'radio',
      options: YES_NO,
      map: [{ check: 'Tick if same as1', when: { q: 'kyc_perm_same', eq: 'yes' } }] },
    { id: 'kyc_perm_address', q: 'What is your permanent address?', type: 'textarea', required: true,
      showIf: { q: 'kyc_perm_same', eq: 'no' },
      map: [{ text: 'PERMANENT ADDRESS 1', multiline: true, size: 8 }] },
    { id: 'kyc_perm_country', q: 'Which country is your permanent address in?', type: 'text',
      showIf: { q: 'kyc_perm_same', eq: 'no' },
      map: [{ text: 'COUNTRY3', size: 9 }] },
    { id: 'kyc_perm_zip', q: 'ZIP code of your permanent address?', type: 'text',
      showIf: { q: 'kyc_perm_same', eq: 'no' },
      map: [{ text: 'ZIp3', size: 9 }] },
    { id: 'kyc_billing', q: 'Which address should be used for Pru Life UK correspondence?', type: 'radio',
      options: [
        { value: '1', label: 'Present address' },
        { value: '2', label: 'Permanent address' },
        { value: '3', label: 'Employer/Business address' },
      ],
      map: [{ radio: 'Preferred billing address1' }] },
    { id: 'kyc_reason_addr', q: 'If you changed your address, what is the reason for the change?',
      help: 'If the new address is the same as the servicing agent’s address, please indicate the relationship with the agent and reason for such request.',
      type: 'textarea',
      map: [{ text: 'REASON FOR CHANGE IN ADDRESS', multiline: true, size: 8 }] },
  ],
});

// ---------- Section 2: change details of life insured ----------
const LI = 'CHANGE DETAILS DETAILS OF LIFE INSURED';
sections.push({
  id: 'life_insured',
  title: 'Change Details of Life Insured',
  intro: 'Fill out only the fields that need to be updated or changed — skip everything else.',
  questions: [
    { id: 'sec2_gate', q: 'Do you need to change any details of the Life Insured?', type: 'radio', required: true,
      options: YES_NO, map: [] },
    { id: 'li_surname', q: "Life Insured's new surname?", type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: `${LI}-SURNAME`, size: 9 }] },
    { id: 'li_given', q: "Life Insured's new given name?", type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' },
      map: [{ lines: [`${LI}-GIVEN NAME1`, `${LI}-GIVEN NAME2`], chars: 44, size: 9 }] },
    { id: 'li_middle', q: "Life Insured's new middle name?", type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: `${LI}-MIDDLE`, size: 9 }] },
    { id: 'li_other', q: "Life Insured's other legal name or alias?", type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: `${LI}-OTHERS`, size: 9 }] },
    { id: 'li_gender', q: "Life Insured's gender?", type: 'radio',
      showIf: { q: 'sec2_gate', eq: 'yes' },
      options: [{ value: '1', label: 'Male' }, { value: '2', label: 'Female' }],
      map: [{ radio: 'change-G1' }] },
    { id: 'li_civil', q: "Life Insured's civil status?", type: 'dropdown',
      showIf: { q: 'sec2_gate', eq: 'yes' },
      options: [
        { value: '1', label: 'Single' },
        { value: '2', label: 'Married' },
        { value: '3', label: 'Others' },
      ],
      map: [{ radio: 'change-CS1' }] },
    { id: 'li_civil_others', q: 'Please specify the civil status.', type: 'text', required: true,
      showIf: [{ q: 'sec2_gate', eq: 'yes' }, { q: 'li_civil', eq: '3' }],
      map: [{ text: 'CIVIL STATUS-OTHERS', size: 8 }] },
    { id: 'li_salutation', q: "Life Insured's salutation? (e.g. Mr., Mrs., Miss)", type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change-SALUTATION', size: 9 }] },
    { id: 'li_dob', q: "Life Insured's date of birth?", type: 'date',
      showIf: { q: 'sec2_gate', eq: 'yes' },
      map: [{ comb: dateComb('1.0'), format: 'date_digits' }] },
    { id: 'li_age', q: "Life Insured's age?", type: 'number',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change-AGE1', size: 9 }] },
    { id: 'li_nationality', q: "Life Insured's nationality?", type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change-Nationality', size: 9 }] },
    { id: 'li_pob', q: "Life Insured's place of birth? (city/province, country)", type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change details-PLACE OF BIRTH', size: 9 }] },
    { id: 'li_present_address', q: "Life Insured's present address?", type: 'textarea',
      showIf: { q: 'sec2_gate', eq: 'yes' },
      map: [{ drawWrap: { page: 2, rect: [47, 521, 293, 550], size: 8, lineh: 11 } }] },
    { id: 'li_present_country', q: 'Country of that present address?', type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change-COUNTRY1.0', size: 9 }] },
    { id: 'li_present_zip', q: 'ZIP code of the present address?', type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change-ZIp1.0', size: 9 }] },
    { id: 'li_perm_same', q: "Is the Life Insured's permanent address the same as the present address?", type: 'radio',
      showIf: { q: 'sec2_gate', eq: 'yes' }, options: YES_NO,
      map: [{ check: 'change-details-Tick if same as2', when: { q: 'li_perm_same', eq: 'yes' } }] },
    { id: 'li_perm_address', q: "Life Insured's permanent address?", type: 'textarea', required: true,
      showIf: [{ q: 'sec2_gate', eq: 'yes' }, { q: 'li_perm_same', eq: 'no' }],
      map: [{ drawWrap: { page: 2, rect: [47, 443, 293, 470], size: 8, lineh: 11 } }] },
    { id: 'li_perm_country', q: 'Country of the permanent address?', type: 'text',
      showIf: [{ q: 'sec2_gate', eq: 'yes' }, { q: 'li_perm_same', eq: 'no' }],
      map: [{ text: 'change-COUNTRY1.1', size: 9 }] },
    { id: 'li_perm_zip', q: 'ZIP code of the permanent address?', type: 'text',
      showIf: [{ q: 'sec2_gate', eq: 'yes' }, { q: 'li_perm_same', eq: 'no' }],
      map: [{ text: 'change-ZIp1.1', size: 9 }] },
    { id: 'li_mobile', q: "Life Insured's mobile number?", type: 'phone',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'CHANGE DETAILS-MOBILE NUM1', size: 9 }] },
    { id: 'li_tel', q: "Life Insured's telephone number?", type: 'phone',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'CHANGE DETAILS-TEL NO1', size: 9 }] },
    { id: 'li_email', q: "Life Insured's email address?", type: 'email',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'CHANGE DETAILS-EMAIL ADDRESS', size: 8 }] },
    { id: 'li_tin', q: "Life Insured's TIN?", type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change details-TIN SSSGSIS', size: 9 }] },
    { id: 'li_sss', q: "Life Insured's SSS/GSIS number?", type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change details-SSSGSIS', size: 9 }] },
    { id: 'li_occupation', q: "Life Insured's occupation?",
      help: 'State exact duties; if a member of AFP/PNP, state rank.', type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change details-OCCUPATION', size: 8 }] },
    { id: 'li_nature_work', q: 'Nature of work, or nature of business if self-employed?', type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change details-nature of business', size: 8 }] },
    { id: 'li_employer', q: "Life Insured's employer?", type: 'textarea',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change-employer1', multiline: true, size: 8 }] },
    { id: 'li_emp_nature', q: 'Nature of business of that employer?', type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' },
      map: [{ text: 'change details-nature of business of employer', size: 8 }] },
    { id: 'li_emp_mobile', q: "Employer's mobile number?", type: 'phone',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change details-employer-mobilenum', size: 9 }] },
    { id: 'li_emp_tel', q: "Employer's telephone number?", type: 'phone',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change details-employer-telnum', size: 9 }] },
    { id: 'li_emp_email', q: "Employer's email address?", type: 'email',
      showIf: { q: 'sec2_gate', eq: 'yes' },
      map: [{ text: 'change details-nature of business-email', size: 8 }] },
    { id: 'li_emp_address', q: 'Employer/business address?', type: 'textarea',
      showIf: { q: 'sec2_gate', eq: 'yes' },
      map: [{ text: 'change-employer1-address', multiline: true, size: 8 }] },
    { id: 'li_emp_country', q: 'Country of the employer/business address?', type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change details-employer-country', size: 9 }] },
    { id: 'li_emp_zip', q: 'ZIP code of the employer/business address?', type: 'text',
      showIf: { q: 'sec2_gate', eq: 'yes' }, map: [{ text: 'change details-employer-zip', size: 9 }] },
  ],
});

// ---------- Section 3: change in beneficiaries ----------
const beneQuestions = [
  { id: 'sec3_gate', q: 'Do you want to make changes to your beneficiaries?', type: 'radio', required: true,
    options: YES_NO, map: [] },
  { id: 'bene_count', q: 'How many beneficiaries do you want to add, delete or change? (Up to 3 on this form — use special instructions for more.)',
    type: 'dropdown', required: true,
    showIf: { q: 'sec3_gate', eq: 'yes' },
    options: [
      { value: '1', label: '1 beneficiary' },
      { value: '2', label: '2 beneficiaries' },
      { value: '3', label: '3 beneficiaries' },
    ],
    map: [] },
];

const beneSfx = ['', 'a', 'b'];
const beneNameField = ['SURNAME GIVEN NAME MIDDLE NAME', 'SURNAME GIVEN NAME MIDDLE NAME1', 'SURNAME GIVEN NAME MIDDLE NAMEb'];
const beneDobMid = ['1.1', '1.1a', '1.1b'];
for (let i = 0; i < 3; i++) {
  const n = i + 1;
  const sfx = beneSfx[i];
  const show = [{ q: 'sec3_gate', eq: 'yes' }, { q: 'bene_count', gte: n }];
  const B = (base) => `${base}${sfx}`;
  beneQuestions.push(
    { id: `bene${n}_request`, q: `Beneficiary ${n}: what type of request is this?`, type: 'radio', required: true,
      showIf: show,
      options: [
        { value: '1', label: 'Add this beneficiary' },
        { value: '2', label: 'Delete this beneficiary' },
        { value: '3', label: 'Change this beneficiary’s details' },
      ],
      map: [{ radio: B('REQUEST TYPE') }] },
    { id: `bene${n}_name`, q: `Beneficiary ${n}: full name? (Surname, Given Name, Middle Name)`, type: 'text', required: true,
      showIf: show, map: [{ text: beneNameField[i], size: 9 }] },
    { id: `bene${n}_dob`, q: `Beneficiary ${n}: date of birth?`, type: 'date',
      showIf: show, map: [{ comb: dateComb(beneDobMid[i]), format: 'date_digits' }] },
    { id: `bene${n}_gender`, q: `Beneficiary ${n}: gender?`, type: 'radio',
      showIf: show,
      options: [{ value: '1', label: 'Male' }, { value: '2', label: 'Female' }],
      map: [{ radio: B('Bene-GENDER') }] },
    { id: `bene${n}_relationship`, q: `Beneficiary ${n}: relationship to the Insured?`, type: 'text',
      showIf: show, map: [{ text: B('CHANGE IN BENEFICIARIES-RELATIONSHIP TO INSURED'), size: 8 }] },
    { id: `bene${n}_share`, q: `Beneficiary ${n}: percentage share? (Skip for equal sharing.)`, type: 'number',
      showIf: show, map: [{ text: B('CHANGE IN BENEFICIARIES-SHARE'), size: 8 }] },
    { id: `bene${n}_type`, q: `Beneficiary ${n}: primary or secondary beneficiary?`, type: 'radio',
      showIf: show,
      options: [{ value: '1', label: 'Primary' }, { value: '2', label: 'Secondary' }],
      map: [{ radio: B('BENE-TYPE OF BENEFICIARY') }] },
    { id: `bene${n}_designation`, q: `Beneficiary ${n}: revocable or irrevocable designation? (Revocable is assumed unless stated otherwise.)`, type: 'radio',
      showIf: show,
      options: [{ value: '1', label: 'Revocable' }, { value: '2', label: 'Irrevocable' }],
      map: [{ radio: B('BENE-BENEFICIARY DESIGNATION') }] },
    { id: `bene${n}_pob`, q: `Beneficiary ${n}: place of birth?`, type: 'text',
      showIf: show, map: [{ text: B('CHANGE IN BENEFICIARIES-PLACE OF BIRTH'), size: 8 }] },
    { id: `bene${n}_nationality`, q: `Beneficiary ${n}: nationality?`, type: 'text',
      showIf: show, map: [{ text: B('CHANGE IN BENEFICIARIES-NATIONALITY_3'), size: 8 }] },
    { id: `bene${n}_same_addr`, q: `Beneficiary ${n}: is their present address the same as the Policyowner's?`, type: 'radio',
      showIf: show, options: YES_NO,
      map: [{ check: B('undefined_11'), when: { q: `bene${n}_same_addr`, eq: 'yes' } }] },
    { id: `bene${n}_address`, q: `Beneficiary ${n}: present address? (Number, street, municipality/city, province.)`, type: 'textarea', required: true,
      showIf: [...show, { q: `bene${n}_same_addr`, eq: 'no' }],
      map: [{ text: B('CHANGE IN BENEFICIARIES-present address'), multiline: true, size: 8 }] },
    { id: `bene${n}_country`, q: `Beneficiary ${n}: country of that address?`, type: 'text',
      showIf: [...show, { q: `bene${n}_same_addr`, eq: 'no' }],
      map: [{ text: B('CHANGE IN BENEFICIARIES-COUNTRY'), size: 8 }] },
    { id: `bene${n}_zip`, q: `Beneficiary ${n}: ZIP code?`, type: 'text',
      showIf: [...show, { q: `bene${n}_same_addr`, eq: 'no' }],
      map: [{ text: B('CHANGE IN BENEFICIARIES-ZIP CODE'), size: 8 }] }
  );
}
beneQuestions.push({
  id: 'bene_special', q: 'Any special instructions about beneficiaries? (Required if you have more than three primary/secondary beneficiaries.)',
  type: 'textarea',
  showIf: { q: 'sec3_gate', eq: 'yes' },
  map: [{ text: 'SPECIAL INSTRUCTIONS', multiline: true, size: 8 }],
});
sections.push({
  id: 'beneficiaries',
  title: 'Change in Beneficiaries',
  intro: 'Pru Life UK assumes Revocable designation and equal sharing among beneficiaries unless stated otherwise.',
  questions: beneQuestions,
});

// ---------- Sections 4-11: minor amendments ----------
sections.push({
  id: 'payments',
  title: 'Payment & Billing Amendments',
  intro: 'These are optional amendments — skip any that do not apply to your request.',
  questions: [
    { id: 'pay_method', q: 'Do you want to change your method of payment? If so, to which?', type: 'radio',
      options: [
        { value: '1', label: 'Cash' },
        { value: '2', label: 'Post-dated check' },
      ],
      map: [{ radio: 'undefined_14' }] },
    { id: 'resume_ada',
      q: 'Do you opt to resume your credit card/ADA billing and allow Pru Life UK to collect all unpaid premiums from your most recent enrolled/existing card?',
      type: 'checkbox', label: 'Yes, resume my credit card/ADA billing',
      map: [{ check: 'I opt to resume my credit cardADA billing and allow Pru Life UK to collect all unpaid premiums from my most recent enrolledexisting card' }] },
    { id: 'stop_ada',
      q: 'Do you opt to stop your credit card/ADA billing?',
      help: 'Request must be received by Pru Life UK at least five (5) working days before the premium due date. All unpaid premiums shall be collected upon resumption of the billing.',
      type: 'checkbox', label: 'Yes, stop my credit card/ADA billing',
      map: [{ check: 'I opt to stop my credit cardADA billing and agree to the following conditions' }] },
    { id: 'pay_mode', q: 'Do you want to change your mode of payment? If so, to which?', type: 'radio',
      options: [
        { value: '1', label: 'Annual' },
        { value: '2', label: 'Semi-annual' },
        { value: '3', label: 'Quarterly' },
        { value: '4', label: 'Monthly' },
      ],
      map: [{ radio: 'DETAILS OF AMENDMENT REQUEST-modes' }] },
    { id: 'prem_holiday',
      q: 'Do you opt to avail of the Premium Holiday?',
      help: 'Premium payments may be discontinued as long as the fund value is sufficient to cover applicable charges. Corresponding charges apply for Elite plans.',
      type: 'checkbox', label: 'Yes, avail of the Premium Holiday',
      map: [{ check: 'I opt to avail of the Premium Holiday Premium payments may be discontinued at any time as long as the fund value is sufficient to cover the applicable charges on the Policyies' }] },
    { id: 'nonforfeiture', q: 'Non-forfeiture option (traditional plans only) — choose one if applicable.', type: 'radio',
      options: [
        { value: '1', label: 'Cash surrender value' },
        { value: '2', label: 'Reduced paid-up insurance' },
        { value: '3', label: 'Automatic premium loan option' },
        { value: '4', label: 'Extended term insurance' },
      ],
      map: [{ radio: 'NON-FCHANGE MODE OF PORFEITURE OPTION (FAYMENTOR TRADITIONAL PLANS ONLY)' }] },
    { id: 'dividend_option', q: 'Dividend option (traditional plans only) — choose one if applicable.', type: 'radio',
      options: [
        { value: '1', label: 'Paid in cash' },
        { value: '2', label: 'Used to pay a portion of premium' },
        { value: '3', label: 'Used to buy paid-up insurance' },
        { value: '4', label: 'Left to accumulate and earn interest' },
      ],
      map: [{ radio: 'DIVIDEND OPTION AND SUB-OPTION (FOR TRADITIONAL PLANS ONLY)1' }] },
    { id: 'dividend_sub', q: 'Which accumulation sub-option?', type: 'radio', required: true,
      showIf: { q: 'dividend_option', eq: '4' },
      options: [
        { value: '1', label: 'Ordinary accumulation' },
        { value: '2', label: 'Self-liquidation' },
        { value: '3', label: 'Fully paid-up' },
        { value: '4', label: 'Early maturity' },
        { value: '5', label: 'Cash allowance' },
      ],
      map: [{ radio: 'Left to accumulate and earn interest sub-option:' }] },
    { id: 'dividend_consent',
      q: 'Do you agree to use any dividend accumulation of the Policy/ies towards any premium default option in effect?',
      type: 'checkbox', label: 'Yes, I agree',
      map: [{ check: 'DIVIDEND CCHANGE MODE OF PONSENT (FAYMENTOR TRADITIONAL PLANS ONLY)' }] },
  ],
});

// ---------- Sections 12-14: major amendments ----------
const riderQuestions = [
  { id: 'premium_change', q: 'Do you want to increase or decrease your premium? (Major amendment — skip if not.)', type: 'radio',
    options: [
      { value: '1', label: 'Increase' },
      { value: '2', label: 'Decrease' },
    ],
    map: [{ radio: 'Premium Decrease' }] },
  { id: 'premium_amount', q: 'By what amount (PhP)?', type: 'number', required: true,
    showIf: { q: 'premium_change', in: ['1', '2'] },
    map: [{ text: 'Amount', size: 9 }] },
  { id: 'sum_change', q: 'Do you want to increase or decrease your sum assured? (Skip if not.)', type: 'radio',
    options: [
      { value: '1', label: 'Increase' },
      { value: '2', label: 'Decrease' },
    ],
    map: [{ radio: 'Premium Decrease1' }] },
  { id: 'sum_amount', q: 'By what amount (PhP)?', type: 'number', required: true,
    showIf: { q: 'sum_change', in: ['1', '2'] },
    map: [{ text: 'Amount_2', size: 9 }] },
  { id: 'rider_count', q: 'How many riders do you want to add, delete, or change? (Skip if none; up to 10.)', type: 'dropdown',
    options: Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}` })),
    map: [] },
];
const riderTQ = ['TQ', 'TQ1', 'TQ2', 'TQ3', 'TQ4', 'TQ5', 'TQ6', 'TQ7', 'TQ8', 'TQ9'];
for (let i = 0; i < 10; i++) {
  const n = i + 1;
  const sfx = i === 0 ? '' : `_${n}`;
  riderQuestions.push(
    { id: `rider${n}_request`, q: `Rider ${n}: what type of request?`, type: 'radio', required: true,
      showIf: { q: 'rider_count', gte: n },
      options: [
        { value: '1', label: 'Add' },
        { value: '2', label: 'Delete' },
        { value: '3', label: 'Increase coverage' },
        { value: '4', label: 'Decrease coverage' },
      ],
      map: [{ radio: riderTQ[i] }] },
    { id: `rider${n}_name`, q: `Rider ${n}: name of the rider?`, type: 'text', required: true,
      showIf: { q: 'rider_count', gte: n },
      map: [{ text: `NAME OF RIDERAdd Delete Increase coverage Decrease coverage${sfx}`, size: 8 }] },
    { id: `rider${n}_coverage`, q: `Rider ${n}: rider coverage amount?`, type: 'number',
      showIf: { q: 'rider_count', gte: n },
      map: [{ text: `RIDER COVERAGEAdd Delete Increase coverage Decrease coverage${sfx}`, size: 8 }] }
  );
}
riderQuestions.push({
  id: 'rider_special', q: 'Any special instructions about premium, sum assured, or riders? (Required if more than ten riders.)',
  type: 'textarea',
  map: [{ text: 'SPECIAL INSTRUCTIONS_2', multiline: true, size: 8 }],
});
sections.push({
  id: 'major',
  title: 'Major Amendment — Premium, Sum Assured & Riders',
  intro: 'These are optional major amendments — skip any that do not apply.',
  questions: riderQuestions,
});

// ---------- Section 15: reconsideration of rating ----------
sections.push({
  id: 'rating',
  title: 'Reconsideration of Rating',
  questions: [
    { id: 'rating_type', q: 'Are you requesting a reconsideration of rating? Select all that apply, or skip.',
      help: 'Health: submission of medical documents is required; the Policyowner shoulders the expenses for medical examinations. Occupation: a Certificate of Employment from the Life Insured’s new employer is required.',
      type: 'checkboxes',
      options: [
        { value: 'health', label: 'Health' },
        { value: 'occupation', label: 'Occupation' },
      ],
      map: [{ checkEach: { "health": 'Health', "occupation": 'Occupation' } }] },
    { id: 'occ_new', q: 'What is the new occupation?', type: 'text', required: true,
      showIf: { q: 'rating_type', in: ['occupation'] },
      map: [{ text: 'Change Occupation - New Occupation', size: 8 }] },
    { id: 'occ_nature', q: 'Nature of work, or nature of business if self-employed?', type: 'text',
      showIf: { q: 'rating_type', in: ['occupation'] },
      map: [{ text: 'Change Occupation - nature ng work', size: 8 }] },
    { id: 'occ_employer', q: 'Employer name?', type: 'text',
      showIf: { q: 'rating_type', in: ['occupation'] },
      map: [{ text: 'Change Occupation - employer', size: 8 }] },
    { id: 'occ_emp_nature', q: 'Nature of business of the employer?', type: 'text',
      showIf: { q: 'rating_type', in: ['occupation'] },
      map: [{ text: 'Change Occupation - employer nature', size: 8 }] },
    { id: 'occ_address', q: 'Employer/business address? (Number, street, municipality/city, province.)', type: 'textarea',
      showIf: { q: 'rating_type', in: ['occupation'] },
      map: [{ text: 'occupation change EMPLOYER/BUSINESS ADDRESS (number, street, municipality/city, province)', multiline: true, size: 8 }] },
    { id: 'occ_country', q: 'Country of the employer/business address?', type: 'text',
      showIf: { q: 'rating_type', in: ['occupation'] },
      map: [{ text: 'Change Occupation - country', size: 9 }] },
    { id: 'occ_zip', q: 'ZIP code of the employer/business address?', type: 'text',
      showIf: { q: 'rating_type', in: ['occupation'] },
      map: [{ text: 'Change Occupation - zipcode', size: 9 }] },
    { id: 'occ_jobdesc', q: 'Describe the job (job description).', type: 'textarea',
      showIf: { q: 'rating_type', in: ['occupation'] },
      map: [{ text: 'JO1', multiline: true, size: 8 }] },
    { id: 'rating_special', q: 'Any special instructions for this reconsideration?', type: 'textarea',
      showIf: { q: 'rating_type', in: ['health', 'occupation'] },
      map: [{ text: 'SPECIAL INSTRUCTIONS_3', multiline: true, size: 8 }] },
  ],
});

// ---------- Statement of insurability ----------
const soiRows = [
  ['1', 'Are you in good health, free from all diseases, deformities and abnormalities?', 'LI', 'PO', 'DETAILS STATEMENT.0'],
  ['2a', 'Since the issuance of the Policy/ies or the last reinstatement — ever had any illness or recurrent illness, injury, medication, or disease?', 'LI1', 'PO1', 'DETAILS STATEMENT.1'],
  ['2b', 'Ever had any medical consultation, hospitalization, or surgical operation due to any condition, or been prescribed for or attended by a physician or practitioner for any cause, or undergone any diagnostic test/s?', 'LI2', 'PO2', 'DETAILS STATEMENT.2'],
  ['2c', 'Ever been confined or hospitalized in a clinic, institution, or other medical facility?', 'LI3', 'PO3', 'DETAILS STATEMENT.3'],
  ['2d', 'Ever changed your customary occupation, or country of residence?', 'LI4', 'PO4', 'DETAILS STATEMENT.4'],
  ['2e', 'Ever had any application for life, accident or health insurance, or reinstatement that was declined, postponed, rated, or modified?', 'LI5', 'PO5', 'DETAILS STATEMENT.5'],
  ['2f', 'Experienced death among the immediate members of your family?', 'LI6', 'PO6', 'DETAILS STATEMENT.6'],
  ['3', 'For female clients: are you now pregnant? If yes, note how many months in the details.', 'LI7', 'PO7', 'DETAILS STATEMENT.7'],
];
const soiQuestions = [
  { id: 'soi_gate',
    q: 'Does your request involve an increase in insurance coverage, inclusion of riders, or any request involving additional risks?',
    help: 'If yes, the Statement of Insurability must be completed and signed by the Life Insured.',
    type: 'radio', required: true, options: YES_NO, map: [] },
  { id: 'soi_po_applies',
    q: 'Should the Policyowner portion also be completed? (Only if the Policy/ies has an existing payor waiver/payor term rider.)',
    type: 'radio', showIf: { q: 'soi_gate', eq: 'yes' }, options: YES_NO, map: [] },
];
for (const [key, text, liField, poField, detField] of soiRows) {
  const liQ = `soi_${key}_li`;
  const poQ = `soi_${key}_po`;
  // Question 1 asks about *good* health, so details are needed on "No" ('2');
  // every other row needs details on "Yes" ('1').
  const trigger = key === '1' ? '2' : '1';
  soiQuestions.push(
    { id: liQ, q: `Life Insured — ${text}`, type: 'radio', required: true,
      showIf: { q: 'soi_gate', eq: 'yes' },
      options: [{ value: '1', label: 'Yes' }, { value: '2', label: 'No' }],
      map: [{ radio: liField }] },
    { id: poQ, q: `Policyowner — ${text}`, type: 'radio',
      showIf: [{ q: 'soi_gate', eq: 'yes' }, { q: 'soi_po_applies', eq: 'yes' }],
      options: [{ value: '1', label: 'Yes' }, { value: '2', label: 'No' }],
      map: [{ radio: poField }] },
    { id: `soi_${key}_details`, q: `Please give the details for that "${trigger === '2' ? 'No' : 'Yes'}" answer.`, type: 'textarea', required: true,
      showIf: [{ q: 'soi_gate', eq: 'yes' }, { or: [{ q: liQ, eq: trigger }, { q: poQ, eq: trigger }] }],
      map: [{ text: detField, multiline: true, size: 6 }] }
  );
}
sections.push({
  id: 'insurability',
  title: 'Statement of Insurability',
  intro: 'To be completed and signed by the Life Insured for any increase in insurance coverage, inclusion of riders, or any request involving additional risks.',
  questions: soiQuestions,
});

// ---------- Declaration & signatures ----------
sections.push({
  id: 'declaration',
  title: 'Declaration of Understanding & Signatures',
  intro: 'By signing this form you declare, agree to, and authorize the statements in the Declaration of Understanding, the Authorization to Furnish Medical Information, and the data privacy Purpose Statement printed on pages 4–5 of the form.',
  questions: [
    { id: 'executed_place', q: 'Where are you completing this form? (city/municipality)', type: 'text', required: true,
      map: [{ text: 'TEXT-J-1', size: 9 }] },
    { id: 'executed_date', q: 'What is today’s date?', type: 'date', required: true,
      map: [{ comb: ['DATE-TEXT-A', 'DATE-TEXT-A-1', 'DATE-TEXT-A-2', 'DATE-TEXT-A-3', 'DATE-TEXT-A-4', 'DATE-TEXT-A-5', 'DATE-TEXT-A-6', 'DATE-TEXT-A-7'], format: 'date_digits' }] },
    { id: 'po_signature', q: 'Policyowner — please sign.', type: 'signature', required: true,
      map: [
        { text: 'SIGNATURE-1.0.0.0.0', value: '{po_given} {po_middle} {po_surname}', size: 8 },
        { image: { page: 5, rect: [47, 502, 275, 517], grow: 2.2 } },
      ] },
    { id: 'witness_name', q: 'Full name of the witness? (Skip if none.)', type: 'text', admin: true,
      map: [{ text: 'SIGNATURE-1.0.0.0.1', size: 8 }] },
    { id: 'witness_signature', q: 'Witness — please sign.', type: 'signature', admin: true,
      showIf: { q: 'witness_name', truthy: true },
      map: [{ image: { page: 5, rect: [317, 502, 545, 517], grow: 2.2 } }] },
    { id: 'li_sign_name', q: 'Full name of the Life Insured, if different from the Policyowner? (Skip if the same person.)', type: 'text',
      map: [{ text: 'SIGNATURE-1.0.0.1.0', size: 8 }] },
    { id: 'li_signature', q: 'Life Insured — please sign.', type: 'signature',
      showIf: { q: 'li_sign_name', truthy: true },
      map: [{ image: { page: 5, rect: [47, 469, 275, 485], grow: 2.2 } }] },
    ...[
      ['po_customary_1', 'specimen 1 of 3', [237, 355, 332, 400],
        'This certifies that the signature appearing on all your forms and valid IDs is your customary signature. Draw it once for each of the three specimen boxes.'],
      ['po_customary_2', 'specimen 2 of 3', [346, 355, 442, 400], null],
      ['po_customary_3', 'specimen 3 of 3', [456, 355, 551, 400], null],
    ].map(([id, label, rect, help]) => ({
      id, q: `Policyowner customary signature — ${label}.`,
      ...(help ? { help } : {}),
      type: 'signature', required: true,
      map: [{ image: { page: 5, rect } }],
    })),
    { id: 'irrev_applies', q: 'Are there irrevocable beneficiaries (or assignees) who must also sign?', type: 'radio', required: true,
      options: YES_NO, map: [] },
    { id: 'irrev1_name', q: 'Irrevocable Beneficiary 1 — full name?', type: 'text', required: true,
      showIf: { q: 'irrev_applies', eq: 'yes' },
      map: [
        { text: 'SIGNATURE-1.0.0.1.1', size: 8 },
        { draw: { page: 5, rect: [95, 291, 232, 301], size: 8 } },
      ] },
    { id: 'irrev1_signature', q: 'Irrevocable Beneficiary 1 — please sign over the printed name.',
      type: 'signature', required: true,
      showIf: { q: 'irrev_applies', eq: 'yes' },
      map: [{ image: { page: 5, rect: [317, 469, 545, 486], grow: 2.2 } }] },
    ...[1, 2, 3].map((n) => ({
      id: `irrev1_customary_${n}`,
      q: `Irrevocable Beneficiary 1 — customary signature, specimen ${n} of 3.`,
      type: 'signature', required: true,
      showIf: { q: 'irrev_applies', eq: 'yes' },
      map: [{ image: { page: 5, rect: [[239, 275, 334, 320], [348, 275, 444, 320], [455, 275, 550, 320]][n - 1] } }],
    })),
    { id: 'irrev2_name', q: 'Irrevocable Beneficiary 2 — full name? (Skip if none.)', type: 'text',
      showIf: { q: 'irrev_applies', eq: 'yes' },
      map: [
        { text: 'SIGNATURE-1.0.0.2.0', size: 8 },
        { draw: { page: 5, rect: [95, 232, 232, 242], size: 8 } },
      ] },
    { id: 'irrev2_signature', q: 'Irrevocable Beneficiary 2 — please sign over the printed name.', type: 'signature',
      required: true,
      showIf: { q: 'irrev2_name', truthy: true },
      map: [{ image: { page: 5, rect: [47, 435, 275, 452], grow: 2.2 } }] },
    ...[1, 2, 3].map((n) => ({
      id: `irrev2_customary_${n}`,
      q: `Irrevocable Beneficiary 2 — customary signature, specimen ${n} of 3.`,
      type: 'signature', required: true,
      showIf: { q: 'irrev2_name', truthy: true },
      map: [{ image: { page: 5, rect: [[239, 216, 334, 260], [348, 216, 444, 260], [455, 216, 550, 260]][n - 1] } }],
    })),
    { id: 'irrev3_name', q: 'Irrevocable Beneficiary 3 — full name? (Skip if none.)', type: 'text',
      showIf: { q: 'irrev_applies', eq: 'yes' },
      map: [
        { text: 'SIGNATURE-1.0.0.2.1', size: 8 },
        { draw: { page: 5, rect: [95, 175, 232, 185], size: 8 } },
      ] },
    { id: 'irrev3_signature', q: 'Irrevocable Beneficiary 3 — please sign over the printed name.', type: 'signature',
      required: true,
      showIf: { q: 'irrev3_name', truthy: true },
      map: [{ image: { page: 5, rect: [317, 435, 545, 451], grow: 2.2 } }] },
    ...[1, 2, 3].map((n) => ({
      id: `irrev3_customary_${n}`,
      q: `Irrevocable Beneficiary 3 — customary signature, specimen ${n} of 3.`,
      type: 'signature', required: true,
      showIf: { q: 'irrev3_name', truthy: true },
      map: [{ image: { page: 5, rect: [[239, 159, 334, 204], [348, 159, 444, 204], [455, 159, 550, 204]][n - 1] } }],
    })),
  ],
});

const definition = {
  id: 'policy-amendment',
  title: 'Policy Amendment Request',
  description: 'Request minor or major amendments to an individual policy — KYC updates, life insured details, beneficiaries, payments, premium, riders, and more.',
  pdf: 'policy-amendment.pdf',
  sections,
};

fs.writeFileSync(
  require('path').join(__dirname, '..', 'definitions', 'policy-amendment.json'),
  JSON.stringify(definition, null, 2) + '\n'
);
console.log('wrote policy-amendment.json with',
  sections.reduce((n, s) => n + s.questions.length, 0), 'questions');
