import {
  closeSync, constants, fchmodSync, fstatSync, fsyncSync, linkSync, lstatSync,
  openSync, readFileSync, realpathSync, unlinkSync, writeSync,
} from 'node:fs';
import path from 'node:path';

export class OfflineSecureIoError extends Error {
  constructor(code, message) { super(message); this.name = 'OfflineSecureIoError'; this.code = code; }
}

const fail = (code, message) => { throw new OfflineSecureIoError(code, message); };

function rejectSymlinkAncestors(absolutePath) {
  const root = path.parse(absolutePath).root;
  let current = root;
  const parts = absolutePath.slice(root.length).split(path.sep).filter(Boolean);
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('UNSAFE_PATH', 'Path ancestors must be real directories');
  }
}

function sameStat(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.nlink === b.nlink && a.size === b.size
    && a.uid === b.uid && a.gid === b.gid && a.mode === b.mode
    && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

function sameParent(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.uid === b.uid
    && (a.mode & 0o777) === (b.mode & 0o777) && b.isDirectory() && !b.isSymbolicLink();
}

export function assertPrivateOutputAbsent(outputPath) {
  const absolute = path.resolve(outputPath);
  rejectSymlinkAncestors(absolute);
  const parent = path.dirname(absolute);
  const before = lstatSync(parent);
  const ownerId = typeof process.getuid === 'function' ? process.getuid() : before.uid;
  if (!before.isDirectory() || before.isSymbolicLink() || before.uid !== ownerId
    || (before.mode & 0o077) !== 0) {
    fail('UNSAFE_OUTPUT_PARENT', 'Output parent must be owner-only');
  }
  try { lstatSync(absolute); fail('OUTPUT_EXISTS', 'Output must not already exist'); } catch (error) {
    if (error instanceof OfflineSecureIoError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
  if (realpathSync(parent) !== parent) fail('UNSAFE_OUTPUT_PARENT', 'Output parent must be canonical');
  return { absolute, parent, parentStat: before };
}

export function readPrivateStableFile(inputPath) {
  return readStableFile(inputPath, {
    allowedModes: [0o600], code: 'PRIVATE_KEY_FILE_INVALID', requireOwner: true,
    requirePrivateParent: true,
  });
}

export function readStableFile(inputPath, {
  allowedModes = [0o400, 0o444, 0o600, 0o644],
  code = 'INPUT_FILE_INVALID',
  requireOwner = false,
  requirePrivateParent = false,
} = {}) {
  const absolute = path.resolve(inputPath);
  rejectSymlinkAncestors(absolute);
  const parent = path.dirname(absolute);
  const parentBefore = lstatSync(parent);
  const ownerId = typeof process.getuid === 'function' ? process.getuid() : parentBefore.uid;
  if (!parentBefore.isDirectory() || parentBefore.isSymbolicLink()
    || (requirePrivateParent && (parentBefore.uid !== ownerId || (parentBefore.mode & 0o077) !== 0))) {
    fail(requirePrivateParent ? 'PRIVATE_KEY_PARENT_INVALID' : code, 'Input parent is not a stable private directory');
  }
  if (realpathSync(parent) !== parent) fail(code, 'Input parent must be canonical');
  const parentFd = openSync(
    parent,
    constants.O_RDONLY | constants.O_DIRECTORY | (constants.O_NOFOLLOW ?? 0),
  );
  let before;
  let fd;
  try {
    before = lstatSync(absolute);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1
      || (requireOwner && before.uid !== ownerId)
      || !allowedModes.includes(before.mode & 0o777)) {
      fail(code, 'Input must be a single-link regular file with an allowed mode');
    }
    if (!sameParent(parentBefore, fstatSync(parentFd))) fail(`${code}_CHANGED`, 'Input parent changed before read');
    fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd);
    if (!sameStat(before, opened)) fail(`${code}_CHANGED`, 'Input changed before read');
    const bytes = readFileSync(fd);
    if (!sameStat(opened, fstatSync(fd)) || !sameStat(before, lstatSync(absolute))
      || !sameParent(parentBefore, fstatSync(parentFd))
      || !sameParent(parentBefore, lstatSync(parent))) {
      fail(`${code}_CHANGED`, 'Input changed during read');
    }
    return bytes;
  } finally {
    if (fd !== undefined) closeSync(fd);
    closeSync(parentFd);
  }
}

export function writeAtomicPrivateNoClobber(outputPath, bytes, {
  beforeCommit = () => {},
  io = {},
} = {}) {
  const ops = {
    closeSync, fchmodSync, fstatSync, fsyncSync, linkSync, lstatSync, openSync, unlinkSync, writeSync,
    ...io,
  };
  const checked = assertPrivateOutputAbsent(outputPath);
  const temp = path.join(checked.parent, `.${path.basename(checked.absolute)}.${process.pid}.${Date.now()}.tmp`);
  let fd;
  let parentFd;
  let linked = false;
  let tempIdentity;
  try {
    parentFd = ops.openSync(
      checked.parent,
      constants.O_RDONLY | constants.O_DIRECTORY | (constants.O_NOFOLLOW ?? 0),
    );
    if (!sameParent(checked.parentStat, ops.fstatSync(parentFd))) {
      fail('OUTPUT_PARENT_CHANGED', 'Output parent changed during open');
    }
    fd = ops.openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    ops.fchmodSync(fd, 0o600);
    tempIdentity = ops.fstatSync(fd);
    if (!tempIdentity.isFile() || tempIdentity.nlink !== 1 || (tempIdentity.mode & 0o777) !== 0o600) {
      fail('OUTPUT_TEMP_INVALID', 'Temporary output inode is invalid');
    }
    let offset = 0;
    while (offset < bytes.length) {
      const written = ops.writeSync(fd, bytes, offset, bytes.length - offset);
      if (!Number.isSafeInteger(written) || written <= 0) fail('OUTPUT_WRITE_FAILED', 'Output write made no progress');
      offset += written;
    }
    ops.fsyncSync(fd);
    beforeCommit();
    const parentNow = ops.lstatSync(checked.parent);
    if (!sameParent(checked.parentStat, parentNow)
      || !sameParent(checked.parentStat, ops.fstatSync(parentFd))) {
      fail('OUTPUT_PARENT_CHANGED', 'Output parent changed before commit');
    }
    const tempNow = ops.lstatSync(temp);
    if (tempNow.dev !== tempIdentity.dev || tempNow.ino !== tempIdentity.ino
      || !tempNow.isFile() || tempNow.nlink !== 1 || tempNow.size !== bytes.length
      || (tempNow.mode & 0o777) !== 0o600) {
      fail('OUTPUT_TEMP_CHANGED', 'Temporary output inode changed before commit');
    }
    ops.linkSync(temp, checked.absolute);
    linked = true;
    const finalStat = ops.lstatSync(checked.absolute);
    const linkedTempStat = ops.lstatSync(temp);
    if (finalStat.dev !== tempIdentity.dev || finalStat.ino !== tempIdentity.ino
      || linkedTempStat.dev !== tempIdentity.dev || linkedTempStat.ino !== tempIdentity.ino
      || finalStat.nlink !== 2 || linkedTempStat.nlink !== 2) {
      fail('OUTPUT_LINK_INVALID', 'Committed output does not reference the prepared inode');
    }
    ops.fsyncSync(parentFd);
    ops.unlinkSync(temp);
    ops.fsyncSync(parentFd);
    return 'CREATED';
  } catch (error) {
    if (error?.code === 'EEXIST') fail('OUTPUT_EXISTS', 'Output must not already exist');
    throw error;
  } finally {
    if (fd !== undefined) ops.closeSync(fd);
    try {
      const cleanupStat = ops.lstatSync(temp);
      if (tempIdentity && cleanupStat.dev === tempIdentity.dev && cleanupStat.ino === tempIdentity.ino) {
        ops.unlinkSync(temp);
      }
    } catch {}
    if (parentFd !== undefined) ops.closeSync(parentFd);
    if (linked) {
      // The final inode is never removed here; publication either succeeded or remains recoverable.
    }
  }
}
