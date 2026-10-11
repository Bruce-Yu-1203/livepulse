'use client';

import {
  CurrentUserResponseSchema,
  ListReportsResponseSchema,
  type ModerationReport,
} from '@livepulse/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  removeModerationReport,
  reportReasonLabel,
} from '../../lib/admin-moderation';
import {
  ClientApiError,
  clientApiRequest,
  clientApiVoidRequest,
} from '../../lib/client-api';

type AdminState = 'forbidden' | 'loading' | 'ready' | 'signed-out';
type ModerationAction = 'delete' | 'dismiss';

export function AdminDashboard() {
  const [state, setState] = useState<AdminState>('loading');
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [pendingAction, setPendingAction] = useState<{
    reportId: string;
    type: ModerationAction;
  }>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    let active = true;

    void clientApiRequest('/api/v1/auth/me', CurrentUserResponseSchema)
      .then(async ({ user }) => {
        if (!active) {
          return;
        }

        if (user.role !== 'ADMIN') {
          setState('forbidden');
          return;
        }

        const response = await clientApiRequest(
          '/api/v1/reports',
          ListReportsResponseSchema,
        );
        if (active) {
          setReports(response.items);
          setState('ready');
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        if (error instanceof ClientApiError && error.status === 401) {
          setState('signed-out');
          return;
        }

        setNotice(
          error instanceof Error
            ? error.message
            : 'The moderation queue could not load.',
        );
        setState('ready');
      });

    return () => {
      active = false;
    };
  }, []);

  async function resolveReport(
    report: ModerationReport,
    type: ModerationAction,
  ) {
    setPendingAction({ reportId: report.id, type });
    setNotice(undefined);

    try {
      if (type === 'delete') {
        await clientApiVoidRequest(
          `/api/v1/rooms/${report.roomId}/messages/${report.messageId}`,
          { method: 'DELETE' },
        );
      } else {
        await clientApiVoidRequest(`/api/v1/reports/${report.id}`, {
          body: JSON.stringify({ status: 'DISMISSED' }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        });
      }
      setReports((current) => removeModerationReport(current, report.id));
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'The moderation action could not be completed.',
      );
    } finally {
      setPendingAction(undefined);
    }
  }

  if (state === 'loading') {
    return <AdminMessage title="Preparing the moderation queue…" />;
  }

  if (state === 'signed-out') {
    return (
      <AdminMessage
        actionHref="/auth"
        actionLabel="Sign in"
        title="Sign in with an administrator account."
      />
    );
  }

  if (state === 'forbidden') {
    return (
      <AdminMessage
        actionHref="/"
        actionLabel="Explore rooms"
        title="Administrator access is required."
      />
    );
  }

  return (
    <div>
      <section className="border-b border-white/8 pb-10">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-200">
          Trust and safety
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white sm:text-6xl">
          Moderation queue
        </h1>
        <p className="mt-4 max-w-2xl leading-7 text-zinc-400">
          Review reported messages, preserve an audit trail, and remove
          prohibited content from history and every connected room.
        </p>
      </section>

      {notice ? (
        <p
          className="mt-8 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-5 py-4 text-sm text-rose-200"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <section className="mt-10 space-y-5">
        {reports.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-white/10 px-6 py-16 text-center">
            <p className="text-lg font-semibold text-white">Queue cleared</p>
            <p className="mt-2 text-sm text-zinc-500">
              There are no pending message reports.
            </p>
          </div>
        ) : (
          reports.map((report) => (
            <article
              className="rounded-[2rem] border border-white/8 bg-white/[0.035] p-6"
              key={report.id}
            >
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <span className="rounded-full bg-amber-200/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-200">
                    {reportReasonLabel(report.reason)}
                  </span>
                  <p className="mt-3 text-xs text-zinc-600">
                    Reported {formatReportTime(report.createdAt)}
                  </p>
                </div>
                <Link
                  className="text-sm font-semibold text-cyan-300 transition hover:text-cyan-200"
                  href={`/rooms/${report.roomId}`}
                >
                  Open room
                </Link>
              </div>

              <blockquote className="mt-5 rounded-2xl border border-white/8 bg-black/25 px-5 py-4 text-sm leading-6 text-zinc-300">
                {report.message?.text ??
                  'The referenced message is unavailable.'}
              </blockquote>
              {report.details ? (
                <p className="mt-4 text-sm leading-6 text-zinc-400">
                  Reporter context: {report.details}
                </p>
              ) : null}

              <ModerationReportActions
                onDelete={() => void resolveReport(report, 'delete')}
                onDismiss={() => void resolveReport(report, 'dismiss')}
                pendingAction={
                  pendingAction?.reportId === report.id
                    ? pendingAction.type
                    : undefined
                }
                report={report}
              />
            </article>
          ))
        )}
      </section>
    </div>
  );
}

export function ModerationReportActions({
  onDelete,
  onDismiss,
  pendingAction,
  report,
}: {
  onDelete: () => void;
  onDismiss: () => void;
  pendingAction?: ModerationAction;
  report: ModerationReport;
}) {
  return (
    <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
      <button
        className="rounded-xl border border-white/12 px-4 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/25 hover:bg-white/6 disabled:cursor-wait disabled:opacity-45"
        disabled={Boolean(pendingAction)}
        onClick={onDismiss}
        type="button"
      >
        {pendingAction === 'dismiss' ? 'Dismissing…' : 'Keep message'}
      </button>
      <button
        className="rounded-xl bg-rose-300 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-rose-200 disabled:cursor-wait disabled:opacity-45"
        disabled={
          !report.message ||
          Boolean(report.message.deletedAt) ||
          Boolean(pendingAction)
        }
        onClick={onDelete}
        type="button"
      >
        {pendingAction === 'delete'
          ? 'Removing…'
          : report.message?.deletedAt
            ? 'Already removed'
            : 'Remove message'}
      </button>
    </div>
  );
}

function AdminMessage({
  actionHref,
  actionLabel,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  title: string;
}) {
  return (
    <div className="rounded-[2rem] border border-white/8 bg-white/[0.035] px-6 py-16 text-center">
      <p className="text-xl font-semibold text-white">{title}</p>
      {actionHref && actionLabel ? (
        <Link
          className="mt-6 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200"
          href={actionHref}
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function formatReportTime(createdAt: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(createdAt));
}
