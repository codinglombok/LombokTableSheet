import { useEffect, useRef } from 'react';
import type { TableOptions } from './dom.js';
import type { SheetOptions } from './sheet.js';
import { LombokTable } from './dom.js';
import { LombokSheet } from './sheet.js';

export interface LombokTableReactProps extends TableOptions {
  className?: string;
}

/** Thin React wrapper: mounts the framework-agnostic LombokTable into a div ref.
 *  Re-renders (via setData) when `data`/`workbook` change, rather than remounting. */
export function LombokTableReact(props: LombokTableReactProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<LombokTable | null>(null);
  const { className, data, columns, workbook, template, locale, sheetName } = props;

  useEffect(() => {
    if (!containerRef.current) return;
    instanceRef.current = new LombokTable(containerRef.current, { data, columns, workbook, template, locale, sheetName });
    return () => {
      instanceRef.current = null;
    };
    // Only remount on structural option changes; data updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbook, template, locale, sheetName]);

  useEffect(() => {
    if (instanceRef.current && data) {
      instanceRef.current.setData(data, columns);
    }
  }, [data, columns]);

  return <div ref={containerRef} className={className} />;
}

export interface LombokSheetReactProps extends SheetOptions {
  className?: string;
  onCellChange?: (row: number, col: number) => void;
}

/** Thin React wrapper around the editable LombokSheet. */
export function LombokSheetReact(props: LombokSheetReactProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<LombokSheet | null>(null);
  const { className, workbook, sheetName, locale, onCellChange } = props;

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = new LombokSheet(containerRef.current, { workbook, sheetName, locale });
    instanceRef.current = instance;
    if (onCellChange) instance.on('cellChange', onCellChange);
    return () => {
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbook, sheetName, locale]);

  return <div ref={containerRef} className={className} />;
}
