import { BLOCK_NAME_TOKEN } from "./constants";

/**
 * A block definition is the portable form of a block: its View (UI) and Controller (settings, script, queries).
 * It is what the LLM produces, what snapshots store and what Duplicate copies. It never contains data or
 * credentials: queries reference datasources by id, and datasources keep their credentials on the server.
 *
 * Inside a definition the block and its queries are referenced through tokens (`__block__`, `__q_<key>__`)
 * instead of entity names, so the same definition can be applied to any block. Applying a definition replaces
 * the tokens with the names of the widget, JS object and queries it creates.
 */

export type BlockSettingType = "string" | "number" | "boolean" | "select";

export interface BlockSettingField {
  type: BlockSettingType;
  title: string;
  description?: string;
  default?: unknown;
  /** Allowed values of a "select" setting. */
  options?: string[];
}

export type BlockSettingsSchema = Record<string, BlockSettingField>;

export interface KeyValuePair {
  key: string;
  value: string;
}

export const BLOCK_HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;

export type BlockHttpMethod = (typeof BLOCK_HTTP_METHODS)[number];

export interface BlockRestQuery {
  key: string;
  kind: "rest";
  /** An existing REST API datasource. When absent, `url` is the base URL of an unauthenticated API. */
  datasourceId?: string;
  url?: string;
  path: string;
  method: BlockHttpMethod;
  headers: KeyValuePair[];
  queryParameters: KeyValuePair[];
  body: string;
}

export interface BlockDatasourceQuery {
  key: string;
  kind: "datasource";
  /** An existing datasource whose plugin takes its query in the action body (SQL databases and similar). */
  datasourceId: string;
  body: string;
}

export type BlockQuery = BlockRestQuery | BlockDatasourceQuery;

export interface BlockPermissionDeclaration {
  id: string;
  description: string;
}

export type BlockPermissionStatus = "pending" | "approved" | "revoked";

export interface BlockPermission extends BlockPermissionDeclaration {
  status: BlockPermissionStatus;
}

export interface BlockView {
  html: string;
  css: string;
  js: string;
}

export interface BlockController {
  language: "javascript";
  body: string;
}

export interface BlockDataSourceRef {
  type: string;
  ref?: string;
}

export interface BlockDefinition {
  title: string;
  showTitle: boolean;
  view: BlockView;
  settingsSchema: BlockSettingsSchema;
  settings: Record<string, unknown>;
  controller: BlockController | null;
  queries: BlockQuery[];
  permissions: BlockPermissionDeclaration[];
  dataSource: BlockDataSourceRef | null;
}

export type BlockDefinitionChanges = Partial<BlockDefinition>;

export interface BlockSnapshot {
  id: string;
  name: string;
  createdAt: string;
  definition: BlockDefinition;
}

export interface BlockAgentResponse {
  reply: string;
  changes: BlockDefinitionChanges | null;
}

/** Names of the entities a definition's tokens resolve to. */
export interface BlockEntityNames {
  block: string;
  queries: Record<string, string>;
}

export class BlockDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockDefinitionError";
  }
}

// Sized so a whole definition, sent back to the agent as context, stays within the server's AI request limits.
const MAX_VIEW_PART_LENGTH = 30000;
const MAX_CONTROLLER_LENGTH = 20000;
const MAX_QUERY_BODY_LENGTH = 5000;
const MAX_QUERIES = 10;
const MAX_SETTINGS = 30;
const MAX_PERMISSIONS = 20;

const QUERY_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,29}$/;
const SETTING_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const QUERY_TOKEN_PATTERN = /__q_([A-Za-z][A-Za-z0-9_]*)__/g;

export const queryToken = (key: string) => `__q_${key}__`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  value: unknown,
  field: string,
  { fallback, max }: { fallback?: string; max: number },
): string {
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;

    throw new BlockDefinitionError(`"${field}" is missing.`);
  }

  if (typeof value !== "string") {
    throw new BlockDefinitionError(`"${field}" must be a string.`);
  }

  if (value.length > max) {
    throw new BlockDefinitionError(
      `"${field}" is longer than ${max} characters.`,
    );
  }

  return value;
}

/**
 * Extracts the JSON object from an LLM reply. Models are told to answer with the object alone, but some wrap it in
 * a fenced code block or add a sentence around it.
 */
export function extractJSONObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end <= start) {
    throw new BlockDefinitionError(
      "The response does not contain a JSON object.",
    );
  }

  return candidate.slice(start, end + 1);
}

function parseJSON(raw: string): unknown {
  try {
    return JSON.parse(extractJSONObject(raw));
  } catch (error) {
    if (error instanceof BlockDefinitionError) throw error;

    throw new BlockDefinitionError("The response is not valid JSON.");
  }
}

function normalizeView(input: unknown): BlockView {
  if (!isRecord(input)) {
    throw new BlockDefinitionError('"view" must be an object.');
  }

  return {
    html: readString(input.html, "view.html", {
      fallback: "",
      max: MAX_VIEW_PART_LENGTH,
    }),
    css: readString(input.css, "view.css", {
      fallback: "",
      max: MAX_VIEW_PART_LENGTH,
    }),
    js: readString(input.js, "view.js", {
      fallback: "",
      max: MAX_VIEW_PART_LENGTH,
    }),
  };
}

function normalizeSettingField(key: string, input: unknown): BlockSettingField {
  if (!isRecord(input)) {
    throw new BlockDefinitionError(`Setting "${key}" must be an object.`);
  }

  const type = input.type;

  if (
    type !== "string" &&
    type !== "number" &&
    type !== "boolean" &&
    type !== "select"
  ) {
    throw new BlockDefinitionError(
      `Setting "${key}" has an unsupported type. Use string, number, boolean or select.`,
    );
  }

  const field: BlockSettingField = {
    type,
    title: readString(input.title, `settingsSchema.${key}.title`, {
      fallback: key,
      max: 200,
    }),
  };

  if (typeof input.description === "string") {
    field.description = input.description.slice(0, 500);
  }

  if (type === "select") {
    if (!Array.isArray(input.options) || input.options.length === 0) {
      throw new BlockDefinitionError(
        `Setting "${key}" is a select and needs a non-empty "options" list.`,
      );
    }

    field.options = input.options.map((option) => String(option));
  }

  if (input.default !== undefined) {
    field.default = coerceSettingValue(field, input.default);
  }

  return field;
}

export function normalizeSettingsSchema(input: unknown): BlockSettingsSchema {
  if (input === undefined || input === null) return {};

  if (!isRecord(input)) {
    throw new BlockDefinitionError('"settingsSchema" must be an object.');
  }

  const keys = Object.keys(input);

  if (keys.length > MAX_SETTINGS) {
    throw new BlockDefinitionError(
      `A block can have at most ${MAX_SETTINGS} settings.`,
    );
  }

  const schema: BlockSettingsSchema = {};

  keys.forEach((key) => {
    if (!SETTING_KEY_PATTERN.test(key)) {
      throw new BlockDefinitionError(
        `Setting name "${key}" must be a valid identifier.`,
      );
    }

    schema[key] = normalizeSettingField(key, input[key]);
  });

  return schema;
}

/** Converts a value to the type its setting declares. Values that cannot be converted are returned unchanged. */
export function coerceSettingValue(
  field: BlockSettingField,
  value: unknown,
): unknown {
  switch (field.type) {
    case "number": {
      if (typeof value === "number") return value;

      const parsed = typeof value === "string" ? Number(value) : NaN;

      return value !== "" && Number.isFinite(parsed) ? parsed : value;
    }
    case "boolean":
      if (value === "true") return true;

      if (value === "false") return false;

      return value;
    case "string":
    case "select":
      return typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : value;
    default:
      return value;
  }
}

/** Settings with every declared setting present: values the input lacks take the schema's default. */
export function normalizeSettings(
  input: unknown,
  schema: BlockSettingsSchema,
): Record<string, unknown> {
  if (input !== undefined && input !== null && !isRecord(input)) {
    throw new BlockDefinitionError('"settings" must be an object.');
  }

  const settings: Record<string, unknown> = { ...(input || {}) };

  Object.entries(schema).forEach(([key, field]) => {
    if (settings[key] === undefined && field.default !== undefined) {
      settings[key] = field.default;
    }

    if (settings[key] !== undefined) {
      settings[key] = coerceSettingValue(field, settings[key]);
    }
  });

  return settings;
}

function normalizeController(input: unknown): BlockController | null {
  if (input === undefined || input === null) return null;

  if (typeof input === "string") {
    return {
      language: "javascript",
      body: readString(input, "controller", { max: MAX_CONTROLLER_LENGTH }),
    };
  }

  if (!isRecord(input)) {
    throw new BlockDefinitionError('"controller" must be an object.');
  }

  if (input.language !== undefined && input.language !== "javascript") {
    throw new BlockDefinitionError(
      "Only JavaScript controllers are supported.",
    );
  }

  const body = readString(input.body, "controller.body", {
    max: MAX_CONTROLLER_LENGTH,
  });

  if (!body.trim()) return null;

  if (!/export\s+default\s*\{/.test(body)) {
    throw new BlockDefinitionError(
      'The controller must be a JS object: "export default { ... }".',
    );
  }

  return { language: "javascript", body };
}

function normalizeKeyValuePairs(input: unknown, field: string): KeyValuePair[] {
  if (input === undefined || input === null) return [];

  if (!Array.isArray(input)) {
    throw new BlockDefinitionError(`"${field}" must be a list.`);
  }

  return input
    .filter(isRecord)
    .map((pair) => ({
      key: String(pair.key ?? "").trim(),
      value: pair.value === undefined ? "" : String(pair.value),
    }))
    .filter((pair) => pair.key !== "");
}

function normalizeQuery(input: unknown, index: number): BlockQuery {
  if (!isRecord(input)) {
    throw new BlockDefinitionError(`Query ${index + 1} must be an object.`);
  }

  const key = readString(input.key, `queries[${index}].key`, { max: 30 });

  if (!QUERY_KEY_PATTERN.test(key)) {
    throw new BlockDefinitionError(
      `Query key "${key}" must start with a letter and contain only letters, digits and underscores.`,
    );
  }

  const datasourceId =
    typeof input.datasourceId === "string" && input.datasourceId.trim()
      ? input.datasourceId.trim()
      : undefined;
  const body = readString(input.body, `queries[${index}].body`, {
    fallback: "",
    max: MAX_QUERY_BODY_LENGTH,
  });

  if (input.kind === "datasource") {
    if (!datasourceId) {
      throw new BlockDefinitionError(
        `Query "${key}" uses a datasource but has no "datasourceId".`,
      );
    }

    return { key, kind: "datasource", datasourceId, body };
  }

  if (input.kind !== "rest") {
    throw new BlockDefinitionError(
      `Query "${key}" has an unsupported kind. Use "rest" or "datasource".`,
    );
  }

  const method = String(input.method || "GET").toUpperCase();

  if (!(BLOCK_HTTP_METHODS as readonly string[]).includes(method)) {
    throw new BlockDefinitionError(
      `Query "${key}" has an unsupported HTTP method "${method}".`,
    );
  }

  const query: BlockRestQuery = {
    key,
    kind: "rest",
    path: readString(input.path, `queries[${index}].path`, {
      fallback: "",
      max: 2000,
    }),
    method: method as BlockHttpMethod,
    headers: normalizeKeyValuePairs(input.headers, `queries[${index}].headers`),
    queryParameters: normalizeKeyValuePairs(
      input.queryParameters,
      `queries[${index}].queryParameters`,
    ),
    body,
  };

  if (datasourceId) {
    query.datasourceId = datasourceId;

    return query;
  }

  const url = readString(input.url, `queries[${index}].url`, {
    fallback: "",
    max: 2000,
  }).trim();

  if (!url) {
    throw new BlockDefinitionError(
      `Query "${key}" needs either a "datasourceId" or a "url".`,
    );
  }

  return splitRestUrl({ ...query, url });
}

/**
 * Moves the path and query string of a full URL out of `url`, so `url` holds only the origin, the way the REST API
 * plugin stores an embedded datasource. URLs that contain bindings are left as they are.
 */
function splitRestUrl(query: BlockRestQuery): BlockRestQuery {
  if (!query.url || query.url.includes("{{")) return query;

  let parsed: URL;

  try {
    parsed = new URL(query.url);
  } catch {
    throw new BlockDefinitionError(
      `Query "${query.key}" has an invalid URL "${query.url}".`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BlockDefinitionError(
      `Query "${query.key}" must use an http or https URL.`,
    );
  }

  const urlPath = parsed.pathname === "/" ? "" : parsed.pathname;
  const extraParameters: KeyValuePair[] = [];

  parsed.searchParams.forEach((value, key) => {
    extraParameters.push({ key, value });
  });

  return {
    ...query,
    url: parsed.origin,
    path: urlPath + query.path,
    queryParameters: [...extraParameters, ...query.queryParameters],
  };
}

function normalizeQueries(input: unknown): BlockQuery[] {
  if (input === undefined || input === null) return [];

  if (!Array.isArray(input)) {
    throw new BlockDefinitionError('"queries" must be a list.');
  }

  if (input.length > MAX_QUERIES) {
    throw new BlockDefinitionError(
      `A block can have at most ${MAX_QUERIES} queries.`,
    );
  }

  const queries = input.map(normalizeQuery);
  const keys = new Set<string>();

  queries.forEach((query) => {
    if (keys.has(query.key)) {
      throw new BlockDefinitionError(`Query key "${query.key}" is duplicated.`);
    }

    keys.add(query.key);
  });

  return queries;
}

export function normalizePermissions(
  input: unknown,
): BlockPermissionDeclaration[] {
  if (input === undefined || input === null) return [];

  if (!Array.isArray(input)) {
    throw new BlockDefinitionError('"permissions" must be a list.');
  }

  const permissions = new Map<string, BlockPermissionDeclaration>();

  input.forEach((entry) => {
    const declaration =
      typeof entry === "string" ? { id: entry, description: "" } : entry;

    if (!isRecord(declaration) || typeof declaration.id !== "string") return;

    const id = declaration.id.trim().slice(0, 200);

    if (!id) return;

    permissions.set(id, {
      id,
      description:
        typeof declaration.description === "string"
          ? declaration.description.slice(0, 500)
          : "",
    });
  });

  if (permissions.size > MAX_PERMISSIONS) {
    throw new BlockDefinitionError(
      `A block can declare at most ${MAX_PERMISSIONS} permissions.`,
    );
  }

  return Array.from(permissions.values());
}

function normalizeDataSource(input: unknown): BlockDataSourceRef | null {
  if (!isRecord(input) || typeof input.type !== "string") return null;

  return {
    type: input.type.slice(0, 100),
    ...(typeof input.ref === "string" ? { ref: input.ref.slice(0, 200) } : {}),
  };
}

/** Checks that every `__q_<key>__` token in the controller names a declared query. */
function assertQueryTokensResolve(definition: BlockDefinitionChanges) {
  if (!definition.controller || !definition.queries) return;

  const keys = new Set(definition.queries.map((query) => query.key));

  for (const match of definition.controller.body.matchAll(
    QUERY_TOKEN_PATTERN,
  )) {
    if (!keys.has(match[1])) {
      throw new BlockDefinitionError(
        `The controller references query "${match[1]}", which is not declared in "queries".`,
      );
    }
  }
}

export function normalizeBlockDefinition(input: unknown): BlockDefinition {
  if (!isRecord(input)) {
    throw new BlockDefinitionError("The block definition must be an object.");
  }

  const settingsSchema = normalizeSettingsSchema(input.settingsSchema);
  const definition: BlockDefinition = {
    title: readString(input.title, "title", { fallback: "", max: 200 }),
    showTitle: input.showTitle === undefined ? true : Boolean(input.showTitle),
    view: normalizeView(input.view),
    settingsSchema,
    settings: normalizeSettings(input.settings, settingsSchema),
    controller: normalizeController(input.controller),
    queries: normalizeQueries(input.queries),
    permissions: normalizePermissions(input.permissions),
    dataSource: normalizeDataSource(input.dataSource),
  };

  if (!definition.view.html.trim() && !definition.view.js.trim()) {
    throw new BlockDefinitionError("The view has no HTML or JavaScript.");
  }

  assertQueryTokensResolve(definition);

  return definition;
}

/**
 * Normalizes the subset of a definition an agent changed. `settingsSchema` and `settings` are validated against
 * each other using the current definition for whichever of the two the agent left out.
 */
export function normalizeBlockDefinitionChanges(
  input: unknown,
  current: BlockDefinition,
): BlockDefinitionChanges {
  if (!isRecord(input)) {
    throw new BlockDefinitionError('"changes" must be an object.');
  }

  const changes: BlockDefinitionChanges = {};

  if (input.title !== undefined) {
    changes.title = readString(input.title, "title", { max: 200 });
  }

  if (input.showTitle !== undefined) {
    changes.showTitle = Boolean(input.showTitle);
  }

  if (input.view !== undefined) {
    changes.view = normalizeView({
      ...current.view,
      ...(input.view as object),
    });
  }

  if (input.settingsSchema !== undefined) {
    changes.settingsSchema = normalizeSettingsSchema(input.settingsSchema);
  }

  if (input.settings !== undefined || changes.settingsSchema) {
    changes.settings = normalizeSettings(
      input.settings ?? current.settings,
      changes.settingsSchema ?? current.settingsSchema,
    );
  }

  if (input.controller !== undefined) {
    changes.controller = normalizeController(input.controller);
  }

  if (input.queries !== undefined) {
    changes.queries = normalizeQueries(input.queries);
  }

  if (input.permissions !== undefined) {
    changes.permissions = normalizePermissions(input.permissions);
  }

  if (input.dataSource !== undefined) {
    changes.dataSource = normalizeDataSource(input.dataSource);
  }

  assertQueryTokensResolve({
    controller:
      changes.controller !== undefined
        ? changes.controller
        : current.controller,
    queries: changes.queries ?? current.queries,
  });

  return changes;
}

export function parseBlockGenerationResponse(raw: string): BlockDefinition {
  return normalizeBlockDefinition(parseJSON(raw));
}

export function parseBlockAgentResponse(
  raw: string,
  current: BlockDefinition,
): BlockAgentResponse {
  const parsed = parseJSON(raw);

  if (!isRecord(parsed)) {
    throw new BlockDefinitionError("The agent response must be an object.");
  }

  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : "Done.";
  const hasChanges =
    isRecord(parsed.changes) && Object.keys(parsed.changes).length > 0;

  return {
    reply,
    changes: hasChanges
      ? normalizeBlockDefinitionChanges(parsed.changes, current)
      : null,
  };
}

export function applyBlockDefinitionChanges(
  current: BlockDefinition,
  changes: BlockDefinitionChanges,
): BlockDefinition {
  return { ...current, ...changes };
}

/** Replaces the tokens in a definition string with the names of the entities they resolve to. */
export function materializeBlockText(
  text: string,
  names: BlockEntityNames,
): string {
  return text
    .replace(QUERY_TOKEN_PATTERN, (match, key: string) =>
      names.queries[key] ? names.queries[key] : match,
    )
    .split(BLOCK_NAME_TOKEN)
    .join(names.block);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces entity names in a string with tokens. The inverse of {@link materializeBlockText}. */
export function tokenizeBlockText(
  text: string,
  names: BlockEntityNames,
): string {
  const replacements: Array<[string, string]> = [
    [names.block, BLOCK_NAME_TOKEN] as [string, string],
    ...Object.entries(names.queries).map(
      ([key, name]) => [name, queryToken(key)] as [string, string],
    ),
  ]
    .filter(([name]) => Boolean(name))
    // Longest first, so "Block1_fetch" is replaced before "Block1".
    .sort((a, b) => b[0].length - a[0].length);

  return replacements.reduce(
    (result, [name, token]) =>
      result.replace(
        new RegExp(
          `(?<![A-Za-z0-9_$])${escapeRegExp(name)}(?![A-Za-z0-9_$])`,
          "g",
        ),
        token,
      ),
    text,
  );
}

function mapQueryStrings(
  query: BlockQuery,
  transform: (value: string) => string,
): BlockQuery {
  if (query.kind === "datasource") {
    return { ...query, body: transform(query.body) };
  }

  const mapPairs = (pairs: KeyValuePair[]) =>
    pairs.map((pair) => ({
      key: transform(pair.key),
      value: transform(pair.value),
    }));

  return {
    ...query,
    ...(query.url !== undefined ? { url: transform(query.url) } : {}),
    path: transform(query.path),
    headers: mapPairs(query.headers),
    queryParameters: mapPairs(query.queryParameters),
    body: transform(query.body),
  };
}

export function materializeBlockQuery(
  query: BlockQuery,
  names: BlockEntityNames,
): BlockQuery {
  return mapQueryStrings(query, (value) => materializeBlockText(value, names));
}

export function tokenizeBlockQuery(
  query: BlockQuery,
  names: BlockEntityNames,
): BlockQuery {
  return mapQueryStrings(query, (value) => tokenizeBlockText(value, names));
}

/**
 * Merges newly declared permissions into the block's current ones. Permissions the block already had keep their
 * status; new ones start as pending until the user approves them. Permissions no longer declared are dropped.
 */
export function mergePermissions(
  current: BlockPermission[],
  declared: BlockPermissionDeclaration[],
): BlockPermission[] {
  const currentById = new Map(current.map((p) => [p.id, p]));

  return declared.map((declaration) => {
    const existing = currentById.get(declaration.id);

    return {
      ...declaration,
      status: existing ? existing.status : "pending",
    };
  });
}

export function hasUnapprovedPermissions(
  permissions: BlockPermission[] | undefined,
): boolean {
  return (permissions || []).some(
    (permission) => permission.status !== "approved",
  );
}
