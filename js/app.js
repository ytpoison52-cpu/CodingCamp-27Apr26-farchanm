// js/app.js — Expense & Budget Visualizer

// ---------------------------------------------------------------------------
// StorageManager
// Responsible for reading and writing the transaction array to localStorage.
// Stateless utility — does not cache data.
// ---------------------------------------------------------------------------
const StorageManager = {
  STORAGE_KEY: 'expense_transactions',

  // Internal flag set to true when a load error is encountered.
  // Read by the initialization flow to decide whether to show a warning.
  storageError: false,

  /**
   * Reads and parses the transaction array from localStorage.
   * Validates that the parsed value is an array and that each item contains
   * the required fields (id, name, amount, category, timestamp).
   * Malformed items are silently filtered out.
   *
   * @returns {Array} Array of valid Transaction objects, or [] on any error.
   */
  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);

      // Key not present — treat as empty list (not an error)
      if (raw === null) {
        return [];
      }

      const parsed = JSON.parse(raw);

      // Parsed value must be an array; anything else is malformed
      if (!Array.isArray(parsed)) {
        this.storageError = true;
        return [];
      }

      // Filter out items that are missing any required field
      const requiredFields = ['id', 'name', 'amount', 'category', 'timestamp'];
      const valid = parsed.filter((item) => {
        if (item === null || typeof item !== 'object') return false;
        return requiredFields.every((field) => Object.prototype.hasOwnProperty.call(item, field));
      });

      return valid;
    } catch (err) {
      // localStorage unavailable or JSON.parse failed
      this.storageError = true;
      return [];
    }
  },

  /**
   * Serializes the transactions array to JSON and writes it to localStorage.
   *
   * @param {Array} transactions - Array of Transaction objects to persist.
   * @returns {boolean} true on success, false if localStorage is unavailable.
   */
  save(transactions) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(transactions));
      return true;
    } catch (err) {
      return false;
    }
  },
};

// ---------------------------------------------------------------------------
// TransactionManager
// Owns the in-memory transaction array. Coordinates between StorageManager,
// UIRenderer, and ChartManager after every mutation.
// ---------------------------------------------------------------------------
const TransactionManager = {
  /** @type {Array} In-memory transaction list — single source of truth. */
  transactions: [],

  /**
   * Tracks whether the most recent StorageManager.save() call succeeded.
   * Set by add() so the event handler can show a warning on save failure.
   * @type {boolean}
   */
  lastSaveSucceeded: true,

  /**
   * Loads persisted transactions from storage and populates this.transactions.
   */
  init() {
    this.transactions = StorageManager.load();
  },

  /**
   * Creates a new Transaction, appends it to the in-memory array, persists,
   * and triggers a full UI + chart re-render.
   *
   * @param {string} name     - Item name (will be trimmed).
   * @param {number} amount   - Positive numeric amount.
   * @param {string} category - One of 'Food', 'Transport', 'Fun'.
   * @returns {Object} The newly created Transaction object.
   */
  add(name, amount, category) {
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Date.now().toString();

    const transaction = {
      id,
      name: String(name).trim(),
      amount: parseFloat(amount),
      category,
      timestamp: Date.now(),
    };

    this.transactions.push(transaction);
    this.lastSaveSucceeded = StorageManager.save(this.transactions);

    if (typeof UIRenderer !== 'undefined') UIRenderer.render();
    if (typeof ChartManager !== 'undefined') ChartManager.update();

    return transaction;
  },

  /**
   * Removes the transaction with the given id from the in-memory array,
   * persists the updated list, and triggers a full UI + chart re-render.
   *
   * @param {string} id - The id of the transaction to remove.
   */
  delete(id) {
    this.transactions = this.transactions.filter((t) => t.id !== id);
    StorageManager.save(this.transactions);

    if (typeof UIRenderer !== 'undefined') UIRenderer.render();
    if (typeof ChartManager !== 'undefined') ChartManager.update();
  },

  /**
   * Returns the sum of all transaction amounts.
   *
   * @returns {number} Total spending, or 0 for an empty list.
   */
  getTotal() {
    return this.transactions.reduce((sum, t) => sum + t.amount, 0);
  },

  /**
   * Returns per-category spending totals.
   *
   * @returns {{ Food: number, Transport: number, Fun: number }}
   */
  getTotalsByCategory() {
    const totals = { Food: 0, Transport: 0, Fun: 0 };
    for (const t of this.transactions) {
      if (Object.prototype.hasOwnProperty.call(totals, t.category)) {
        totals[t.category] += t.amount;
      }
    }
    return totals;
  },
};

// ---------------------------------------------------------------------------
// Validator
// Pure functions — no side effects. Returns structured result objects so
// UIRenderer can display targeted inline errors.
// ---------------------------------------------------------------------------
const Validator = {
  /** Valid category values. */
  VALID_CATEGORIES: ['Food', 'Transport', 'Fun'],

  /**
   * Validates the three form fields and returns a structured result.
   *
   * @param {string} name     - Raw item name from the text input.
   * @param {string} amount   - Raw amount string from the number input.
   * @param {string} category - Selected category value from the dropdown.
   * @returns {{ valid: boolean, errors: { name?: string, amount?: string, category?: string } }}
   */
  validateForm(name, amount, category) {
    const errors = {};

    // name: must be non-empty after trimming whitespace
    if (typeof name !== 'string' || name.trim() === '') {
      errors.name = 'Item name is required';
    }

    // amount: must parse as a finite positive number (> 0)
    const parsedAmount = parseFloat(amount);
    if (!isFinite(parsedAmount) || parsedAmount <= 0) {
      errors.amount = 'Amount must be a positive number';
    }

    // category: must be one of the allowed values
    if (!this.VALID_CATEGORIES.includes(category)) {
      errors.category = 'Please select a category';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  },
};

// ---------------------------------------------------------------------------
// UIRenderer
// Handles all DOM mutations. Reads from TransactionManager to produce the
// current view. Never stores state itself.
// ---------------------------------------------------------------------------
const UIRenderer = {
  /**
   * Formats a number as a USD currency string (e.g. 12.5 → "$12.50").
   *
   * @param {number} amount
   * @returns {string}
   */
  _formatCurrency(amount) {
    return '$' + amount.toFixed(2);
  },

  /**
   * Clears #transaction-list and re-renders all transactions.
   * Shows an empty-state message when there are no transactions.
   */
  renderTransactionList() {
    const list = document.getElementById('transaction-list');
    if (!list) return;

    // Clear existing content
    list.innerHTML = '';

    if (TransactionManager.transactions.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No transactions yet. Add one above!';
      list.appendChild(empty);
      return;
    }

    for (const t of TransactionManager.transactions) {
      const item = document.createElement('div');
      item.className = 'transaction-item';

      const info = document.createElement('span');
      info.className = 'transaction-info';
      info.textContent = `${t.name} — ${this._formatCurrency(t.amount)} (${t.category})`;

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.setAttribute('data-id', t.id);
      deleteBtn.setAttribute('aria-label', `Delete transaction: ${t.name}`);

      item.appendChild(info);
      item.appendChild(deleteBtn);
      list.appendChild(item);
    }
  },

  /**
   * Updates #balance-display with the current total from TransactionManager.
   */
  renderBalance() {
    const display = document.getElementById('balance-display');
    if (!display) return;
    display.textContent = this._formatCurrency(TransactionManager.getTotal());
  },

  /**
   * Clears all existing inline error spans, then populates the ones that
   * correspond to keys present in the errors object.
   *
   * @param {{ name?: string, amount?: string, category?: string }} errors
   */
  renderFormErrors(errors) {
    // Clear first to avoid stale messages
    this.clearFormErrors();

    const fieldMap = {
      name: 'error-name',
      amount: 'error-amount',
      category: 'error-category',
    };

    for (const [field, message] of Object.entries(errors)) {
      const spanId = fieldMap[field];
      if (!spanId) continue;
      const span = document.getElementById(spanId);
      if (span) span.textContent = message;
    }
  },

  /**
   * Empties all <span class="error"> elements inside the transaction form.
   */
  clearFormErrors() {
    const form = document.getElementById('transaction-form');
    if (!form) return;
    const errorSpans = form.querySelectorAll('span.error');
    errorSpans.forEach((span) => {
      span.textContent = '';
    });
  },

  /**
   * Resets all form fields to their default empty state.
   */
  resetForm() {
    const form = document.getElementById('transaction-form');
    if (form) form.reset();
  },

  /**
   * Displays a non-blocking warning message in #warning-banner.
   *
   * @param {string} message - The warning text to display.
   */
  showWarning(message) {
    const banner = document.getElementById('warning-banner');
    if (!banner) return;
    banner.textContent = message;
    banner.style.display = '';
    banner.removeAttribute('hidden');
  },

  /**
   * Hides the #warning-banner element.
   */
  hideWarning() {
    const banner = document.getElementById('warning-banner');
    if (!banner) return;
    banner.style.display = 'none';
  },

  /**
   * Full re-render: updates the transaction list and the balance display.
   */
  render() {
    this.renderTransactionList();
    this.renderBalance();
  },
};

// ---------------------------------------------------------------------------
// ChartManager
// Wraps the Chart.js instance. Exposes only init() and update().
// Chart.js is loaded via CDN as window.Chart — no import needed.
// ---------------------------------------------------------------------------
const ChartManager = {
  /** @type {Chart|null} The active Chart.js instance, or null if none. */
  chart: null,

  /** Consistent category → hex color mapping (Requirement 4.6). */
  COLORS: {
    Food: '#FF6384',
    Transport: '#36A2EB',
    Fun: '#FFCE56',
  },

  /**
   * Checks that Chart.js is available, then delegates to update().
   * If Chart.js failed to load from CDN, logs an error and renders a
   * text fallback inside the canvas container instead.
   *
   * Called once on page load after TransactionManager.init().
   */
  init() {
    if (typeof window.Chart === 'undefined') {
      console.error('ChartManager: Chart.js is not available. The CDN script may have failed to load.');

      // Render a text fallback inside the canvas parent container
      const canvas = document.getElementById('expense-chart');
      if (canvas && canvas.parentElement) {
        // Hide the canvas so the fallback paragraph is visible
        canvas.style.display = 'none';

        const fallback = document.createElement('p');
        fallback.className = 'chart-unavailable';
        fallback.textContent = 'Chart unavailable — please check your internet connection.';
        canvas.parentElement.appendChild(fallback);
      }
      return;
    }

    this.update();
  },

  /**
   * Destroys the existing Chart.js instance (if any), reads current category
   * totals from TransactionManager, and either:
   *   - Renders a placeholder empty-state message when all totals are zero, or
   *   - Creates a new pie chart with the current spending data.
   *
   * Called after every add/delete mutation (Requirements 4.2, 4.3).
   */
  update() {
    // Destroy the existing chart instance before recreating
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const canvas = document.getElementById('expense-chart');
    if (!canvas) return;

    const totals = TransactionManager.getTotalsByCategory();
    const allZero = totals.Food === 0 && totals.Transport === 0 && totals.Fun === 0;

    // Remove any previously inserted placeholder or unavailability paragraph
    const parent = canvas.parentElement;
    if (parent) {
      const existing = parent.querySelectorAll('p.chart-placeholder, p.chart-unavailable');
      existing.forEach((el) => el.remove());
    }

    if (allZero) {
      // Empty state (Requirement 4.5): hide canvas, show placeholder text
      canvas.style.display = 'none';

      const placeholder = document.createElement('p');
      placeholder.className = 'chart-placeholder';
      placeholder.textContent = 'No spending data yet. Add a transaction to see the chart.';
      if (parent) parent.appendChild(placeholder);
      return;
    }

    // Ensure canvas is visible (may have been hidden by empty state or fallback)
    canvas.style.display = '';

    // Create a new pie chart (Requirements 4.1, 4.4, 4.6)
    this.chart = new window.Chart(canvas, {
      type: 'pie',
      data: {
        labels: ['Food', 'Transport', 'Fun'],
        datasets: [
          {
            data: [totals.Food, totals.Transport, totals.Fun],
            backgroundColor: [this.COLORS.Food, this.COLORS.Transport, this.COLORS.Fun],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
          },
        },
      },
    });
  },
};

// ---------------------------------------------------------------------------
// DOM Event Wiring
// Runs after all manager objects are defined. Attaches all event listeners.
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // 1. Load persisted transactions into memory
  TransactionManager.init();

  // 2. If storage failed to load, show a non-blocking warning
  if (StorageManager.storageError) {
    UIRenderer.showWarning('Your data could not be loaded. Storage may be unavailable.');
  }

  // 3. Render the initial UI (transaction list + balance)
  UIRenderer.render();

  // 4. Initialize the pie chart
  ChartManager.init();

  // ---------------------------------------------------------------------------
  // Form submit — add a new transaction
  // ---------------------------------------------------------------------------
  const form = document.getElementById('transaction-form');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const name     = document.getElementById('item-name')?.value ?? '';
      const amount   = document.getElementById('item-amount')?.value ?? '';
      const category = document.getElementById('item-category')?.value ?? '';

      const { valid, errors } = Validator.validateForm(name, amount, category);

      if (!valid) {
        UIRenderer.renderFormErrors(errors);
        return;
      }

      UIRenderer.clearFormErrors();
      TransactionManager.add(name, parseFloat(amount), category);
      UIRenderer.resetForm();

      // Warn if the save that happened inside add() failed
      if (!TransactionManager.lastSaveSucceeded) {
        UIRenderer.showWarning('Your data could not be saved. Changes may be lost.');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Delegated click on #transaction-list — delete a transaction
  // ---------------------------------------------------------------------------
  const list = document.getElementById('transaction-list');
  if (list) {
    list.addEventListener('click', (event) => {
      const id = event.target.getAttribute('data-id');
      if (id) {
        TransactionManager.delete(id);
      }
    });
  }
});
