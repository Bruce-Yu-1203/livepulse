import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const algorithm = 'scrypt';
const currentVersion = 'v1';
const keyLength = 64;
const saltLength = 16;
const maxMemory = 32 * 1024 * 1024;

interface ScryptProfile {
  blockSize: number;
  cost: number;
  parallelization: number;
}

const profiles: Record<string, ScryptProfile> = {
  v1: {
    blockSize: 8,
    cost: 16_384,
    parallelization: 5,
  },
};

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, encodedHash: string): Promise<boolean>;
}

export class ScryptPasswordHasher implements PasswordHasher {
  public async hash(password: string): Promise<string> {
    const salt = randomBytes(saltLength);
    const profile = profiles[currentVersion];

    if (!profile) {
      throw new Error('The current password-hash profile is not configured');
    }

    const derivedKey = await deriveKey(password, salt, profile);

    return [
      algorithm,
      currentVersion,
      profile.cost,
      profile.blockSize,
      profile.parallelization,
      salt.toString('hex'),
      derivedKey.toString('hex'),
    ].join('$');
  }

  public async verify(password: string, encodedHash: string): Promise<boolean> {
    const parts = encodedHash.split('$');
    if (parts.length !== 7) {
      return false;
    }

    const [
      storedAlgorithm,
      storedVersion,
      storedCost,
      storedBlockSize,
      storedParallelization,
      saltHex,
      keyHex,
    ] = parts;
    const profile = storedVersion ? profiles[storedVersion] : undefined;

    if (
      storedAlgorithm !== algorithm ||
      !profile ||
      Number(storedCost) !== profile.cost ||
      Number(storedBlockSize) !== profile.blockSize ||
      Number(storedParallelization) !== profile.parallelization ||
      !isHexOfByteLength(saltHex, saltLength) ||
      !isHexOfByteLength(keyHex, keyLength)
    ) {
      return false;
    }

    const storedKey = Buffer.from(keyHex, 'hex');
    const derivedKey = await deriveKey(
      password,
      Buffer.from(saltHex, 'hex'),
      profile,
    );

    return timingSafeEqual(storedKey, derivedKey);
  }
}

function deriveKey(
  password: string,
  salt: Buffer,
  profile: ScryptProfile,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      {
        N: profile.cost,
        maxmem: maxMemory,
        p: profile.parallelization,
        r: profile.blockSize,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

function isHexOfByteLength(
  value: string | undefined,
  bytes: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.length === bytes * 2 &&
    /^[0-9a-f]+$/i.test(value)
  );
}
