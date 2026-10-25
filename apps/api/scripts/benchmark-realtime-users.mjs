export function benchmarkViewerEmail(sourceEmail, index) {
  const separator = sourceEmail.indexOf('@');
  if (separator < 1 || separator === sourceEmail.length - 1) {
    throw new Error('BENCHMARK_EMAIL must be a valid email address');
  }
  const email = `${sourceEmail.slice(0, separator)}+benchmark-${index + 1}@${sourceEmail.slice(separator + 1)}`;
  if (email.length > 320) {
    throw new Error('Benchmark viewer email is too long');
  }
  return email;
}

export async function prepareBenchmarkViewers(database, sourceEmail, count) {
  const sourceAccount = await database.account.findFirst({
    select: { password: true },
    where: { providerId: 'credential', user: { email: sourceEmail } },
  });
  if (!sourceAccount?.password) {
    throw new Error('Benchmark source account must have a password');
  }

  const emails = Array.from({ length: count }, (_, index) =>
    benchmarkViewerEmail(sourceEmail, index),
  );
  await database.user.createMany({
    data: emails.map((email, index) => ({
      email,
      name: `Benchmark viewer ${index + 1}`,
      role: 'VIEWER',
    })),
    skipDuplicates: true,
  });
  const users = await database.user.findMany({
    select: { email: true, id: true },
    where: { email: { in: emails } },
  });
  if (users.length !== count) {
    throw new Error('Could not prepare all benchmark viewers');
  }
  await database.account.createMany({
    data: users.map((user) => ({
      accountId: user.id,
      password: sourceAccount.password,
      providerId: 'credential',
      userId: user.id,
    })),
    skipDuplicates: true,
  });
  await database.account.updateMany({
    data: { password: sourceAccount.password },
    where: {
      providerId: 'credential',
      userId: { in: users.map((user) => user.id) },
    },
  });
  return emails;
}
