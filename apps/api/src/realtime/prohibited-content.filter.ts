import { Injectable } from '@nestjs/common';

const defaultProhibitedTerms = ['scam-offer', 'spam-link'];

@Injectable()
export class ProhibitedContentFilter {
  private readonly terms = resolveProhibitedTerms(process.env.PROHIBITED_WORDS);

  public blocks(text: string): boolean {
    const normalizedText = normalizeContent(text);
    return this.terms.some((term) => normalizedText.includes(term));
  }
}

export function resolveProhibitedTerms(value: string | undefined): string[] {
  const configured =
    value === undefined ? defaultProhibitedTerms : value.split(',');

  return [
    ...new Set(
      configured
        .map((term) => normalizeContent(term))
        .filter((term) => term.length > 0),
    ),
  ];
}

function normalizeContent(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/\s+/gu, ' ')
    .trim();
}
