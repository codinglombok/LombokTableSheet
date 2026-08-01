import type { LanguageCatalog } from '../types.js';

/** English (en) catalog for I18nManager. Generated from the WS-4 locale set;
 *  edit here — this is the shipped source of truth, not a build artifact. */
const en: LanguageCatalog = {
  "language_code": "en",
  "language_name": "English",
  "direction": "ltr",
  "plural_forms": 2,
  "ui": {
    "ok": "OK",
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete",
    "edit": "Edit",
    "add": "Add",
    "close": "Close",
    "yes": "Yes",
    "no": "No",
    "loading": "Loading...",
    "error": "Error",
    "success": "Success",
    "warning": "Warning"
  },
  "messages": {
    "welcome": "Welcome to LombokTableSheet",
    "goodbye": "Thank you, goodbye!",
    "no_data_available": "No data available",
    "operation_successful": "Operation completed successfully",
    "operation_failed": "Operation failed. Please try again.",
    "confirm_delete": "Are you sure you want to delete this?",
    "unsaved_changes": "You have unsaved changes. Do you want to save?"
  },
  "formulas": {
    "anova_oneway": "ANOVA One-Way",
    "anova_twoway": "ANOVA Two-Way",
    "sum": "Sum",
    "average": "Average",
    "count": "Count",
    "min": "Minimum",
    "max": "Maximum"
  },
  "plurals": {
    "row_count": [
      "No rows",
      "1 row",
      "%n rows"
    ],
    "selected_items": [
      "No items selected",
      "1 item selected",
      "%n items selected"
    ],
    "changes": [
      "No changes",
      "1 change",
      "%n changes"
    ]
  },
  "errors": {
    "invalid_input": "Invalid input",
    "empty_field": "This field is required",
    "out_of_range": "Value is out of range",
    "duplicate_value": "This value already exists",
    "insufficient_data": "Insufficient data for this operation",
    "formula_error": "Formula error: %error"
  },
  "formatting": {
    "decimal_separator": ".",
    "thousands_separator": ",",
    "date_format": "MM/DD/YYYY",
    "time_format": "12h"
  }
} as const;

export default en;
