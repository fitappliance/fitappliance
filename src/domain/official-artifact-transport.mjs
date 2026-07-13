import { execFile as execFileCallback } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

import {
  isOfficialBrandArtifactHostUrl,
  isOfficialBrandArtifactUrl,
} from './evidence-source-verifier.mjs';

const execFile = promisify(execFileCallback);
const DEFAULT_MAXIMUM_BYTES = 20 * 1024 * 1024;
const USER_AGENT = 'FitApplianceEvidenceBot/3.0 (+https://www.fitappliance.com.au/about/editorial-standards)';
const strategies = JSON.parse(readFileSync(
  new URL('../../data/architecture-v2/policies/manufacturer-document-strategies.json', import.meta.url),
  'utf8',
));

function normalizeContentType(value) {
  return String(value ?? '').split(';')[0].trim().toLowerCase();
}

function validatePayload(contentType, input, maximumBytes) {
  const bytes = Buffer.from(input ?? []);
  if (!bytes.length || bytes.length > maximumBytes) throw new Error('artifact size outside limits');
  const prefix = bytes.subarray(0, 32).toString('utf8').trimStart().toLowerCase();
  const pdfMagic = prefix.startsWith('%pdf-');
  if (contentType === 'application/pdf' && !pdfMagic) throw new Error('PDF content type does not match payload');
  if (contentType === 'application/octet-stream') {
    if (!pdfMagic) throw new Error('generic binary content type does not match a PDF payload');
    return { bytes, contentType: 'application/pdf' };
  }
  if (contentType === 'text/html' && !prefix.startsWith('<!doctype') && !prefix.startsWith('<html')) {
    throw new Error('HTML content type does not match payload');
  }
  if (!['application/pdf', 'text/html'].includes(contentType)) {
    throw new TypeError(`unsupported evidence content type ${contentType || 'missing'}`);
  }
  return { bytes, contentType };
}

function retriable(error) {
  return error?.retriable === true
    || error?.name === 'TimeoutError'
    || error?.name === 'AbortError'
    || (error instanceof TypeError && /fetch|network|socket|timed?\s*out/i.test(error.message));
}

function transportError(message, retry = false) {
  const error = new Error(message);
  error.retriable = retry;
  return error;
}

async function fetchTransport(requestedUrl, brand, options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maximumRedirects = options.maximumRedirects ?? 5;
  let current = new URL(requestedUrl).toString();
  const redirectChain = [];
  for (let redirect = 0; redirect <= maximumRedirects; redirect += 1) {
    let response;
    try {
      response = await fetchImpl(current, {
        redirect: 'manual',
        signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 30000),
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/pdf;q=0.9' },
      });
    } catch (error) {
      if (retriable(error) || error instanceof TypeError) throw transportError(error.message, true);
      throw error;
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirect >= maximumRedirects) throw new Error('official redirect limit exceeded');
      const location = response.headers.get('location');
      if (!location) throw new Error('redirect location missing');
      const next = new URL(location, current).toString();
      if (!isOfficialBrandArtifactHostUrl(next, brand, {
        model: options.expectedModel,
        artifactUrl: requestedUrl,
        discoveryProvenance: options.discoveryProvenance,
      })) throw new Error('redirect escaped official brand hosts or lacks provenance');
      redirectChain.push(next);
      current = next;
      continue;
    }
    if (!response.ok) throw transportError(`http_${response.status}`, response.status === 408 || response.status === 429 || response.status >= 500);
    const validated = validatePayload(
      normalizeContentType(response.headers.get('content-type')),
      await response.arrayBuffer(),
      options.maximumBytes,
    );
    return { finalUrl: current, redirectChain, ...validated, transport: 'fetch' };
  }
  throw new Error('unreachable redirect state');
}

function redirectChainFromHeaders(headers, requestedUrl, finalUrl) {
  const locations = [...String(headers).matchAll(/^location:\s*(.+)$/gim)].map((match) => match[1].trim());
  const chain = [];
  let current = requestedUrl;
  for (const location of locations) {
    current = new URL(location, current).toString();
    chain.push(current);
  }
  if (finalUrl !== requestedUrl && chain.at(-1) !== finalUrl) chain.push(finalUrl);
  return chain;
}

async function defaultCurlTransport(requestedUrl, options) {
  const directory = await mkdtemp(join(tmpdir(), 'fitappliance-curl-'));
  const bodyPath = join(directory, 'body');
  const headersPath = join(directory, 'headers');
  try {
    const seconds = Math.max(1, Math.ceil((options.timeoutMs ?? 30000) / 1000));
    const { stdout } = await execFile(
      options.curlBinary ?? 'curl',
      buildCurlArguments(requestedUrl, options, bodyPath, headersPath),
      { encoding: 'utf8', timeout: (seconds + 5) * 1000, maxBuffer: 1024 * 1024 },
    );
    const [finalUrl, contentType] = String(stdout).trim().split(/\r?\n/);
    const [bytes, headers] = await Promise.all([readFile(bodyPath), readFile(headersPath, 'utf8')]);
    return {
      finalUrl,
      redirectChain: redirectChainFromHeaders(headers, requestedUrl, finalUrl),
      contentType: normalizeContentType(contentType),
      bytes,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function buildCurlArguments(requestedUrl, options, bodyPath, headersPath) {
  const seconds = Math.max(1, Math.ceil((options.timeoutMs ?? 30000) / 1000));
  const hostname = new URL(requestedUrl).hostname.toLowerCase();
  const args = [
    '--location', '--fail', '--silent', '--show-error',
    '--max-time', String(seconds), '--max-redirs', String(options.maximumRedirects ?? 5),
    '--max-filesize', String(options.maximumBytes),
  ];
  if (!strategies.transport.preserveCurlDefaultUserAgentHosts.includes(hostname)) {
    args.push('--user-agent', USER_AGENT);
  }
  args.push(
    '--header', 'Accept: text/html,application/pdf;q=0.9',
    '--dump-header', headersPath,
    '--output', bodyPath,
    '--write-out', '%{url_effective}\n%{content_type}\n',
    requestedUrl,
  );
  return args;
}

function validateTransportResult(result, requestedUrl, brand, options) {
  const hostContext = {
    model: options.expectedModel,
    artifactUrl: requestedUrl,
    discoveryProvenance: options.discoveryProvenance,
  };
  if (!isOfficialBrandArtifactHostUrl(result?.finalUrl, brand, hostContext)) {
    throw new Error('final URL escaped official brand hosts or lacks provenance');
  }
  if (!Array.isArray(result?.redirectChain) || result.redirectChain.length > (options.maximumRedirects ?? 5)
    || result.redirectChain.some((url) => !isOfficialBrandArtifactHostUrl(url, brand, hostContext))) {
    throw new Error('redirect escaped official brand hosts or lacks provenance');
  }
  const validated = validatePayload(normalizeContentType(result.contentType), result.bytes, options.maximumBytes);
  if (/\.pdf$/i.test(new URL(requestedUrl).pathname) && validated.contentType !== 'application/pdf') {
    throw new Error('PDF request returned a non-PDF content type');
  }
  return {
    finalUrl: new URL(result.finalUrl).toString(),
    redirectChain: result.redirectChain.map((url) => new URL(url).toString()),
    ...validated,
  };
}

export async function fetchOfficialArtifactResilient(requestedUrl, brand, options = {}) {
  if (!isOfficialBrandArtifactUrl(requestedUrl, brand, {
    model: options.expectedModel,
    discoveryProvenance: options.discoveryProvenance,
  })) {
    throw new TypeError('requested URL is not an official brand URL with valid market discovery provenance');
  }
  const normalizedOptions = { ...options, maximumBytes: options.maximumBytes ?? DEFAULT_MAXIMUM_BYTES };
  const curlImpl = options.curlImpl ?? defaultCurlTransport;
  const curlPreferred = options.allowCurlFallback === true
    && strategies.transport.curlPreferredHosts.includes(new URL(requestedUrl).hostname.toLowerCase());
  if (curlPreferred) {
    try {
      const preferred = validateTransportResult(await curlImpl(requestedUrl, normalizedOptions), requestedUrl, brand, normalizedOptions);
      return { requestedUrl: new URL(requestedUrl).toString(), ...preferred, transport: 'curl' };
    } catch {
      // The primary fetch path remains available when the preferred local transport is absent.
    }
  }
  try {
    const result = await fetchTransport(requestedUrl, brand, normalizedOptions);
    return { requestedUrl: new URL(requestedUrl).toString(), ...result };
  } catch (error) {
    if (!retriable(error) || options.allowCurlFallback !== true) throw error;
    const fallback = validateTransportResult(await curlImpl(requestedUrl, normalizedOptions), requestedUrl, brand, normalizedOptions);
    return { requestedUrl: new URL(requestedUrl).toString(), ...fallback, transport: 'curl' };
  }
}
