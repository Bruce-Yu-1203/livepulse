'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';

import {
  addSearchTerm,
  parseSearchHistory,
  removeSearchTerm,
  SEARCH_HISTORY_KEY,
} from '../lib/search-history';

function saveHistory(history: string[]) {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Storage can be unavailable in private mode; search still works.
  }
}

export function SiteSearch({ searchQuery = '' }: { searchQuery?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    try {
      setHistory(parseSearchHistory(localStorage.getItem(SEARCH_HISTORY_KEY)));
    } catch {
      setHistory([]);
    }
  }, []);

  const remember = (term: string) => {
    const next = addSearchTerm(history, term);
    setHistory(next);
    saveHistory(next);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const term = String(new FormData(event.currentTarget).get('q') ?? '');
    remember(term);
    setOpen(false);
  };

  // Reuse the native form submission so a recent search behaves like a typed one.
  const runSearch = (term: string) => {
    if (inputRef.current) {
      inputRef.current.value = term;
    }
    formRef.current?.requestSubmit();
  };

  const forget = (term: string) => {
    const next = removeSearchTerm(history, term);
    setHistory(next);
    saveHistory(next);
  };

  const showPanel = open && history.length > 0;

  return (
    <form
      action="/"
      className={`site-search ${showPanel ? 'site-search-open' : ''}`}
      method="get"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
      onSubmit={onSubmit}
      ref={formRef}
      role="search"
    >
      <div className="site-search-row">
        <label className="sr-only" htmlFor="site-search">
          Search rooms
        </label>
        <input
          autoComplete="off"
          defaultValue={searchQuery}
          id="site-search"
          maxLength={80}
          name="q"
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder="Search rooms"
          ref={inputRef}
          type="search"
        />
        <button
          aria-label="Search"
          className="site-search-submit"
          type="submit"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <path
              d="m20 20-4.2-4.2M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
          </svg>
        </button>
      </div>

      {showPanel ? (
        <ul aria-label="Recent searches" className="site-search-panel">
          {history.map((term) => (
            <li className="site-search-recent" key={term}>
              <button
                className="site-search-recent-term"
                onClick={() => runSearch(term)}
                type="button"
              >
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4.5H8M12 8v4.5l3 2"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                <span>{term}</span>
              </button>
              <button
                aria-label={`Remove ${term} from recent searches`}
                className="site-search-recent-remove"
                onClick={() => forget(term)}
                type="button"
              >
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path
                    d="m6 6 12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
