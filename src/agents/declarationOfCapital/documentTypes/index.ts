import bankBalance from './bankBalance.js';
import businessOwnership from './businessOwnership.js';
import contentsInsurance from './contentsInsurance.js';
import crypto from './crypto.js';
import generic from './generic.js';
import lifeInsuranceSavings from './lifeInsuranceSavings.js';
import loanGiven from './loanGiven.js';
import loanTaken from './loanTaken.js';
import mortgageBalance from './mortgageBalance.js';
import otherAssets from './otherAssets.js';
import pensionProvident from './pensionProvident.js';
import poaAccount from './poaAccount.js';
import priorDeclaration from './priorDeclaration.js';
import privateInvestment from './privateInvestment.js';
import realEstate from './realEstate.js';
import securitiesPortfolio from './securitiesPortfolio.js';
import studyFund from './studyFund.js';
import vehicle from './vehicle.js';
import type { DocumentTypeSpec } from './types.js';

export type { DocumentTypeSpec, FieldKind, TypeField } from './types.js';

/**
 * The registry of document-type modules (openspec `document-extraction`): one
 * per catalog type, in catalog order. The registry test asserts the two key
 * sets are equal. `generic` (below) is not a catalog type and is not listed.
 */
export const DOCUMENT_TYPES: readonly DocumentTypeSpec[] = [
  bankBalance,
  securitiesPortfolio,
  pensionProvident,
  studyFund,
  lifeInsuranceSavings,
  realEstate,
  mortgageBalance,
  loanTaken,
  loanGiven,
  vehicle,
  contentsInsurance,
  businessOwnership,
  crypto,
  privateInvestment,
  poaAccount,
  priorDeclaration,
  otherAssets,
];

/** The contract for rows without a catalog type (type_key NULL or unknown): common fields, generic checks. */
export const GENERIC_DOCUMENT_TYPE: DocumentTypeSpec = generic;

const BY_KEY = new Map(DOCUMENT_TYPES.map((t) => [t.key, t]));

/** The module of a checklist row's type key; the generic one for an ad-hoc row or an unknown key. */
export function documentTypeSpec(typeKey: string | null | undefined): DocumentTypeSpec {
  return (typeKey ? BY_KEY.get(typeKey) : undefined) ?? GENERIC_DOCUMENT_TYPE;
}
