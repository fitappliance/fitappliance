import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const ROOT = process.cwd();
const CHECKER_PATH = join(ROOT, 'scripts', 'architecture-v3', 'check-v3-syntax.mjs');
const CHECKER_URL = pathToFileURL(CHECKER_PATH).href;
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const DEFAULT_DISCOVERY_MARKER = 'FITAPPLIANCE_G0B_DISCOVERY_MARKER';
const DEFAULT_DISCOVERY_TEST_NAME = 'G0b contract: default npm test runs the V3 discovery witness';

async function execute(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFile(command, args, {
      maxBuffer: 20 * 1024 * 1024,
      ...options,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: typeof error.code === 'number' ? error.code : 1,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? ''),
    };
  }
}

async function createSyntaxFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-g0b-syntax-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = join(root, 'first valid.mjs');
  const second = join(root, 'second invalid.mjs');
  const missing = join(root, 'missing explicit.mjs');
  const nonMjs = join(root, 'not-a-module.txt');
  await writeFile(first, 'export const first = true;\n');
  await writeFile(second, 'export const second = ;\n');
  await writeFile(nonMjs, 'not a module\n');
  return { first, second, missing, nonMjs };
}

async function invokeCheckV3Syntax(explicitMjsPaths, options = {}) {
  const program = [
    `import { checkV3Syntax } from ${JSON.stringify(CHECKER_URL)};`,
    `const result = await checkV3Syntax({ explicitMjsPaths: JSON.parse(process.env.FITAPPLIANCE_G0B_EXPLICIT_PATHS) });`,
    'process.stdout.write(JSON.stringify(result));',
  ].join('\n');
  return execute(process.execPath, ['--input-type=module', '--eval', program], {
    ...options,
    env: {
      ...process.env,
      ...options.env,
      FITAPPLIANCE_G0B_EXPLICIT_PATHS: JSON.stringify(explicitMjsPaths),
    },
  });
}

async function invokeCli(args, options = {}) {
  return execute(process.execPath, [CHECKER_PATH, ...args], options);
}

function parseSuccessfulApiResult(execution) {
  assert.equal(execution.code, 0, `API harness must complete: ${execution.stderr}`);
  return JSON.parse(execution.stdout);
}

test(DEFAULT_DISCOVERY_TEST_NAME, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-g0b-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const marker = join(root, 'v3-test-ran.txt');
  const fixturePackage = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const fixtureRunner = await readFile(CHECKER_PATH, 'utf8');
  const fixtureTest = [
    "import { writeFile } from 'node:fs/promises';",
    "import test from 'node:test';",
    "test('fixture V3 default-test witness', async () => {",
    `  await writeFile(process.env.${DEFAULT_DISCOVERY_MARKER}, 'V3 test executed by npm test\\n');`,
    '});',
  ].join('\n');
  const placeholderTest = [
    "import test from 'node:test';",
    "test('fixture placeholder', () => {});",
  ].join('\n');
  await Promise.all([
    mkdir(join(root, 'scripts', 'architecture-v3'), { recursive: true }),
    mkdir(join(root, 'tests', 'pdf-pipeline'), { recursive: true }),
    mkdir(join(root, 'tests', 'architecture-v2'), { recursive: true }),
    mkdir(join(root, 'tests', 'architecture-v3'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, 'package.json'), JSON.stringify({ private: true, scripts: { test: fixturePackage.scripts.test } })),
    writeFile(join(root, 'scripts', 'architecture-v3', 'check-v3-syntax.mjs'), fixtureRunner),
    writeFile(join(root, 'tests', 'root-placeholder.test.mjs'), placeholderTest),
    writeFile(join(root, 'tests', 'pdf-pipeline', 'placeholder.test.mjs'), placeholderTest),
    writeFile(join(root, 'tests', 'architecture-v2', 'placeholder.test.mjs'), placeholderTest),
    writeFile(join(root, 'tests', 'architecture-v3', 'discovery-witness.test.mjs'), fixtureTest),
  ]);
  const fixtureEnvironment = { ...process.env };
  delete fixtureEnvironment.NODE_TEST_CONTEXT;
  const execution = await execute(NPM, ['test'], {
    cwd: root,
    env: { ...fixtureEnvironment, [DEFAULT_DISCOVERY_MARKER]: marker },
  });

  assert.equal(execution.code, 0, `default npm test must remain runnable: ${execution.stderr}`);
  const markerContents = await readFile(marker, 'utf8').catch((error) => (
    error.code === 'ENOENT' ? null : Promise.reject(error)
  ));
  assert.equal(
    markerContents,
    'V3 test executed by npm test\n',
    `default npm test must execute a real V3 test: ${execution.stdout}\n${execution.stderr}`,
  );
  assert.equal(
    (execution.stdout.match(/"status":\s*"pass"/g) ?? []).length,
    1,
    'default npm test must reach the V3 syntax runner exactly once',
  );

  await rm(marker, { force: true });
  await writeFile(join(root, 'tests', 'architecture-v3', 'injected-failure.test.mjs'), [
    "import test from 'node:test';",
    "test('fixture injected V3 failure', () => {",
    "  throw new Error('injected V3 failure');",
    '});',
  ].join('\n'));
  const failingExecution = await execute(NPM, ['test'], {
    cwd: root,
    env: { ...fixtureEnvironment, [DEFAULT_DISCOVERY_MARKER]: marker },
  });
  assert.notEqual(failingExecution.code, 0, 'a failing V3 test must make default npm test fail');
  assert.match(failingExecution.stdout, /fixture injected V3 failure/);
  assert.equal(await readFile(marker, 'utf8'), 'V3 test executed by npm test\n');
});

test('G0b contract: checks the invalid second explicit .mjs file after a valid first file', async (t) => {
  const { first, second } = await createSyntaxFixture(t);
  const result = parseSuccessfulApiResult(await invokeCheckV3Syntax([first, second]));

  assert.deepEqual(result, {
    status: 'syntax_error',
    checkedMjsPaths: [first, second],
    failedMjsPath: second,
  });
});

test('G0b contract: preserves a relative leading-dash filename while checking it safely', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-g0b-leading-dash-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filename = '--g0b leading dash.mjs';
  await writeFile(join(root, filename), 'export const safe = true;\n');

  const apiResult = parseSuccessfulApiResult(await invokeCheckV3Syntax([filename], { cwd: root }));
  const cliExecution = await invokeCli(['--path', filename], { cwd: root });

  assert.deepEqual(apiResult, {
    status: 'pass',
    checkedMjsPaths: [filename],
    failedMjsPath: null,
  });
  assert.equal(cliExecution.code, 0, cliExecution.stderr);
  assert.deepEqual(JSON.parse(cliExecution.stdout), {
    status: 'pass',
    checkedMjsPaths: [filename],
    failedMjsPath: null,
  });
});

test('G0b contract: returns typed empty-list and missing-path results for explicit inputs', async (t) => {
  const { first, missing } = await createSyntaxFixture(t);
  const empty = parseSuccessfulApiResult(await invokeCheckV3Syntax([]));
  const missingResult = parseSuccessfulApiResult(await invokeCheckV3Syntax([first, missing]));

  assert.deepEqual(empty, {
    status: 'empty_list_error',
    checkedMjsPaths: [],
    failedMjsPath: null,
  });
  assert.deepEqual(missingResult, {
    status: 'path_missing',
    checkedMjsPaths: [first],
    failedMjsPath: missing,
  });
});

test('G0b contract: CLI rejects unknown, incomplete, and non-.mjs explicit inputs', async (t) => {
  const { nonMjs } = await createSyntaxFixture(t);
  const unknown = await invokeCli(['--unknown']);
  const incomplete = await invokeCli(['--path']);
  const invalidExtension = await invokeCli(['--path', nonMjs]);

  assert.notEqual(unknown.code, 0);
  assert.match(unknown.stderr, /unknown argument/i);
  assert.notEqual(incomplete.code, 0);
  assert.match(incomplete.stderr, /--path requires a \.mjs path/i);
  assert.notEqual(invalidExtension.code, 0);
  assert.match(invalidExtension.stderr, /--path requires a \.mjs path/i);
});

test('G0b contract: default discovery checks present V3 files without requiring future directories', async () => {
  const execution = await invokeCli([]);

  assert.equal(execution.code, 0, `default discovery must pass: ${execution.stderr}`);
  const result = JSON.parse(execution.stdout);
  assert.equal(result.status, 'pass');
  assert.ok(result.checkedMjsPaths.includes(CHECKER_PATH));
  assert.ok(result.checkedMjsPaths.includes(join(ROOT, 'scripts', 'architecture-v3', 'audit-baseline.mjs')));
  assert.ok(result.checkedMjsPaths.includes(join(ROOT, 'tests', 'architecture-v3', 'baseline-contract.test.mjs')));
});
