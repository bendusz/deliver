import crypto from 'node:crypto';

// Feature flags: { name, enabled, rolloutPercent, allowUsers }.
// bucketOf(flagName, userId): a stable bucket from 0 to 99 for this user and flag.
export function bucketOf(flagName, userId) {
  const digest = crypto.createHash('sha256').update(`${flagName}:${userId}`).digest();
  return digest.readUInt32BE(0) % 100;
}
