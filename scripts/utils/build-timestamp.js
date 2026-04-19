'use strict';

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getBuildTimestampIso() {
  const fromEnv = toIso(process.env.FIT_BUILD_TIMESTAMP);
  if (fromEnv) return fromEnv;
  const day = new Date().toISOString().slice(0, 10);
  return `${day}T00:00:00.000Z`;
}

function getBuildDate() {
  return getBuildTimestampIso().slice(0, 10);
}

function getBuildDateObject() {
  return new Date(getBuildTimestampIso());
}

module.exports = {
  getBuildTimestampIso,
  getBuildDate,
  getBuildDateObject
};
