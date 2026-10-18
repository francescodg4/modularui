package com.appsmith.server.constants;

public final class AIConstants {
    private AIConstants() {}

    public static final String DEFAULT_AZURE_API_VERSION = "2024-12-01-preview";
    public static final int DEFAULT_AZURE_MAX_COMPLETION_TOKENS = 16384;
    public static final String DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
    public static final String DEFAULT_CLAUDE_BASE_URL = "https://api.anthropic.com";
    public static final String DEFAULT_OPENAI_MODEL = "gpt-4";
    public static final String DEFAULT_OPENAI_BASE_URL = "https://api.openai.com";

    /** Ask AI mode that generates a whole Block widget definition from a description. */
    public static final String BLOCK_GENERATE_MODE = "block_generate";
    /** Ask AI mode of the agent scoped to one Block widget, which returns changes to its definition. */
    public static final String BLOCK_AGENT_MODE = "block_agent";
    /** Block definitions include a full HTML/CSS/JS view and a controller, so they need a larger output budget. */
    public static final int BLOCK_MAX_OUTPUT_TOKENS = 16384;
    /** Block requests carry the block's current definition as context, which can exceed the regular prompt limit. */
    public static final int BLOCK_MAX_PROMPT_LENGTH = 250000;
}
