import type { LanguageCatalog } from '../types.js';

/** German (de) catalog for I18nManager. Generated from the WS-4 locale set;
 *  edit here — this is the shipped source of truth, not a build artifact. */
const de: LanguageCatalog = {
  "language_code": "de",
  "language_name": "Deutsch",
  "direction": "ltr",
  "plural_forms": 2,
  "ui": {
    "ok": "OK",
    "cancel": "Abbrechen",
    "save": "Speichern",
    "delete": "Löschen",
    "edit": "Bearbeiten",
    "add": "Hinzufügen",
    "close": "Schließen",
    "yes": "Ja",
    "no": "Nein",
    "loading": "Wird geladen...",
    "error": "Fehler",
    "success": "Erfolg",
    "warning": "Warnung"
  },
  "messages": {
    "welcome": "Willkommen bei LombokTableSheet",
    "goodbye": "Danke, auf Wiedersehen!",
    "no_data_available": "Keine Daten verfügbar",
    "operation_successful": "Operation erfolgreich abgeschlossen",
    "operation_failed": "Operation fehlgeschlagen. Bitte versuchen Sie es erneut.",
    "confirm_delete": "Möchten Sie das wirklich löschen?",
    "unsaved_changes": "Sie haben ungespeicherte Änderungen. Möchten Sie diese speichern?"
  },
  "formulas": {
    "anova_oneway": "ANOVA Einfaktor",
    "anova_twoway": "ANOVA Zweifaktor",
    "sum": "Summe",
    "average": "Durchschnitt",
    "count": "Anzahl",
    "min": "Minimum",
    "max": "Maximum"
  },
  "plurals": {
    "row_count": [
      "Keine Zeilen",
      "1 Zeile",
      "%n Zeilen"
    ],
    "selected_items": [
      "Keine Elemente ausgewählt",
      "1 Element ausgewählt",
      "%n Elemente ausgewählt"
    ],
    "changes": [
      "Keine Änderungen",
      "1 Änderung",
      "%n Änderungen"
    ]
  },
  "errors": {
    "invalid_input": "Ungültige Eingabe",
    "empty_field": "Dieses Feld ist erforderlich",
    "out_of_range": "Der Wert ist außerhalb des Bereichs",
    "duplicate_value": "Dieser Wert existiert bereits",
    "insufficient_data": "Unzureichende Daten für diesen Vorgang",
    "formula_error": "Formelfehler: %error"
  },
  "formatting": {
    "decimal_separator": ",",
    "thousands_separator": ".",
    "date_format": "DD.MM.YYYY",
    "time_format": "24h"
  }
} as const;

export default de;
