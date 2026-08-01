import type { LanguageCatalog } from '../types.js';

/** Chinese (Simplified) (zh) catalog for I18nManager. Generated from the WS-4 locale set;
 *  edit here — this is the shipped source of truth, not a build artifact. */
const zh: LanguageCatalog = {
  "language_code": "zh",
  "language_name": "中文",
  "direction": "ltr",
  "plural_forms": 1,
  "ui": {
    "ok": "确定",
    "cancel": "取消",
    "save": "保存",
    "delete": "删除",
    "edit": "编辑",
    "add": "添加",
    "close": "关闭",
    "yes": "是",
    "no": "否",
    "loading": "加载中...",
    "error": "错误",
    "success": "成功",
    "warning": "警告"
  },
  "messages": {
    "welcome": "欢迎使用 LombokTableSheet",
    "goodbye": "谢谢，再见！",
    "no_data_available": "没有可用数据",
    "operation_successful": "操作成功完成",
    "operation_failed": "操作失败。请重试。",
    "confirm_delete": "您确定要删除此项吗？",
    "unsaved_changes": "您有未保存的更改。要保存吗？"
  },
  "formulas": {
    "anova_oneway": "单因素方差分析",
    "anova_twoway": "双因素方差分析",
    "sum": "求和",
    "average": "平均值",
    "count": "计数",
    "min": "最小值",
    "max": "最大值"
  },
  "plurals": {
    "row_count": [
      "没有行数据",
      "%n 行"
    ],
    "selected_items": [
      "没有选定项目",
      "%n 个选定项目"
    ],
    "changes": [
      "没有更改",
      "%n 个更改"
    ]
  },
  "errors": {
    "invalid_input": "输入无效",
    "empty_field": "此字段为必填项",
    "out_of_range": "值超出范围",
    "duplicate_value": "该值已存在",
    "insufficient_data": "此操作的数据不足",
    "formula_error": "公式错误：%error"
  },
  "formatting": {
    "decimal_separator": ".",
    "thousands_separator": ",",
    "date_format": "YYYY-MM-DD",
    "time_format": "24h"
  }
} as const;

export default zh;
