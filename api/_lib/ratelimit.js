'use strict';

function evictLeastRecentlyUsed(buckets) {
  let oldestKey = null;
  let oldestAccess = Infinity;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.lastAccess < oldestAccess) {
      oldestAccess = bucket.lastAccess;
      oldestKey = key;
    }
  }
  if (oldestKey !== null) {
    buckets.delete(oldestKey);
  }
}

function createTokenBucketLimiter({
  capacity = 60,
  refillPerSec = 1,
  maxKeys = 100,
  nowFn = Date.now
} = {}) {
  const buckets = new Map();
  const safeCapacity = Math.max(1, Number(capacity) || 1);
  const safeRefillPerSec = Math.max(0, Number(refillPerSec) || 0);
  const safeMaxKeys = Math.max(1, Number(maxKeys) || 1);

  function getBucket(key, now) {
    const existing = buckets.get(key);
    if (existing) return existing;

    if (buckets.size >= safeMaxKeys) {
      evictLeastRecentlyUsed(buckets);
    }

    const bucket = {
      tokens: safeCapacity,
      lastRefill: now,
      lastAccess: now
    };
    buckets.set(key, bucket);
    return bucket;
  }

  function refill(bucket, now) {
    const elapsedMs = Math.max(0, now - bucket.lastRefill);
    if (elapsedMs <= 0 || safeRefillPerSec <= 0) return;
    const refillAmount = (elapsedMs / 1000) * safeRefillPerSec;
    bucket.tokens = Math.min(safeCapacity, bucket.tokens + refillAmount);
    bucket.lastRefill = now;
  }

  return {
    check(key) {
      const safeKey = String(key || 'unknown');
      const now = Number(nowFn());
      const bucket = getBucket(safeKey, now);
      refill(bucket, now);
      bucket.lastAccess = now;

      if (bucket.tokens < 1) {
        const needed = 1 - bucket.tokens;
        const retryAfterSec = safeRefillPerSec > 0
          ? Math.max(1, Math.ceil(needed / safeRefillPerSec))
          : 60;
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec
        };
      }

      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        retryAfterSec: 0
      };
    },

    size() {
      return buckets.size;
    }
  };
}

module.exports = {
  createTokenBucketLimiter
};
