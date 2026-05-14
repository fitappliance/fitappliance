import { createAccountStore, INVENTORY_CATEGORIES } from './account-store.mjs';

const store = createAccountStore();
const app = document.querySelector('[data-account-app]');

const CATEGORY_LABELS = {
  fridge: 'Fridge',
  washing_machine: 'Washing Machine',
  washtower_combo: 'WashTower / Combo',
  dishwasher: 'Dishwasher',
  dryer: 'Dryer',
};

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function categoryOptions() {
  return INVENTORY_CATEGORIES
    .map((category) => `<option value="${escHtml(category)}">${escHtml(CATEGORY_LABELS[category])}</option>`)
    .join('');
}

function renderAuth(message = '') {
  app.innerHTML = `
    <section class="account-panel account-panel--auth">
      <div>
        <p class="account-kicker">Local device account</p>
        <h1>My Appliances</h1>
        <p class="account-copy">Save the appliances already in your home, then use their dimensions for one-click replacement searches. This vault is stored in this browser until server-side accounts are connected.</p>
      </div>
      ${message ? `<div class="account-message" role="status">${escHtml(message)}</div>` : ''}
      <div class="account-auth-grid">
        <form data-auth-form="login" class="account-form">
          <h2>Log in</h2>
          <label>Email <input name="email" type="email" autocomplete="email" required></label>
          <label>Password <input name="password" type="password" autocomplete="current-password" required minlength="8"></label>
          <button type="submit">Unlock appliance vault</button>
        </form>
        <form data-auth-form="signup" class="account-form">
          <h2>Create local vault</h2>
          <label>Email <input name="email" type="email" autocomplete="email" required></label>
          <label>Password <input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
          <button type="submit">Create vault</button>
        </form>
      </div>
    </section>
  `;
}

function renderInventoryRows(rows) {
  if (rows.length === 0) {
    return '<div class="empty-inventory">No saved appliances yet. Add the machine you own today, then use it as a replacement-search starting point.</div>';
  }
  return `<div class="inventory-grid">${rows.map((item) => `
    <article class="inventory-card">
      <div class="inventory-card__head">
        <span>${escHtml(CATEGORY_LABELS[item.category] ?? item.category)}</span>
        <span>${item.is_current ? 'Current' : 'Archived'}</span>
      </div>
      <h3>${escHtml(item.brand)} ${escHtml(item.model)}</h3>
      <div class="inventory-dims">
        <span>W ${escHtml(item.width)}mm</span>
        <span>H ${escHtml(item.height)}mm</span>
        <span>D ${escHtml(item.depth)}mm</span>
      </div>
      <div class="inventory-actions">
        <button type="button" data-toggle-current="${escHtml(item.id)}">${item.is_current ? 'Mark archived' : 'Mark current'}</button>
        <button type="button" data-remove-item="${escHtml(item.id)}">Remove</button>
      </div>
    </article>
  `).join('')}</div>`;
}

function renderDashboard(message = '') {
  const account = store.getCurrentAccount();
  const rows = store.listInventory();
  app.innerHTML = `
    <section class="account-panel">
      <div class="account-toolbar">
        <div>
          <p class="account-kicker">Signed in locally as ${escHtml(account?.email)}</p>
          <h1>My Appliances</h1>
        </div>
        <button type="button" data-logout>Log out</button>
      </div>
      ${message ? `<div class="account-message" role="status">${escHtml(message)}</div>` : ''}
      <form class="inventory-form" data-inventory-form>
        <h2>Add an appliance you own</h2>
        <label>Category <select name="category" required>${categoryOptions()}</select></label>
        <label>Brand <input name="brand" autocomplete="organization" required placeholder="e.g. Westinghouse"></label>
        <label>Model <input name="model" autocomplete="off" required placeholder="e.g. WTB4600WA"></label>
        <label>Width <input name="width" inputmode="numeric" type="number" min="1" required><span>mm</span></label>
        <label>Height <input name="height" inputmode="numeric" type="number" min="1" required><span>mm</span></label>
        <label>Depth <input name="depth" inputmode="numeric" type="number" min="1" required><span>mm</span></label>
        <label class="inventory-current"><input name="is_current" type="checkbox" checked> Current appliance</label>
        <button type="submit">Save appliance</button>
      </form>
      <section class="inventory-section" aria-label="Saved appliances">
        <div class="inventory-section__head">
          <h2>Saved appliances</h2>
          <p>Fridge · Washing Machine · WashTower / Combo · Dishwasher · Dryer</p>
        </div>
        ${renderInventoryRows(rows)}
      </section>
    </section>
  `;
}

async function handleAuthSubmit(form) {
  const data = new FormData(form);
  const payload = {
    email: data.get('email'),
    password: data.get('password'),
  };
  const mode = form.getAttribute('data-auth-form');
  const result = mode === 'signup'
    ? await store.signup(payload)
    : await store.login(payload);
  if (result.ok) {
    renderDashboard(mode === 'signup' ? 'Vault created.' : 'Vault unlocked.');
  } else {
    renderAuth(result.error);
  }
}

function handleInventorySubmit(form) {
  const data = new FormData(form);
  const result = store.addInventoryItem({
    category: data.get('category'),
    brand: data.get('brand'),
    model: data.get('model'),
    width: data.get('width'),
    height: data.get('height'),
    depth: data.get('depth'),
    is_current: data.get('is_current') === 'on',
  });
  renderDashboard(result.ok ? 'Appliance saved.' : result.error);
}

function bindEvents() {
  app.addEventListener('submit', async (event) => {
    const authForm = event.target.closest('[data-auth-form]');
    const inventoryForm = event.target.closest('[data-inventory-form]');
    if (authForm) {
      event.preventDefault();
      await handleAuthSubmit(authForm);
    }
    if (inventoryForm) {
      event.preventDefault();
      handleInventorySubmit(inventoryForm);
    }
  });

  app.addEventListener('click', (event) => {
    const logout = event.target.closest('[data-logout]');
    const remove = event.target.closest('[data-remove-item]');
    const toggle = event.target.closest('[data-toggle-current]');
    if (logout) {
      store.logout();
      renderAuth('Signed out.');
    }
    if (remove) {
      store.removeInventoryItem(remove.getAttribute('data-remove-item'));
      renderDashboard('Appliance removed.');
    }
    if (toggle) {
      const id = toggle.getAttribute('data-toggle-current');
      const item = store.listInventory().find((row) => row.id === id);
      store.setInventoryCurrent(id, !item?.is_current);
      renderDashboard('Appliance updated.');
    }
  });
}

if (app) {
  bindEvents();
  if (store.getSession()) {
    renderDashboard();
  } else {
    renderAuth();
  }
}
