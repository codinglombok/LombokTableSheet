import type { LanguageCatalog } from '../types.js';

/** Japanese (ja) catalog for I18nManager. Generated from the WS-4 locale set;
 *  edit here — this is the shipped source of truth, not a build artifact. */
const ja: LanguageCatalog = {
  "language_code": "ja",
  "language_name": "日本語",
  "direction": "ltr",
  "plural_forms": 1,
  "ui": {
    "ok": "OK",
    "cancel": "キャンセル",
    "save": "保存",
    "delete": "削除",
    "edit": "編集",
    "add": "追加",
    "close": "閉じる",
    "yes": "はい",
    "no": "いいえ",
    "loading": "読み込み中...",
    "error": "エラー",
    "success": "成功",
    "warning": "警告"
  },
  "messages": {
    "welcome": "LombokTableSheet へようこそ",
    "goodbye": "ありがとうございました。さようなら！",
    "no_data_available": "利用可能なデータがありません",
    "operation_successful": "操作が正常に完了しました",
    "operation_failed": "操作に失敗しました。もう一度お試しください。",
    "confirm_delete": "本当にこれを削除しますか？",
    "unsaved_changes": "保存されていない変更があります。保存しますか？"
  },
  "formulas": {
    "anova_oneway": "一元分散分析",
    "anova_twoway": "二元分散分析",
    "sum": "合計",
    "average": "平均",
    "count": "カウント",
    "min": "最小値",
    "max": "最大値"
  },
  "plurals": {
    "row_count": [
      "行がありません",
      "%n 行"
    ],
    "selected_items": [
      "選択されたアイテムがありません",
      "%n 個のアイテムが選択されています"
    ],
    "changes": [
      "変更なし",
      "%n 個の変更"
    ]
  },
  "errors": {
    "invalid_input": "無効な入力",
    "empty_field": "このフィールドは必須です",
    "out_of_range": "値が範囲外です",
    "duplicate_value": "この値は既に存在します",
    "insufficient_data": "この操作には不十分なデータです",
    "formula_error": "数式エラー：%error"
  },
  "formatting": {
    "decimal_separator": ".",
    "thousands_separator": ",",
    "date_format": "YYYY年MM月DD日",
    "time_format": "24h"
  }
} as const;

export default ja;
