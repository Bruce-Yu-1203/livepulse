export function readBrowserCookie(
  cookieSource: string,
  name: string,
): string | undefined {
  const prefix = `${encodeURIComponent(name)}=`;

  for (const part of cookieSource.split(';')) {
    const cookie = part.trim();

    if (cookie.startsWith(prefix)) {
      return decodeURIComponent(cookie.slice(prefix.length));
    }
  }

  return undefined;
}
