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

test('phase 60 sw: controllerchange marks update state without a refresh toast', async () => {
  const { window, getControllerChangeHandler } = await setupDom();
  const handler = getControllerChangeHandler();

  assert.equal(typeof handler, 'function', 'controllerchange handler should be registered');
  handler();

  assert.equal(window.__fitApplianceServiceWorkerUpdated, true);
  assert.equal(window.document.querySelector('.sw-update-toast'), null);
});

test('phase 60 sw: controllerchange does not trigger an immediate reload', async () => {
  const { window, getControllerChangeHandler, getReloadCount } = await setupDom();

  getControllerChangeHandler()();

  assert.equal(window.__fitApplianceServiceWorkerUpdated, true);
  assert.equal(getReloadCount(), 0);
});

test('phase 60 sw: update handling schedules no visual timeout', async () => {
  const { window, getControllerChangeHandler, timeouts } = await setupDom();

  getControllerChangeHandler()();

  assert.equal(timeouts.length, 0);
  assert.equal(window.document.querySelector('.sw-update-toast'), null);
});
