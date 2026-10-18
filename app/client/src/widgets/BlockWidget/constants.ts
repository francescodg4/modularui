// Constants shared by the Block widget, its component, the block sagas and the widget operation sagas.
// Keep this file free of heavy imports: WidgetOperationSagas imports it.

export const BLOCK_WIDGET_TYPE = "BLOCK_WIDGET";

export const BlockState = {
  EMPTY: "empty",
  READY: "ready",
} as const;

export type BlockStateType = (typeof BlockState)[keyof typeof BlockState];

/** Placeholder for the block widget's name in a portable block definition. */
export const BLOCK_NAME_TOKEN = "__block__";

/** Event the block's view sends with `appsmith.triggerEvent` to re-run the controller. */
export const BLOCK_REFRESH_EVENT = "refresh";

export const MAX_BLOCK_SNAPSHOTS = 20;
export const MAX_BLOCK_LOGS = 200;
export const MAX_BLOCK_CHAT_MESSAGES = 40;

/**
 * Block properties that hold the block's own data (its view source, settings, snapshots, ...). They are literal
 * values: a `{{ }}` inside them, for example in a snapshot of a query that binds a setting, must never be turned into
 * a widget binding when the property is updated.
 */
export const BLOCK_LITERAL_PROPERTY_PATHS = [
  "srcDoc",
  "settings",
  "settingsSchema",
  "blockQueries",
  "blockPermissions",
  "blockDataSource",
  "blockSnapshots",
];

export function isBlockLiteralPropertyPath(propertyPath: string): boolean {
  return BLOCK_LITERAL_PROPERTY_PATHS.some(
    (path) =>
      propertyPath === path ||
      propertyPath.startsWith(path + ".") ||
      propertyPath.startsWith(path + "["),
  );
}
