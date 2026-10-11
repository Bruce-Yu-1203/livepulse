import { afterEach, describe, expect, it } from 'vitest';

import {
  ProhibitedContentFilter,
  resolveProhibitedTerms,
} from './prohibited-content.filter.js';

const originalProhibitedWords = process.env.PROHIBITED_WORDS;

afterEach(() => {
  if (originalProhibitedWords === undefined) {
    delete process.env.PROHIBITED_WORDS;
  } else {
    process.env.PROHIBITED_WORDS = originalProhibitedWords;
  }
});

describe('ProhibitedContentFilter', () => {
  it('matches configured terms case-insensitively after Unicode normalization', () => {
    process.env.PROHIBITED_WORDS = 'Scam Offer,ＦＲＥＥ money';
    const filter = new ProhibitedContentFilter();

    expect(filter.blocks('This is a SCAM   OFFER')).toBe(true);
    expect(filter.blocks('Claim free money now')).toBe(true);
    expect(filter.blocks('A normal room message')).toBe(false);
  });

  it('uses safe demo defaults and allows an explicit empty configuration', () => {
    expect(resolveProhibitedTerms(undefined)).toEqual([
      'scam-offer',
      'spam-link',
    ]);
    expect(resolveProhibitedTerms('')).toEqual([]);
  });

  it('removes duplicate and blank configured terms', () => {
    expect(
      resolveProhibitedTerms(' spam-link,SPAM-LINK, , scam-offer '),
    ).toEqual(['spam-link', 'scam-offer']);
  });
});
