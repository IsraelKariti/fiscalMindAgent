import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareCompanies, identifyInstitution, institutionLabelHe, normalizeCompanyText, tieAllowedByCompany } from '../src/agents/declarationOfCapital/institutions.js';
import { INSTITUTIONS, INSTITUTIONS_AS_OF } from '../src/agents/declarationOfCapital/institutionsTable.js';
import { CAPITAL_DOCUMENT_CATALOG, isInstitutionBound } from '../src/agents/declarationOfCapital/catalog.js';

describe('institutions table', () => {
  it('records when the registers were read', () => {
    assert.match(INSTITUTIONS_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('has unique keys and no empty alias', () => {
    const keys = INSTITUTIONS.map((e) => e.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const entry of INSTITUTIONS) {
      assert.ok(entry.aliases.length > 0, entry.key);
      for (const alias of entry.aliases) assert.ok(normalizeCompanyText(alias).trim().length >= 3, `${entry.key}: "${alias}"`);
    }
  });

  it('a Hebrew brand name is always one of the entry\'s own aliases', () => {
    for (const entry of INSTITUTIONS) {
      const hasHebrewAlias = entry.aliases.some((alias) => /[֐-׿]/.test(alias));
      if (entry.nameHe === undefined) assert.ok(!hasHebrewAlias, `${entry.key}: has a Hebrew alias but no nameHe`);
      else assert.ok(entry.aliases.includes(entry.nameHe), `${entry.key}: "${entry.nameHe}"`);
    }
    assert.equal(institutionLabelHe('harel'), 'הראל');
    assert.equal(institutionLabelHe('hsbc'), 'HSBC');
    assert.equal(institutionLabelHe('no_such_company'), 'no_such_company');
  });

  it('no normalized alias belongs to two companies', () => {
    const owner = new Map<string, string>();
    for (const entry of INSTITUTIONS) {
      for (const alias of entry.aliases) {
        const norm = normalizeCompanyText(alias);
        const other = owner.get(norm);
        assert.ok(other === undefined || other === entry.key, `"${alias}" is an alias of both ${other} and ${entry.key}`);
        owner.set(norm, entry.key);
      }
    }
  });

  it('every alias, alone, resolves to its own company', () => {
    for (const entry of INSTITUTIONS) {
      for (const alias of entry.aliases) assert.equal(identifyInstitution(alias), entry.key, `"${alias}"`);
    }
  });
});

describe('identifyInstitution', () => {
  it('Hebrew and English forms of one company agree', () => {
    assert.equal(identifyInstitution('Bank Leumi le-Israel B.M.'), 'bank_leumi');
    assert.equal(identifyInstitution('בנק לאומי לישראל בע"מ'), 'bank_leumi');
    assert.equal(identifyInstitution('Harel Pension & Gemel'), 'harel');
    assert.equal(identifyInstitution('הראל פנסיה וגמל בע"מ'), 'harel');
    assert.equal(identifyInstitution('ALTSHULER SHAHAM PROVIDENT FUNDS AND PENSION LTD'), 'altshuler_shaham');
  });

  it('finds the company inside a list item name, also after a Hebrew prefix letter', () => {
    assert.equal(identifyInstitution('אישור להצהרת הון — קרן השתלמות באלטשולר שחם ליום 31.12.2025'), 'altshuler_shaham');
    assert.equal(identifyInstitution('אישור להצהרת הון — קרן השתלמות בהראל'), 'harel');
    assert.equal(identifyInstitution('אישור יתרות מבנק דיסקונט'), 'bank_discount');
    assert.equal(identifyInstitution('תיק ניירות ערך במיטב טרייד'), 'meitav');
  });

  it('matches whole words only', () => {
    // "לאומי" is not inside "הבינלאומי".
    assert.equal(identifyInstitution('הבנק הבינלאומי הראשון'), 'fibi');
    assert.equal(identifyInstitution('ביטוח לאומי'), 'bank_leumi'); // a known limit: the word itself is Leumi's alias
    assert.equal(identifyInstitution('מסלול כללי'), null);
    assert.equal(identifyInstitution('מגדלור השקעות'), null);
  });

  it('a longer alias wins over a shorter one it contains', () => {
    assert.equal(identifyInstitution('בנק מרכנתיל דיסקונט בע"מ'), 'mercantile_discount');
    assert.equal(identifyInstitution('יהב אחים ואחיות - חברה לניהול קופות גמל'), 'yahav_nurses');
    assert.equal(identifyInstitution('בנק יהב לעובדי המדינה'), 'bank_yahav');
    assert.equal(identifyInstitution('מור מנורה מבטחים'), 'menora_mivtachim');
    assert.equal(identifyInstitution('מגדל מקפת אישית'), 'migdal');
    assert.equal(identifyInstitution('קרן מקפת'), 'makefet_old');
    assert.equal(identifyInstitution('הכשרה - אלטשולר שחם'), 'hachshara');
    assert.equal(identifyInstitution('קופת התגמולים של עובדי בנק לאומי'), 'leumi_employees');
    assert.equal(identifyInstitution('מנורה מבטחים והסתדרות המהנדסים ניהול קופות גמל'), 'omega');
  });

  it('two different companies in one text are ambiguous', () => {
    assert.equal(identifyInstitution('העברה מהראל למגדל'), null);
    assert.equal(identifyInstitution('Harel / Migdal'), null);
  });

  it('names no company → null; everyday words are not aliases', () => {
    for (const text of ['', null, undefined, 'אישור יתרות בנק', 'קופת גמל קטנה בע"מ', 'מחר אשלח', 'more details', 'גל של מסמכים']) {
      assert.equal(identifyInstitution(text), null, String(text));
    }
  });

  it('ignores niqqud, quotes, punctuation and invisible characters', () => {
    assert.equal(identifyInstitution('הַרְאֵל'), 'harel');
    assert.equal(identifyInstitution('"הראל", פנסיה‏ וגמל'), 'harel');
    assert.equal(identifyInstitution('עמ״י - חברה לניהול קופות גמל ענפיות'), 'ami');
  });
});

describe('compareCompanies / tieAllowedByCompany', () => {
  it('same, different and unidentified', () => {
    assert.equal(compareCompanies('Harel', 'קרן השתלמות בהראל').verdict, 'same');
    assert.equal(compareCompanies('Harel', 'קרן השתלמות באלטשולר שחם').verdict, 'different');
    assert.equal(compareCompanies(null, 'קרן השתלמות בהראל').verdict, 'file_unidentified');
    assert.equal(compareCompanies('Harel', 'קרן השתלמות').verdict, 'item_unidentified');
  });

  it('same always, different never, unidentified only on the client\'s words', () => {
    const verdict = (issuer: string | null, item: string) => compareCompanies(issuer, item);
    assert.equal(tieAllowedByCompany(verdict('Harel', 'בהראל'), false), true);
    assert.equal(tieAllowedByCompany(verdict('Harel', 'במגדל'), true), false);
    assert.equal(tieAllowedByCompany(verdict(null, 'בהראל'), false), false);
    assert.equal(tieAllowedByCompany(verdict(null, 'בהראל'), true), true);
  });
});

describe('institution-bound document types', () => {
  it('are exactly the six types a bank, fund manager or insurer always issues', () => {
    assert.deepEqual(
      CAPITAL_DOCUMENT_CATALOG.filter((t) => isInstitutionBound(t.key)).map((t) => t.key),
      ['bank_balance', 'securities_portfolio', 'pension_provident', 'study_fund', 'life_insurance_savings', 'mortgage_balance'],
    );
    assert.equal(isInstitutionBound('vehicle'), false);
    assert.equal(isInstitutionBound(null), false);
    assert.equal(isInstitutionBound('no_such_type'), false);
  });
});
