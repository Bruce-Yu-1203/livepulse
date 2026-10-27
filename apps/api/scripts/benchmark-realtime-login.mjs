export function bypassBenchmarkSignInIpLimit(limiter) {
  const consume = limiter.consume.bind(limiter);
  limiter.consume = (policyName, ip) =>
    policyName === 'signIn'
      ? Promise.resolve(undefined)
      : consume(policyName, ip);
}
