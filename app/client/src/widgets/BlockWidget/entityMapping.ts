import type { Action, ApiActionConfig, Property } from "entities/Action";
import { PluginType } from "entities/Plugin";
import { DEFAULT_DATASOURCE_NAME } from "PluginActionEditor/constants/ApiEditorConstants";
import {
  HTTP_METHODS_DEFAULT_FORMAT_TYPES,
  type HTTP_METHOD,
} from "PluginActionEditor/constants/CommonApiConstants";
import {
  BLOCK_HTTP_METHODS,
  type BlockHttpMethod,
  type BlockQuery,
  type BlockRestQuery,
  type KeyValuePair,
} from "./definition";

/** The fields of a REST action's configuration that a block query sets. */
export function restQueryToActionConfiguration(
  query: BlockRestQuery,
): Partial<ApiActionConfig> {
  return {
    httpMethod: query.method,
    path: query.path,
    headers: query.headers,
    queryParameters: query.queryParameters,
    body: query.body,
    formData: {
      apiContentType:
        HTTP_METHODS_DEFAULT_FORMAT_TYPES[query.method as HTTP_METHOD],
    },
  };
}

function toKeyValuePairs(properties: Property[] | undefined): KeyValuePair[] {
  return (properties || [])
    .filter((property) => property && property.key && property.key.trim())
    .map((property) => ({
      key: property.key,
      value: property.value === undefined ? "" : String(property.value),
    }));
}

function bodyToString(body: unknown): string {
  if (body === undefined || body === null) return "";

  return typeof body === "string" ? body : JSON.stringify(body);
}

/**
 * Reads a block query back from the action it was applied to, so snapshots and the agent see edits the user made
 * in the query editor. Returns null for actions a block cannot describe (SaaS plugins with form-based queries).
 */
export function actionToBlockQuery(
  action: Action,
  key: string,
): BlockQuery | null {
  if (action.pluginType === PluginType.API) {
    const config = action.actionConfiguration as ApiActionConfig;
    const method = String(config.httpMethod || "GET").toUpperCase();
    const datasource = action.datasource as {
      id?: string;
      name?: string;
      datasourceConfiguration?: { url?: string };
    };
    const isEmbedded =
      !datasource?.id || datasource.name === DEFAULT_DATASOURCE_NAME;

    const query: BlockRestQuery = {
      key,
      kind: "rest",
      path: config.path || "",
      method: (BLOCK_HTTP_METHODS as readonly string[]).includes(method)
        ? (method as BlockHttpMethod)
        : "GET",
      headers: toKeyValuePairs(config.headers),
      queryParameters: toKeyValuePairs(config.queryParameters),
      body: bodyToString(config.body),
    };

    if (isEmbedded) {
      query.url = datasource?.datasourceConfiguration?.url || "";
    } else {
      query.datasourceId = datasource.id;
    }

    return query;
  }

  if (action.pluginType === PluginType.DB && action.datasource?.id) {
    return {
      key,
      kind: "datasource",
      datasourceId: action.datasource.id,
      body: bodyToString(
        (action.actionConfiguration as { body?: unknown }).body,
      ),
    };
  }

  return null;
}
