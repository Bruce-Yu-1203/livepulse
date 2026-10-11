'use client';

import {
  type AuditLog,
  CurrentUserResponseSchema,
  ListAuditLogsResponseSchema,
  ListReportsResponseSchema,
  type ModerationReport,
} from '@livepulse/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  auditActionLabel,
  mergeAuditLogs,
  mergeModerationReports,
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
  const [nextCursor, setNextCursor] = useState<string | null>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditNextCursor, setAuditNextCursor] = useState<string | null>();
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
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

        const [response, auditResponse] = await Promise.all([
          clientApiRequest('/api/v1/reports', ListReportsResponseSchema),
          clientApiRequest('/api/v1/audit-logs', ListAuditLogsResponseSchema),
        ]);
        if (active) {
          setReports(response.items);
          setNextCursor(response.nextCursor);
          setAuditLogs(auditResponse.items);
          setAuditNextCursor(auditResponse.nextCursor);
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

  async function loadMoreReports() {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setNotice(undefined);

    try {
      const query = new URLSearchParams({ cursor: nextCursor, limit: '20' });
      const response = await clientApiRequest(
        `/api/v1/reports?${query.toString()}`,
        ListReportsResponseSchema,
      );
      setReports((current) => mergeModerationReports(current, response.items));
      setNextCursor(response.nextCursor);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'More reports could not be loaded.',
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMoreAuditLogs() {
    if (!auditNextCursor || auditLoadingMore) {
      return;
    }

    setAuditLoadingMore(true);
    setNotice(undefined);

    try {
      const query = new URLSearchParams({
        cursor: auditNextCursor,
        limit: '20',
      });
      const response = await clientApiRequest(
        `/api/v1/audit-logs?${query.toString()}`,
        ListAuditLogsResponseSchema,
      );
      setAuditLogs((current) => mergeAuditLogs(current, response.items));
      setAuditNextCursor(response.nextCursor);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'More audit history could not be loaded.',
      );
    } finally {
      setAuditLoadingMore(false);
    }
  }

  async function refreshAuditLogs() {
    const response = await clientApiRequest(
      '/api/v1/audit-logs',
      ListAuditLogsResponseSchema,
    );
    setAuditLogs(response.items);
    setAuditNextCursor(response.nextCursor);
  }

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
      try {
        await refreshAuditLogs();
      } catch {
        setNotice(
          'The action succeeded, but the audit history did not refresh.',
        );
      }
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
              {nextCursor
                ? 'This batch is complete. Load the next reports to continue.'
                : 'There are no pending message reports.'}
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
        <ModerationQueuePagination
          hasNextPage={Boolean(nextCursor)}
          loading={loadingMore}
          onLoad={() => void loadMoreReports()}
        />
      </section>

      <section className="mt-16 border-t border-white/8 pt-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">
          Accountability
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
          Recent audit history
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
          Newest first. Each entry records the actor, target, room, and server
          time for a moderation event.
        </p>
        <AuditTrail logs={auditLogs} />
        <AuditHistoryPagination
          hasNextPage={Boolean(auditNextCursor)}
          loading={auditLoadingMore}
          onLoad={() => void loadMoreAuditLogs()}
        />
      </section>
    </div>
  );
}

export function AuditTrail({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-zinc-500">
        No moderation activity has been recorded yet.
      </p>
    );
  }

  return (
    <ol className="mt-6 space-y-3">
      {logs.map((log) => (
        <li
          className="rounded-2xl border border-white/8 bg-white/[0.025] px-5 py-4"
          key={log.id}
        >
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <p className="font-semibold text-zinc-200">
              {auditActionLabel(log.action)}
            </p>
            <time className="text-xs text-zinc-600" dateTime={log.createdAt}>
              {formatReportTime(log.createdAt)}
            </time>
          </div>
          <p className="mt-2 break-all text-xs leading-5 text-zinc-500">
            Actor {log.actorId} · Target {log.targetId}
          </p>
          {log.roomId ? (
            <Link
              className="mt-2 inline-flex text-xs font-semibold text-cyan-300 transition hover:text-cyan-200"
              href={`/rooms/${log.roomId}`}
            >
              Open related room
            </Link>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function AuditHistoryPagination({
  hasNextPage,
  loading,
  onLoad,
}: {
  hasNextPage: boolean;
  loading: boolean;
  onLoad: () => void;
}) {
  if (!hasNextPage) {
    return null;
  }

  return (
    <button
      className="mx-auto mt-6 block rounded-full border border-white/12 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-cyan-300/40 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-50"
      disabled={loading}
      onClick={onLoad}
      type="button"
    >
      {loading ? 'Loading…' : 'Load more activity'}
    </button>
  );
}

export function ModerationQueuePagination({
  hasNextPage,
  loading,
  onLoad,
}: {
  hasNextPage: boolean;
  loading: boolean;
  onLoad: () => void;
}) {
  if (!hasNextPage) {
    return null;
  }

  return (
    <button
      className="mx-auto block rounded-full border border-white/12 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-cyan-300/40 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-50"
      disabled={loading}
      onClick={onLoad}
      type="button"
    >
      {loading ? 'Loading…' : 'Load more reports'}
    </button>
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
