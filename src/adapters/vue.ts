import { defineComponent, h, onMounted, onBeforeUnmount, watch, ref, type PropType } from 'vue';
import type { TableOptions } from './dom.js';
import type { SheetOptions } from './sheet.js';
import { LombokTable } from './dom.js';
import { LombokSheet } from './sheet.js';
import type { Workbook } from '../core/model.js';

/** Thin Vue 3 wrapper: mounts the framework-agnostic LombokTable into a div ref. */
export const LombokTableVue = defineComponent({
  name: 'LombokTableVue',
  props: {
    data: { type: Array as PropType<TableOptions['data']>, default: undefined },
    columns: { type: Array as PropType<string[]>, default: undefined },
    workbook: { type: Object as PropType<Workbook>, default: undefined },
    template: { type: String, default: 'plain' },
    locale: { type: String, default: 'en-US' },
    sheetName: { type: String, default: undefined },
  },
  setup(props) {
    const containerRef = ref<HTMLDivElement | null>(null);
    let instance: LombokTable | null = null;

    onMounted(() => {
      if (!containerRef.value) return;
      instance = new LombokTable(containerRef.value, {
        data: props.data, columns: props.columns, workbook: props.workbook,
        template: props.template, locale: props.locale, sheetName: props.sheetName,
      });
    });

    watch(() => props.data, (newData) => {
      if (instance && newData) instance.setData(newData, props.columns);
    });

    onBeforeUnmount(() => { instance = null; });

    return () => h('div', { ref: containerRef });
  },
});

/** Thin Vue 3 wrapper around the editable LombokSheet. */
export const LombokSheetVue = defineComponent({
  name: 'LombokSheetVue',
  props: {
    workbook: { type: Object as PropType<Workbook>, required: true },
    sheetName: { type: String, default: undefined },
    locale: { type: String, default: undefined },
  },
  emits: ['cellChange'],
  setup(props, { emit }) {
    const containerRef = ref<HTMLDivElement | null>(null);
    let instance: LombokSheet | null = null;

    onMounted(() => {
      if (!containerRef.value) return;
      instance = new LombokSheet(containerRef.value, {
        workbook: props.workbook, sheetName: props.sheetName, locale: props.locale,
      });
      instance.on('cellChange', (row: number, col: number) => emit('cellChange', row, col));
    });

    onBeforeUnmount(() => { instance = null; });

    return () => h('div', { ref: containerRef });
  },
});
