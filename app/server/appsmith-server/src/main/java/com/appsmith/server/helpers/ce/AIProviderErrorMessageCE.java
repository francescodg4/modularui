package com.appsmith.server.helpers.ce;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Reads the human-readable message out of an AI provider's error response, such as Anthropic's "Your credit balance
 * is too low" or Groq's "Request too large ... tokens per minute". Without it, every provider failure reached the user
 * as a generic error and they could not tell a billing problem from a bad model name or a rate limit.
 *
 * <p>Only the message field is returned, never the raw body, and it is length-capped. Anthropic, OpenAI and the
 * OpenAI-compatible APIs (Groq, OpenRouter, ...) all use {@code {"error": {"message": "..."}}}; some use
 * {@code {"error": "..."}} or a top-level {@code "message"}.
 */
public final class AIProviderErrorMessageCE {

    static final int MAX_LENGTH = 300;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private AIProviderErrorMessageCE() {}

    /** The provider's error message, or null when the body has none. */
    public static String extract(String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            return null;
        }

        JsonNode root;
        try {
            root = OBJECT_MAPPER.readTree(responseBody);
        } catch (Exception e) {
            return null;
        }
        if (root == null || !root.isObject()) {
            return null;
        }

        String message = null;
        JsonNode error = root.get("error");
        if (error != null && error.isTextual()) {
            message = error.asText();
        } else if (error != null && error.hasNonNull("message")) {
            message = error.get("message").asText();
        } else if (root.hasNonNull("message")) {
            message = root.get("message").asText();
        }

        if (message == null || message.isBlank()) {
            return null;
        }
        message = message.trim();
        return message.length() > MAX_LENGTH ? message.substring(0, MAX_LENGTH) + "…" : message;
    }

    /** A message for a failed provider call: the provider's own message when it gave one, else the HTTP status. */
    public static String describe(int statusCode, String responseBody) {
        String message = extract(responseBody);
        return message != null ? message + " (HTTP " + statusCode + ")" : "HTTP " + statusCode;
    }
}
