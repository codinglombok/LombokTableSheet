import type { LanguageCatalog } from '../types.js';

/** Spanish (es) catalog for I18nManager. Generated from the WS-4 locale set;
 *  edit here — this is the shipped source of truth, not a build artifact. */
const es: LanguageCatalog = {
  "language_code": "es",
  "language_name": "Español",
  "direction": "ltr",
  "plural_forms": 2,
  "ui": {
    "ok": "Aceptar",
    "cancel": "Cancelar",
    "save": "Guardar",
    "delete": "Eliminar",
    "edit": "Editar",
    "add": "Agregar",
    "close": "Cerrar",
    "yes": "Sí",
    "no": "No",
    "loading": "Cargando...",
    "error": "Error",
    "success": "Éxito",
    "warning": "Advertencia"
  },
  "messages": {
    "welcome": "Bienvenido a LombokTableSheet",
    "goodbye": "¡Gracias, adiós!",
    "no_data_available": "No hay datos disponibles",
    "operation_successful": "La operación se completó correctamente",
    "operation_failed": "La operación falló. Por favor, inténtelo de nuevo.",
    "confirm_delete": "¿Está seguro de que desea eliminar esto?",
    "unsaved_changes": "Tiene cambios sin guardar. ¿Desea guardarlos?"
  },
  "formulas": {
    "anova_oneway": "ANOVA de una vía",
    "anova_twoway": "ANOVA de dos vías",
    "sum": "Suma",
    "average": "Promedio",
    "count": "Contar",
    "min": "Mínimo",
    "max": "Máximo"
  },
  "plurals": {
    "row_count": [
      "Sin filas",
      "1 fila",
      "%n filas"
    ],
    "selected_items": [
      "Sin elementos seleccionados",
      "1 elemento seleccionado",
      "%n elementos seleccionados"
    ],
    "changes": [
      "Sin cambios",
      "1 cambio",
      "%n cambios"
    ]
  },
  "errors": {
    "invalid_input": "Entrada inválida",
    "empty_field": "Este campo es obligatorio",
    "out_of_range": "El valor está fuera de rango",
    "duplicate_value": "Este valor ya existe",
    "insufficient_data": "Datos insuficientes para esta operación",
    "formula_error": "Error de fórmula: %error"
  },
  "formatting": {
    "decimal_separator": ",",
    "thousands_separator": ".",
    "date_format": "DD/MM/YYYY",
    "time_format": "24h"
  }
} as const;

export default es;
