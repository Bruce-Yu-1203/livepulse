'use client';

import {
  CreateReportResponseSchema,
  type ReportReason,
} from '@livepulse/contracts';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { clientApiRequest } from '../lib/client-api';

export const reportReasonOptions: ReadonlyArray<{
  label: string;
  value: ReportReason;
}> = [
  { label: 'Spam', value: 'SPAM' },
  { label: 'Harassment', value: 'HARASSMENT' },
  { label: 'Hate speech', value: 'HATE_SPEECH' },
  { label: 'Other', value: 'OTHER' },
];

export function MessageReportForm({
  messageId,
  roomId,
}: {
  messageId: string;
  roomId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [reported, setReported] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const details = String(data.get('details') ?? '').trim();
    const reason = String(data.get('reason') ?? 'OTHER');
    setPending(true);
    setError(undefined);

    try {
      await clientApiRequest('/api/v1/reports', CreateReportResponseSchema, {
        body: JSON.stringify({
          ...(details ? { details } : {}),
          messageId,
          reason,
          roomId,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      setReported(true);
      setExpanded(false);
    } catch {
      setError('The report could not be submitted. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (reported) {
    return (
      <p className="mt-2 text-xs font-medium text-emerald-300">Reported</p>
    );
  }

  if (!expanded) {
    return (
      <button
        className="mt-2 text-xs font-medium text-zinc-600 transition hover:text-amber-200"
        onClick={() => setExpanded(true)}
        type="button"
      >
        Report message
      </button>
    );
  }

  return (
    <form
      className="mt-3 space-y-2 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3"
      onSubmit={submit}
    >
      <label className="block text-xs font-semibold text-zinc-300">
        Reason
        <select
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-xs text-white outline-none focus:border-amber-300/50"
          defaultValue="SPAM"
          disabled={pending}
          name="reason"
        >
          {reportReasonOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-zinc-300">
        Details <span className="font-normal text-zinc-600">(optional)</span>
        <textarea
          className="mt-1.5 min-h-16 w-full resize-y rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-xs text-white outline-none placeholder:text-zinc-700 focus:border-amber-300/50"
          disabled={pending}
          maxLength={500}
          name="details"
          placeholder="Add context for the moderation team"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          className="rounded-lg bg-amber-200 px-3 py-1.5 text-xs font-bold text-zinc-950 transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? 'Submitting…' : 'Submit report'}
        </button>
        <button
          className="px-2 py-1.5 text-xs font-semibold text-zinc-500 transition hover:text-white disabled:opacity-50"
          disabled={pending}
          onClick={() => {
            setExpanded(false);
            setError(undefined);
          }}
          type="button"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="text-xs leading-5 text-rose-300" role="status">
          {error}
        </p>
      ) : null}
    </form>
  );
}
