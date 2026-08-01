import type { LanguageCatalog } from '../types.js';

/** French (fr) catalog for I18nManager. Generated from the WS-4 locale set;
 *  edit here — this is the shipped source of truth, not a build artifact. */
const fr: LanguageCatalog = {
  "language_code": "fr",
  "language_name": "Français",
  "direction": "ltr",
  "plural_forms": 2,
  "ui": {
    "ok": "OK",
    "cancel": "Annuler",
    "save": "Enregistrer",
    "delete": "Supprimer",
    "edit": "Modifier",
    "add": "Ajouter",
    "close": "Fermer",
    "yes": "Oui",
    "no": "Non",
    "loading": "Chargement en cours...",
    "error": "Erreur",
    "success": "Succès",
    "warning": "Avertissement"
  },
  "messages": {
    "welcome": "Bienvenue dans LombokTableSheet",
    "goodbye": "Merci, au revoir!",
    "no_data_available": "Aucune donnée disponible",
    "operation_successful": "Opération réussie",
    "operation_failed": "L'opération a échoué. Veuillez réessayer.",
    "confirm_delete": "Êtes-vous sûr de vouloir supprimer cela?",
    "unsaved_changes": "Vous avez des modifications non enregistrées. Voulez-vous les enregistrer?"
  },
  "formulas": {
    "anova_oneway": "ANOVA à une voie",
    "anova_twoway": "ANOVA à deux voies",
    "sum": "Somme",
    "average": "Moyenne",
    "count": "Compteur",
    "min": "Minimum",
    "max": "Maximum"
  },
  "plurals": {
    "row_count": [
      "Aucune ligne",
      "1 ligne",
      "%n lignes"
    ],
    "selected_items": [
      "Aucun élément sélectionné",
      "1 élément sélectionné",
      "%n éléments sélectionnés"
    ],
    "changes": [
      "Aucun changement",
      "1 changement",
      "%n changements"
    ]
  },
  "errors": {
    "invalid_input": "Entrée invalide",
    "empty_field": "Ce champ est obligatoire",
    "out_of_range": "La valeur est hors limites",
    "duplicate_value": "Cette valeur existe déjà",
    "insufficient_data": "Données insuffisantes pour cette opération",
    "formula_error": "Erreur de formule: %error"
  },
  "formatting": {
    "decimal_separator": ",",
    "thousands_separator": " ",
    "date_format": "DD/MM/YYYY",
    "time_format": "24h"
  }
} as const;

export default fr;
