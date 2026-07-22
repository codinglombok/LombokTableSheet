export interface TableTemplate {
  name: string;
  description: string;
  header: { bold: boolean; background?: string; sticky?: boolean };
  zebraRows: boolean;
  borders: 'none' | 'grid' | 'horizontal';
  numberAlign: 'left' | 'right';
  cssHooks: string[]; // class names LombokCSS can style; harmless no-ops without it
}

const builtIns: Record<string, TableTemplate> = {
  plain: {
    name: 'plain',
    description: 'No styling opinions — a bare table.',
    header: { bold: false },
    zebraRows: false,
    borders: 'none',
    numberAlign: 'right',
    cssHooks: ['lts-plain'],
  },
  report: {
    name: 'report',
    description: 'Clean grid for internal reports and dashboards.',
    header: { bold: true, background: '#f4f4f5', sticky: true },
    zebraRows: true,
    borders: 'horizontal',
    numberAlign: 'right',
    cssHooks: ['lts-report'],
  },
  invoice: {
    name: 'invoice',
    description: 'Bordered grid suited to line-item invoices.',
    header: { bold: true, background: '#eef2ff', sticky: false },
    zebraRows: false,
    borders: 'grid',
    numberAlign: 'right',
    cssHooks: ['lts-invoice'],
  },
  'financial-statement': {
    name: 'financial-statement',
    description: 'Dense, right-aligned numerics for financial statements.',
    header: { bold: true, sticky: true },
    zebraRows: false,
    borders: 'horizontal',
    numberAlign: 'right',
    cssHooks: ['lts-financial'],
  },
};

export class TemplateRegistry {
  private templates: Map<string, TableTemplate> = new Map(Object.entries(builtIns));

  get(name: string): TableTemplate {
    return this.templates.get(name) ?? this.templates.get('plain')!;
  }

  register(template: TableTemplate): void {
    this.templates.set(template.name, template);
  }

  list(): string[] {
    return [...this.templates.keys()];
  }
}

export const defaultTemplates = new TemplateRegistry();
