package com.appsmith.server.services.ce;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class AIReferenceServiceBlockModeTest {

    @ParameterizedTest
    @ValueSource(strings = {"block_generate", "block_agent", "BLOCK_GENERATE"})
    void should_returnBundledBlockReference_when_modeIsABlockMode(String mode) {
        // Given
        AIReferenceServiceCEImpl service = new AIReferenceServiceCEImpl();

        // When
        String reference = service.getReferenceContent(mode);

        // Then
        assertThat(reference).contains("__block__").contains("__q_<key>__").contains("appsmith.onModelChange");
    }
}
