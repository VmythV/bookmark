/**
 * JSON schemas for LLM structured outputs (OpenAI-compatible json_schema mode).
 * See docs/detailed-design.md §8.
 *
 * Strict mode requires every property to be listed in `required` and
 * `additionalProperties: false`; optional fields are modeled as nullable.
 */

/** response_format for the save recommendation. */
export const SAVE_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'save_recommendation',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['use_existing', 'create_new'] },
        folderId: {
          type: ['string', 'null'],
          description: 'Id of the chosen existing folder; null when creating new.',
        },
        newFolderPath: {
          type: ['string', 'null'],
          description:
            'Slash-separated path for a new folder, e.g. "Dev/Rust"; null when using existing.',
        },
        confidence: { type: 'number', description: '0..1 confidence.' },
        reason: { type: 'string', description: 'Short justification.' },
      },
      required: ['action', 'folderId', 'newFolderPath', 'confidence', 'reason'],
      additionalProperties: false,
    },
  },
} as const;

/** response_format for naming a cluster of bookmarks during reorganization (M5). */
export const FOLDER_NAME_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'folder_name',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        folderName: { type: 'string', description: 'A concise folder name.' },
      },
      required: ['folderName'],
      additionalProperties: false,
    },
  },
} as const;
