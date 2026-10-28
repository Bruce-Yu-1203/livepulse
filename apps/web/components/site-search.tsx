'use client';

import { SearchSuggestionsResponseSchema } from '@livepulse/contracts';
import type { SearchSuggestionsResponse } from '@livepulse/contracts';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { clientApiRequest } from '../lib/client-api';
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
  const [query, setQuery] = useState(searchQuery);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestionsResponse>();
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    try {
      setHistory(parseSearchHistory(localStorage.getItem(SEARCH_HISTORY_KEY)));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    const term = query.trim().replace(/\s+/gu, ' ');
    if (!open || !term) {
      setLoading(false);
      setSuggestions(undefined);
      setSearchError(false);
      return;
    }

    const abort = new AbortController();
    setLoading(true);
    setSearchError(false);
    const timer = window.setTimeout(() => {
      void clientApiRequest(
        `/api/v1/search?q=${encodeURIComponent(term)}&limit=6`,
        SearchSuggestionsResponseSchema,
        { signal: abort.signal },
      )
        .then((response) => {
          setSuggestions(response);
          setSearchError(false);
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          setSuggestions(undefined);
          setSearchError(true);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 220);

    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [open, query]);

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

  const runSearch = (term: string) => {
    setQuery(term);
    if (inputRef.current) inputRef.current.value = term;
    formRef.current?.requestSubmit();
  };

  const forget = (term: string) => {
    const next = removeSearchTerm(history, term);
    setHistory(next);
    saveHistory(next);
  };

  const term = query.trim();
  const showPanel = open && (Boolean(term) || history.length > 0);
  const hasMatches = Boolean(
    suggestions && (suggestions.users.length || suggestions.rooms.length),
  );

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
          Search users and rooms
        </label>
        <input
          aria-controls={showPanel ? 'site-search-panel' : undefined}
          aria-expanded={showPanel}
          autoComplete="off"
          id="site-search"
          maxLength={80}
          name="q"
          onChange={(event) => {
            setQuery(event.target.value);
            setSuggestions(undefined);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder="Search users and rooms"
          ref={inputRef}
          type="search"
          value={query}
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
        <div className="site-search-panel" id="site-search-panel">
          {term ? (
            <>
              {loading ? (
                <p className="site-search-state" role="status">
                  Searching…
                </p>
              ) : searchError ? (
                <p
                  className="site-search-state site-search-state-error"
                  role="status"
                >
                  Search is temporarily unavailable.
                </p>
              ) : hasMatches ? (
                <>
                  {suggestions?.users.length ? (
                    <div>
                      <p className="site-search-group-title">Users</p>
                      <ul aria-label="Matching users">
                        {suggestions.users.map((user) => (
                          <li key={user.id}>
                            <Link
                              className="site-search-result"
                              href={`/users/${user.id}`}
                              onClick={() => {
                                remember(term);
                                setOpen(false);
                              }}
                            >
                              <span
                                aria-hidden="true"
                                className="site-search-avatar"
                              >
                                {user.avatarUrl ? (
                                  <img
                                    alt=""
                                    decoding="async"
                                    height={44}
                                    loading="lazy"
                                    src={user.avatarUrl}
                                    width={44}
                                  />
                                ) : (
                                  user.name.charAt(0).toUpperCase()
                                )}
                              </span>
                              <span className="site-search-result-copy">
                                <strong>{user.name}</strong>
                                <small>
                                  {user.username ? `@${user.username}` : 'User'}
                                </small>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {suggestions?.rooms.length ? (
                    <div>
                      <p className="site-search-group-title">Rooms</p>
                      <ul aria-label="Matching rooms">
                        {suggestions.rooms.map((room) => (
                          <li key={room.id}>
                            <Link
                              className="site-search-result"
                              href={`/rooms/${room.id}`}
                              onClick={() => {
                                remember(term);
                                setOpen(false);
                              }}
                            >
                              <span
                                aria-hidden="true"
                                className="site-search-room-mark"
                              >
                                ◉
                              </span>
                              <span className="site-search-result-copy">
                                <strong>{room.title}</strong>
                                <small>
                                  {room.status === 'LIVE'
                                    ? 'Live now'
                                    : 'Ended'}
                                </small>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : suggestions ? (
                <p className="site-search-state">No users or rooms found.</p>
              ) : null}
              <Link
                className="site-search-all"
                href={{ pathname: '/', query: { q: term } }}
                onClick={() => {
                  remember(term);
                  setOpen(false);
                }}
              >
                See search results for “{term}”
              </Link>
            </>
          ) : (
            <>
              <p className="site-search-group-title">Recent searches</p>
              <ul aria-label="Recent searches">
                {history.map((item) => (
                  <li className="site-search-recent" key={item}>
                    <button
                      className="site-search-recent-term"
                      onClick={() => runSearch(item)}
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
                      <span>{item}</span>
                    </button>
                    <button
                      aria-label={`Remove ${item} from recent searches`}
                      className="site-search-recent-remove"
                      onClick={() => forget(item)}
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
            </>
          )}
        </div>
      ) : null}
    </form>
  );
}
