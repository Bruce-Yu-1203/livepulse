import { URL } from 'node:url';

export function secondLocalApiOrigin(firstOrigin, secondOrigin) {
  let url;
  try {
    url = new URL(secondOrigin);
  } catch {
    throw new Error(
      'BENCHMARK_SECOND_API_ORIGIN must be a distinct local HTTP origin with a port',
    );
  }
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !url.port ||
    secondOrigin === firstOrigin
  ) {
    throw new Error(
      'BENCHMARK_SECOND_API_ORIGIN must be a distinct local HTTP origin with a port',
    );
  }
  return secondOrigin;
}
