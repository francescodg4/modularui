package com.appsmith.server.helpers.ce;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class AIProviderErrorMessageCETest {

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                // Anthropic
                "{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"Your credit balance is too low\"}}"
                        + "|Your credit balance is too low",
                // OpenAI and OpenAI-compatible APIs such as Groq
                "{\"error\":{\"message\":\"The model `x` does not exist\",\"code\":\"model_not_found\"}}"
                        + "|The model `x` does not exist",
                "{\"error\":\"Rate limit reached\"}|Rate limit reached",
                "{\"message\":\"  Bad gateway  \"}|Bad gateway",
            })
    void should_returnProviderMessage_when_bodyHasOne(String body, String expected) {
        // When
        String message = AIProviderErrorMessageCE.extract(body);

        // Then
        assertThat(message).isEqualTo(expected);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"not json", "[1,2]", "{\"error\":{\"code\":\"x\"}}", "{\"error\":{\"message\":\"  \"}}"})
    void should_returnNull_when_bodyHasNoMessage(String body) {
        // When
        String message = AIProviderErrorMessageCE.extract(body);

        // Then
        assertThat(message).isNull();
    }

    @Test
    void should_capLength_when_messageIsLong() {
        // Given
        String body = "{\"error\":{\"message\":\"" + "a".repeat(1000) + "\"}}";

        // When
        String message = AIProviderErrorMessageCE.extract(body);

        // Then
        assertThat(message).hasSize(AIProviderErrorMessageCE.MAX_LENGTH + 1).endsWith("…");
    }

    @Test
    void should_includeStatus_when_describingFailure() {
        // When
        String withMessage = AIProviderErrorMessageCE.describe(400, "{\"error\":{\"message\":\"Bad model\"}}");
        String withoutMessage = AIProviderErrorMessageCE.describe(503, "<html>down</html>");

        // Then
        assertThat(withMessage).isEqualTo("Bad model (HTTP 400)");
        assertThat(withoutMessage).isEqualTo("HTTP 503");
    }
}
