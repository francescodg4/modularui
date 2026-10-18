import type { Action } from "entities/Action";
import { PluginType } from "entities/Plugin";
import {
  actionToBlockQuery,
  restQueryToActionConfiguration,
} from "./entityMapping";
import { isBlockLiteralPropertyPath } from "./constants";

function action(overrides: Record<string, unknown>): Action {
  return {
    id: "a1",
    baseId: "a1",
    name: "Block1_forecast",
    ...overrides,
  } as unknown as Action;
}

describe("actionToBlockQuery", () => {
  it("reads an API with an embedded datasource as a REST query with a URL", () => {
    const query = actionToBlockQuery(
      action({
        pluginType: PluginType.API,
        datasource: {
          name: "DEFAULT_REST_DATASOURCE",
          datasourceConfiguration: { url: "https://api.example.com" },
        },
        actionConfiguration: {
          httpMethod: "GET",
          path: "/v1/items",
          headers: [
            { key: "", value: "" },
            { key: "Accept", value: "application/json" },
          ],
          queryParameters: [{ key: "q", value: "{{this.params.q}}" }],
          body: "",
        },
      }),
      "items",
    );

    expect(query).toEqual({
      key: "items",
      kind: "rest",
      url: "https://api.example.com",
      path: "/v1/items",
      method: "GET",
      headers: [{ key: "Accept", value: "application/json" }],
      queryParameters: [{ key: "q", value: "{{this.params.q}}" }],
      body: "",
    });
  });

  it("reads an API on a saved datasource as a REST query with the datasource id", () => {
    const query = actionToBlockQuery(
      action({
        pluginType: PluginType.API,
        datasource: { id: "ds1", name: "Weather API" },
        actionConfiguration: {
          httpMethod: "POST",
          path: "/search",
          body: { city: "Rome" },
        },
      }),
      "search",
    );

    expect(query).toMatchObject({
      kind: "rest",
      datasourceId: "ds1",
      method: "POST",
      body: '{"city":"Rome"}',
    });
    expect(query).not.toHaveProperty("url");
  });

  it("reads a database query", () => {
    expect(
      actionToBlockQuery(
        action({
          pluginType: PluginType.DB,
          datasource: { id: "pg1", name: "Orders DB" },
          actionConfiguration: { body: "SELECT 1" },
        }),
        "orders",
      ),
    ).toEqual({
      key: "orders",
      kind: "datasource",
      datasourceId: "pg1",
      body: "SELECT 1",
    });
  });

  it("returns null for plugins a block cannot describe", () => {
    expect(
      actionToBlockQuery(
        action({ pluginType: PluginType.SAAS, actionConfiguration: {} }),
        "sheet",
      ),
    ).toBeNull();
  });
});

describe("restQueryToActionConfiguration", () => {
  it("sets the content type that matches the HTTP method", () => {
    expect(
      restQueryToActionConfiguration({
        key: "k",
        kind: "rest",
        url: "https://a.com",
        path: "/x",
        method: "POST",
        headers: [],
        queryParameters: [],
        body: "{}",
      }),
    ).toMatchObject({
      httpMethod: "POST",
      path: "/x",
      body: "{}",
      formData: { apiContentType: "application/json" },
    });
  });
});

describe("isBlockLiteralPropertyPath", () => {
  it.each([
    ["srcDoc.js", true],
    ["settings", true],
    ["settings.city", true],
    ["blockSnapshots[0].definition.view.js", true],
    ["blockSnapshots.0.name", true],
    ["controllerState", false],
    ["onRefresh", false],
    ["settingsSchemaExtra", false],
    ["title", false],
  ])("%s -> %s", (path, expected) => {
    expect(isBlockLiteralPropertyPath(path)).toBe(expected);
  });
});
