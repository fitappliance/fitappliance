import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = process.cwd();
const REGISTER_SOURCE = fs.readFileSync(path.join(ROOT, 'public', 'scripts', 'sw-register.js'), 'utf8');

async function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://www.fitappliance.com.au/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  let controllerChangeHandler = null;
  const timeouts = [];
  let reloadCount = 0;

  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: {
      register: async () => ({}),
      addEventListener(type, handler) {
        if (type === 'controllerchange') controllerChangeHandler = handler;
      }
    },
    configurable: true
  });
  window.setTimeout = (handler, delay) => {
    timeouts.push({ handler, delay });
    return timeouts.length;
  };
  window.__fitApplianceReload = () => {
    reloadCount += 1;
  };

  window.eval(REGISTER_SOURCE);
  window.dispatchEvent(new window.Event('load'));
  await Promise.resolve();

  return {
    window,
    getControllerChangeHandler: () => controllerChangeHandler,
    timeouts,
    getReloadCount: () => reloadCount
  };
}

test('phase 43a sw: register script listens for controllerchange updates', () => {
  assert.match(REGISTER_SOURCE, /controllerchange/);
});

test('phase 43a sw: controllerchange shows a refresh toast', async () => {
  const { window, getControllerChangeHandler } = await setupDom();
  const handler = getControllerChangeHandler();

  assert.equal(typeof handler, 'function', 'controllerchange handler should be registered');
  handler();

  const toast = window.document.querySelector('.sw-update-toast');
  assert.ok(toast, 'update toast should be rendered');
  assert.match(toast.textContent, /New version available/i);
  assert.ok(toast.querySelector('button'), 'refresh button should be present');
});

test('phase 43a sw: refresh button reloads via injected reload hook', async () => {
  const { window, getControllerChangeHandler, getReloadCount } = await setupDom();

  getControllerChangeHandler()();
  window.document.querySelector('.sw-update-toast button').click();

  assert.equal(getReloadCount(), 1);
});

test('phase 43a sw: update toast auto-removes after five seconds', async () => {
  const { window, getControllerChangeHandler, timeouts } = await setupDom();

  getControllerChangeHandler()();
  const timeout = timeouts.find((row) => row.delay === 5000);
  assert.ok(timeout, 'toast should schedule a five second dismissal');
  timeout.handler();

  assert.equal(window.document.querySelector('.sw-update-toast'), null);
});
