# Implementation Plan: Expense and Budget Visualizer

## Overview

Implement the app in three files only: `index.html`, `css/styles.css`, and `js/app.js`. Chart.js is loaded via CDN. No build tools, no test files, no backend. Each task builds on the previous one; the final task wires everything together.

## Tasks

- [x] 1. Project scaffold — index.html, css/, js/ folders
  - Create `index.html` at the project root with the full HTML skeleton:
    - `<head>` with `<meta charset>`, `<meta name="viewport">`, `<title>`, and `<link rel="stylesheet" href="css/styles.css">`
    - CDN `<script>` tag for Chart.js (e.g. `https://cdn.jsdelivr.net/npm/chart.js`) placed before the closing `</body>`
    - `<script src="js/app.js" defer></script>` after the Chart.js tag
  - Add structural markup inside `<body>`:
    - `#warning-banner` div (hidden by default) for non-blocking storage warnings
    - `#balance-display` element showing total spending
    - `#transaction-form` with: text input `#item-name`, number input `#item-amount`, `<select id="item-category">` with options Food / Transport / Fun, a submit button, and empty `<span class="error">` elements adjacent to each field for inline validation messages
    - `<canvas id="expense-chart">` for the pie chart
    - `#transaction-list` container for the scrollable transaction entries
  - Create empty `css/styles.css` and empty `js/app.js` files
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 2. Implement StorageManager in js/app.js
  - Define `StorageManager` as a plain object literal with:
    - `STORAGE_KEY = 'expense_transactions'`
    - `load()`: wraps `localStorage.getItem` + `JSON.parse` in `try/catch`; validates the parsed value is an array and each item has `id`, `name`, `amount`, `category`, `timestamp`; filters out malformed items; returns `[]` and sets an internal `storageError` flag on any error
    - `save(transactions)`: wraps `localStorage.setItem(JSON.stringify(...))` in `try/catch`; returns `true` on success, `false` on failure
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 3. Implement TransactionManager in js/app.js
  - Define `TransactionManager` as a plain object literal with:
    - `transactions = []` as in-memory state
    - `init()`: calls `StorageManager.load()`, assigns result to `this.transactions`
    - `add(name, amount, category)`: creates a `Transaction` object with `id` (`crypto.randomUUID()` or `Date.now().toString()` fallback), `name` (trimmed), `amount` (parsed float), `category`, and `timestamp` (`Date.now()`); pushes to `this.transactions`; calls `StorageManager.save()`; calls `UIRenderer.render()` and `ChartManager.update()`; returns the new transaction
    - `delete(id)`: filters `this.transactions` by id; calls `StorageManager.save()`; calls `UIRenderer.render()` and `ChartManager.update()`
    - `getTotal()`: returns sum of all `amount` fields, or `0` for empty array
    - `getTotalsByCategory()`: returns `{ Food: 0, Transport: 0, Fun: 0 }` with each value summed from matching transactions
  - _Requirements: 1.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 4.1, 5.1, 5.2_

- [x] 4. Implement Validator in js/app.js
  - Define `Validator` as a plain object literal with:
    - `validateForm(name, amount, category)`: pure function with no side effects
    - Validation rules:
      - `name`: non-empty after `trim()`; error message `"Item name is required"`
      - `amount`: parses as a finite positive number (`> 0`); error message `"Amount must be a positive number"`
      - `category`: must be one of `['Food', 'Transport', 'Fun']`; error message `"Please select a category"`
    - Returns `{ valid: boolean, errors: { name?, amount?, category? } }`
  - _Requirements: 1.3, 1.4_

- [x] 5. Implement UIRenderer in js/app.js
  - Define `UIRenderer` as a plain object literal with:
    - `renderTransactionList()`: clears `#transaction-list`; if `TransactionManager.transactions` is empty, inserts an empty-state `<p>` message; otherwise renders one list item per transaction showing name, amount formatted as currency (e.g. `$12.50`), category label, and a delete button with `data-id` attribute
    - `renderBalance()`: reads `TransactionManager.getTotal()` and updates `#balance-display` with the currency-formatted total
    - `renderFormErrors(errors)`: clears existing error spans first; for each key in `errors`, finds the adjacent `<span class="error">` for that field and sets its `textContent`
    - `clearFormErrors()`: empties all `<span class="error">` elements in the form
    - `resetForm()`: calls `document.getElementById('transaction-form').reset()`
    - `showWarning(message)`: sets `#warning-banner` `textContent` and removes the hidden class/style
    - `hideWarning()`: hides `#warning-banner`
    - `render()`: calls `renderTransactionList()` then `renderBalance()`
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3, 3.4, 1.4, 1.5, 5.4_

- [x] 6. Implement ChartManager in js/app.js
  - Define `ChartManager` as a plain object literal with:
    - `chart = null`
    - `COLORS = { Food: '#FF6384', Transport: '#36A2EB', Fun: '#FFCE56' }`
    - `init()`: checks `window.Chart` is defined; if not, logs a console error and renders a text fallback inside the canvas container (`"Chart unavailable — please check your internet connection."`); if available, calls `this.update()`
    - `update()`: destroys existing `this.chart` instance if present; reads `TransactionManager.getTotalsByCategory()`; if all totals are zero, renders a placeholder message on the canvas (empty state) instead of creating a chart; otherwise creates a new `Chart` instance on `#expense-chart` as a `'pie'` type with labels `['Food', 'Transport', 'Fun']`, dataset using `COLORS` values, and data from `getTotalsByCategory()`; assigns to `this.chart`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 7. Wire up DOM events in js/app.js
  - Add a `DOMContentLoaded` listener that runs the initialization sequence:
    1. `TransactionManager.init()`
    2. If `StorageManager.storageError` is set, call `UIRenderer.showWarning("Your data could not be loaded. Storage may be unavailable.")`
    3. `UIRenderer.render()`
    4. `ChartManager.init()`
  - Attach a `submit` listener to `#transaction-form`:
    - Calls `event.preventDefault()`
    - Reads values from `#item-name`, `#item-amount`, `#item-category`
    - Calls `Validator.validateForm(name, amount, category)`
    - If invalid: calls `UIRenderer.renderFormErrors(errors)` and returns
    - If valid: calls `UIRenderer.clearFormErrors()`, `TransactionManager.add(name, parseFloat(amount), category)`, `UIRenderer.resetForm()`
    - If `StorageManager.save()` returned `false` during add, calls `UIRenderer.showWarning("Your data could not be saved. Changes may be lost.")`
  - Attach a delegated `click` listener to `#transaction-list`:
    - Checks if the clicked element has a `data-id` attribute (delete button)
    - Calls `TransactionManager.delete(id)`
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.4, 5.1, 5.2, 5.4_

- [x] 8. CSS styling in css/styles.css
  - Base styles:
    - Box-sizing reset (`*, *::before, *::after { box-sizing: border-box }`)
    - Body font: system font stack, sufficient line-height, background and text colors with readable contrast
    - Max-width container centered on the page with horizontal padding
  - Balance display: prominent font size, visually distinct from body text
  - Form layout: stacked fields with labels, consistent spacing, submit button styled distinctly
  - Error spans (`span.error`): red color, small font, displayed below the associated field
  - Warning banner (`#warning-banner`): non-intrusive background (e.g. amber/yellow), full-width, hidden by default (`display: none`)
  - Two-column layout for chart + transaction list at `≥600px`:
    - Use CSS Grid or Flexbox on a wrapper element
    - Chart column and list column share the row
  - Single-column stacked layout at `<600px` via `@media (max-width: 599px)`
  - Transaction list: `overflow-y: auto` with a max-height so it scrolls when entries overflow
  - Empty state message: centered, muted color
  - Delete button: minimal styling (no heavy borders), visually distinct from form submit
  - Canvas (`#expense-chart`): `max-width: 100%` to stay responsive
  - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 2.2, 2.5_

- [-] 9. Manual integration verification checklist
  - Open `index.html` directly in Chrome, Firefox, Edge, and Safari; confirm no console errors on load
  - Add a transaction for each category (Food, Transport, Fun); confirm the transaction list updates, balance updates, and pie chart updates without a page reload
  - Submit the form with each field blank or invalid; confirm inline error messages appear next to the correct fields and no transaction is added
  - Submit a valid transaction; confirm the form resets to empty state after submission
  - Delete a transaction; confirm it is removed from the list, the balance decreases, and the chart updates
  - Delete all transactions; confirm the empty-state message appears in the transaction list and the chart shows a placeholder
  - Reload the page after adding transactions; confirm all transactions are restored from localStorage
  - Resize the browser viewport below 600px; confirm the chart and transaction list stack vertically
  - Resize the browser viewport to 600px or wider; confirm the chart and transaction list appear side by side
  - Open the app in a context where localStorage is blocked (e.g. private browsing with storage disabled); confirm the warning banner appears and the app still loads with an empty list
  - Block the Chart.js CDN request (DevTools → Network → block URL); confirm the fallback message appears inside the chart area
  - _Requirements: 6.1, 5.3, 5.4, 4.5, 2.5, 6.4, 6.5_
