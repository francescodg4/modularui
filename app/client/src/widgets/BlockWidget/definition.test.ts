import {
  applyBlockDefinitionChanges,
  BlockDefinitionError,
  extractJSONObject,
  hasUnapprovedPermissions,
  materializeBlockQuery,
  materializeBlockText,
  mergePermissions,
  normalizeBlockDefinition,
  parseBlockAgentResponse,
  parseBlockGenerationResponse,
  tokenizeBlockQuery,
  tokenizeBlockText,
  type BlockDefinition,
  type BlockEntityNames,
  type BlockRestQuery,
} from "./definition";

const CONTROLLER = `export default {
  data: null,
  error: null,
  logs: [],
  updatedAt: null,
  async run() {
    const s = __block__.settings;
    this.data = await __q_forecast__.run({ lat: s.latitude });
    return this.data;
  },
};`;

function generated(overrides: Record<string, unknown> = {}) {
  return {
    title: "Weather",
    view: { html: "<div id='app'></div>", css: "", js: "render()" },
    settingsSchema: {
      latitude: { type: "number", title: "Latitude", default: 41.9 },
      units: {
        type: "select",
        title: "Units",
        options: ["metric", "imperial"],
        default: "metric",
      },
      refreshMinutes: { type: "number", title: "Refresh", default: "30" },
    },
    settings: { latitude: "45.4" },
    controller: { language: "javascript", body: CONTROLLER },
    queries: [
      {
        key: "forecast",
        kind: "rest",
        url: "https://api.open-meteo.com/v1/forecast?daily=temperature_2m_max",
        method: "get",
        queryParameters: [{ key: "latitude", value: "{{this.params.lat}}" }],
      },
    ],
    permissions: ["network:api.open-meteo.com"],
    dataSource: { type: "api", ref: "api.open-meteo.com" },
    ...overrides,
  };
}

const NAMES: BlockEntityNames = {
  block: "Block1",
  queries: { forecast: "Block1_forecast" },
};

describe("parseBlockGenerationResponse", () => {
  it("parses a definition wrapped in a fenced code block with surrounding text", () => {
    const raw =
      "Here is the block:\n```json\n" +
      JSON.stringify(generated()) +
      "\n```\nEnjoy.";

    const definition = parseBlockGenerationResponse(raw);

    expect(definition.title).toBe("Weather");
    expect(definition.showTitle).toBe(true);
    expect(definition.controller?.body).toBe(CONTROLLER);
  });

  it("fills settings from schema defaults and coerces them to the declared types", () => {
    const definition = parseBlockGenerationResponse(
      JSON.stringify(generated()),
    );

    expect(definition.settings).toEqual({
      latitude: 45.4,
      units: "metric",
      refreshMinutes: 30,
    });
  });

  it("moves the path and query string of a full URL out of the base URL", () => {
    const definition = parseBlockGenerationResponse(
      JSON.stringify(generated()),
    );
    const query = definition.queries[0] as BlockRestQuery;

    expect(query.url).toBe("https://api.open-meteo.com");
    expect(query.path).toBe("/v1/forecast");
    expect(query.method).toBe("GET");
    expect(query.queryParameters).toEqual([
      { key: "daily", value: "temperature_2m_max" },
      { key: "latitude", value: "{{this.params.lat}}" },
    ]);
  });

  it("accepts permissions given as plain strings", () => {
    const definition = parseBlockGenerationResponse(
      JSON.stringify(generated()),
    );

    expect(definition.permissions).toEqual([
      { id: "network:api.open-meteo.com", description: "" },
    ]);
  });

  it.each([
    [{ view: { html: "", js: "" } }, "The view has no HTML or JavaScript."],
    [
      { queries: [] },
      'The controller references query "forecast", which is not declared in "queries".',
    ],
    [
      { queries: [{ key: "forecast", kind: "graphql" }] },
      'Query "forecast" has an unsupported kind. Use "rest" or "datasource".',
    ],
    [
      { queries: [{ key: "forecast", kind: "rest", path: "/x" }] },
      'Query "forecast" needs either a "datasourceId" or a "url".',
    ],
    [
      {
        queries: [{ key: "forecast", kind: "rest", url: "ftp://example.com" }],
      },
      'Query "forecast" must use an http or https URL.',
    ],
    [
      { queries: [{ key: "forecast", kind: "datasource", body: "SELECT 1" }] },
      'Query "forecast" uses a datasource but has no "datasourceId".',
    ],
    [
      { queries: [{ key: "1bad", kind: "rest", url: "https://a.com" }] },
      'Query key "1bad" must start with a letter and contain only letters, digits and underscores.',
    ],
    [
      { controller: { language: "python", body: "print()" } },
      "Only JavaScript controllers are supported.",
    ],
    [
      { controller: { body: "const x = 1;" } },
      'The controller must be a JS object: "export default { ... }".',
    ],
    [
      { settingsSchema: { mode: { type: "select", title: "Mode" } } },
      'Setting "mode" is a select and needs a non-empty "options" list.',
    ],
    [
      { settingsSchema: { "bad-name": { type: "string" } } },
      'Setting name "bad-name" must be a valid identifier.',
    ],
  ])("rejects an invalid definition (%#)", (overrides, message) => {
    expect(() =>
      parseBlockGenerationResponse(JSON.stringify(generated(overrides))),
    ).toThrow(new BlockDefinitionError(message));
  });

  it("rejects a reply without a JSON object", () => {
    expect(() =>
      parseBlockGenerationResponse("Sorry, I cannot do that."),
    ).toThrow(
      new BlockDefinitionError("The response does not contain a JSON object."),
    );
  });

  it("rejects malformed JSON", () => {
    expect(() => parseBlockGenerationResponse("{ title: 'x' }")).toThrow(
      new BlockDefinitionError("The response is not valid JSON."),
    );
  });

  it("allows a block without a controller or queries", () => {
    const definition = parseBlockGenerationResponse(
      JSON.stringify(generated({ controller: null, queries: [] })),
    );

    expect(definition.controller).toBeNull();
    expect(definition.queries).toEqual([]);
  });
});

describe("extractJSONObject", () => {
  it("returns the outermost object", () => {
    expect(extractJSONObject('text {"a":{"b":1}} more')).toBe('{"a":{"b":1}}');
  });
});

describe("parseBlockAgentResponse", () => {
  const current: BlockDefinition = normalizeBlockDefinition(generated());

  it("returns no changes for a plain answer", () => {
    expect(
      parseBlockAgentResponse(
        JSON.stringify({
          reply: "It refreshes every 30 minutes.",
          changes: null,
        }),
        current,
      ),
    ).toEqual({ reply: "It refreshes every 30 minutes.", changes: null });
  });

  it("treats an empty changes object as no changes", () => {
    expect(
      parseBlockAgentResponse(
        JSON.stringify({ reply: "Ok", changes: {} }),
        current,
      ).changes,
    ).toBeNull();
  });

  it("merges a partial view change with the current view", () => {
    const { changes } = parseBlockAgentResponse(
      JSON.stringify({
        reply: "Blue now.",
        changes: { view: { css: "a{color:blue}" } },
      }),
      current,
    );

    expect(changes?.view).toEqual({ ...current.view, css: "a{color:blue}" });
  });

  it("validates new settings against the current schema", () => {
    const { changes } = parseBlockAgentResponse(
      JSON.stringify({
        reply: "Done",
        changes: { settings: { latitude: "10" } },
      }),
      current,
    );

    expect(changes?.settings).toMatchObject({ latitude: 10, units: "metric" });
  });

  it("rejects removing a query the current controller still uses", () => {
    expect(() =>
      parseBlockAgentResponse(
        JSON.stringify({ reply: "Removed", changes: { queries: [] } }),
        current,
      ),
    ).toThrow(
      new BlockDefinitionError(
        'The controller references query "forecast", which is not declared in "queries".',
      ),
    );
  });

  it("applies changes over the current definition", () => {
    const next = applyBlockDefinitionChanges(current, { title: "Forecast" });

    expect(next).toEqual({ ...current, title: "Forecast" });
  });
});

describe("tokens", () => {
  it("replaces block and query tokens with entity names", () => {
    expect(materializeBlockText(CONTROLLER, NAMES)).toContain(
      "Block1.settings",
    );
    expect(materializeBlockText(CONTROLLER, NAMES)).toContain(
      "await Block1_forecast.run(",
    );
  });

  it("leaves tokens of unknown queries unchanged", () => {
    expect(materializeBlockText("__q_missing__.run()", NAMES)).toBe(
      "__q_missing__.run()",
    );
  });

  it("round-trips a controller through materialize and tokenize", () => {
    expect(
      tokenizeBlockText(materializeBlockText(CONTROLLER, NAMES), NAMES),
    ).toBe(CONTROLLER);
  });

  it("does not tokenize names that are only part of a longer identifier", () => {
    expect(tokenizeBlockText("Block10.x + myBlock1 + Block1.y", NAMES)).toBe(
      "Block10.x + myBlock1 + __block__.y",
    );
  });

  it("maps every string field of a REST query", () => {
    const query: BlockRestQuery = {
      key: "forecast",
      kind: "rest",
      url: "https://a.com",
      path: "/{{__block__.settings.city}}",
      method: "POST",
      headers: [{ key: "X-City", value: "{{__block__.settings.city}}" }],
      queryParameters: [{ key: "q", value: "{{__block__.settings.city}}" }],
      body: '{"city": {{__block__.settings.city}}}',
    };

    const materialized = materializeBlockQuery(query, NAMES) as BlockRestQuery;

    expect(materialized.path).toBe("/{{Block1.settings.city}}");
    expect(materialized.headers[0].value).toBe("{{Block1.settings.city}}");
    expect(materialized.queryParameters[0].value).toBe(
      "{{Block1.settings.city}}",
    );
    expect(materialized.body).toBe('{"city": {{Block1.settings.city}}}');
    expect(tokenizeBlockQuery(materialized, NAMES)).toEqual(query);
  });
});

describe("permissions", () => {
  it("keeps the status of known permissions, adds new ones as pending and drops undeclared ones", () => {
    const merged = mergePermissions(
      [
        { id: "network:a.com", description: "", status: "approved" },
        { id: "network:old.com", description: "", status: "approved" },
      ],
      [
        { id: "network:a.com", description: "A" },
        { id: "network:b.com", description: "B" },
      ],
    );

    expect(merged).toEqual([
      { id: "network:a.com", description: "A", status: "approved" },
      { id: "network:b.com", description: "B", status: "pending" },
    ]);
    expect(hasUnapprovedPermissions(merged)).toBe(true);
  });

  it("reports a block with no permissions as approved", () => {
    expect(hasUnapprovedPermissions([])).toBe(false);
    expect(hasUnapprovedPermissions(undefined)).toBe(false);
  });
});
