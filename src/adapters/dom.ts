import { Workbook } from '../core/model.js';
import { TableTemplate, defaultTemplates } from '../templates/registry.js';
import { I18n } from '../i18n/index.js';

export interface TableOptions {
  data?: unknown[][] | Record<string, unknown>[];
  workbook?: Workbook;
  columns?: string[];
  template?: string;
  locale?: string;
  sheetName?: string;
}

function toWorkbook(opts: TableOptions): Workbook {
  if (opts.workbook) return opts.workbook;
  const rows = opts.data ?? [];
  if (rows.length > 0 && !Array.isArray(rows[0])) {
    const records = rows as Record<string, unknown>[];
    const keys = opts.columns ?? Object.keys(records[0] ?? {});
    const grid = [keys, ...records.map(r => keys.map(k => (r as Record<string, unknown>)[k] ?? null))];
    return Workbook.fromRows(grid as (string | number | boolean | null)[][], opts.sheetName ?? 'Sheet1', opts.locale ?? 'en-US');
  }
  return Workbook.fromRows((rows as (string | number | boolean | null)[][]) ?? [], opts.sheetName ?? 'Sheet1', opts.locale ?? 'en-US');
}

/** Framework-agnostic Table renderer. Text-nodes only — never innerHTML's cell content. */
export class LombokTable {
  private container: HTMLElement;
  private workbook: Workbook;
  private template: TableTemplate;
  private i18n: I18n;

  constructor(container: HTMLElement, opts: TableOptions = {}) {
    this.container = container;
    this.workbook = toWorkbook(opts);
    this.template = defaultTemplates.get(opts.template ?? 'plain');
    this.i18n = new I18n(opts.locale ?? this.workbook.locale);
    this.render();
  }

  setData(data: unknown[][] | Record<string, unknown>[], columns?: string[]): void {
    this.workbook = toWorkbook({ data, columns, locale: this.i18n.locale });
    this.render();
  }

  private render(): void {
    const sheet = this.workbook.sheets[0];
    const rows = sheet ? sheet.toRows() : [];
    const table = document.createElement('table');
    table.className = this.template.cssHooks.join(' ');
    table.setAttribute('dir', this.i18n.isRtl() ? 'rtl' : 'ltr');

    rows.forEach((row, r) => {
      const tr = document.createElement('tr');
      row.forEach(value => {
        const cellEl = document.createElement(r === 0 ? 'th' : 'td');
        cellEl.textContent = this.i18n.formatCell(value); // never innerHTML — avoids injection
        if (typeof value === 'number') cellEl.style.textAlign = this.template.numberAlign;
        tr.appendChild(cellEl);
      });
      table.appendChild(tr);
    });

    this.container.replaceChildren(table);
  }

  getWorkbook(): Workbook {
    return this.workbook;
  }
}
