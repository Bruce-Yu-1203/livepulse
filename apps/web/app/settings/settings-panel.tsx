'use client';

import { AvatarUploadResponseSchema } from '@livepulse/contracts';
import { useEffect, useState } from 'react';

import { AuthEntryLink } from '../../components/auth-dialog-provider';
import { AccountAvatar } from '../../components/auth-navigation';
import { useAuthSession } from '../../components/auth-session-provider';
import { displayNameFromEmail } from '../../lib/auth-session';
import { validateAvatarFile, fileToBase64 } from '../../lib/avatar-upload';
import { clientApiRequest } from '../../lib/client-api';

export function SettingsPanel() {
  const { session, refreshSession } = useAuthSession();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (session.status === 'loading') {
    return <p className="settings-hint">Loading settings…</p>;
  }

  if (session.status === 'anonymous') {
    return (
      <section className="settings-card">
        <h1>Settings</h1>
        <p>Sign in to update your profile photo.</p>
        <AuthEntryLink className="settings-submit">Sign in</AuthEntryLink>
      </section>
    );
  }

  const displayName =
    session.user.username ?? displayNameFromEmail(session.user.email);

  function chooseFile(selected: File | undefined) {
    setError(undefined);
    setSaved(false);
    if (!selected) return;
    const validationError = validateAvatarFile(selected);
    if (validationError) {
      setFile(null);
      setPreviewUrl(null);
      setError(validationError);
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function saveAvatar() {
    if (!file || saving) return;
    setSaving(true);
    setError(undefined);
    setSaved(false);
    try {
      const data = await fileToBase64(file);
      await clientApiRequest(
        '/api/v1/users/me/avatar',
        AvatarUploadResponseSchema,
        {
          body: JSON.stringify({ contentType: file.type, data }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
      await refreshSession();
      setFile(null);
      setPreviewUrl(null);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Avatar upload failed.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="settings-heading">
        <p>YOUR ACCOUNT</p>
        <h1>Settings</h1>
        <span>Make your profile feel like yours.</span>
      </div>
      <section aria-labelledby="avatar-heading" className="settings-card">
        <div className="settings-card-heading">
          <div>
            <h2 id="avatar-heading">Profile photo</h2>
            <p>Shown next to your name throughout LivePulse.</p>
          </div>
        </div>
        <div className="settings-avatar-row">
          <AccountAvatar
            email={session.user.email}
            name={displayName}
            url={previewUrl ?? session.user.avatarUrl}
          />
          <div>
            <strong>{displayName}</strong>
            <span>{session.user.email}</span>
          </div>
        </div>
        <div className="settings-avatar-actions">
          <label className="settings-file-button" htmlFor="avatar-file">
            Choose image
          </label>
          <input
            accept="image/jpeg,image/png,image/webp"
            id="avatar-file"
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
              event.target.value = '';
            }}
            type="file"
          />
          <span>{file ? file.name : 'JPEG, PNG, or WebP · Max 2 MB'}</span>
        </div>
        <button
          className="settings-submit"
          disabled={!file || saving}
          onClick={() => void saveAvatar()}
          type="button"
        >
          {saving ? 'Saving…' : 'Save photo'}
        </button>
        {error ? (
          <p className="settings-error" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="settings-success" role="status">
            Photo updated.
          </p>
        ) : null}
      </section>
    </>
  );
}
