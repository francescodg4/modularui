package com.appsmith.server.services.ce;

import com.appsmith.server.dtos.AIEditorContextDTO;
import com.appsmith.server.newactions.base.NewActionService;
import com.appsmith.server.plugins.base.PluginService;
import com.appsmith.server.services.AIReferenceService;
import com.appsmith.server.services.OrganizationService;
import com.appsmith.server.solutions.ActionPermission;
import com.appsmith.server.solutions.DatasourceStructureSolution;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AIAssistantServiceBlockModeTest {

    private static final String BLOCK_REFERENCE = "BLOCK REFERENCE";
    private static final String COMMON_ISSUES = "COMMON ISSUES";

    @Mock
    private OrganizationService organizationService;

    @Mock
    private AIReferenceService aiReferenceService;

    @Mock
    private NewActionService newActionService;

    @Mock
    private DatasourceStructureSolution datasourceStructureSolution;

    @Mock
    private PluginService pluginService;

    @Mock
    private ActionPermission actionPermission;

    private AIAssistantServiceCEImpl service;

    @BeforeEach
    void setUp() {
        service = new AIAssistantServiceCEImpl(
                organizationService,
                aiReferenceService,
                newActionService,
                datasourceStructureSolution,
                pluginService,
                actionPermission);
        when(aiReferenceService.getReferenceContent("block_generate")).thenReturn(BLOCK_REFERENCE);
        when(aiReferenceService.getReferenceContent("block_agent")).thenReturn(BLOCK_REFERENCE);
        when(aiReferenceService.getReferenceContent("javascript")).thenReturn("JS REFERENCE");
        when(aiReferenceService.getCommonIssuesContent()).thenReturn(COMMON_ISSUES);
    }

    private static AIEditorContextDTO context(String mode, String currentValue) {
        AIEditorContextDTO context = new AIEditorContextDTO();
        context.setMode(mode);
        context.setCurrentValue(currentValue);
        return context;
    }

    @ParameterizedTest
    @ValueSource(strings = {"block_generate", "block_agent"})
    void should_askForJsonOnlyWithoutMarkdownRules_when_modeIsABlockMode(String mode) {
        // Given
        AIEditorContextDTO context = context(mode, null);

        // When
        String systemPrompt = service.buildSystemPrompt(context);

        // Then
        assertThat(systemPrompt)
                .startsWith(BLOCK_REFERENCE)
                .contains("Respond with one JSON object and nothing else")
                .doesNotContain(COMMON_ISSUES)
                .doesNotContain("Format your responses using markdown");
    }

    @Test
    void should_keepMarkdownRulesAndCommonIssues_when_modeIsNotABlockMode() {
        // Given
        AIEditorContextDTO context = context("javascript", null);

        // When
        String systemPrompt = service.buildSystemPrompt(context);

        // Then
        assertThat(systemPrompt).contains(COMMON_ISSUES).contains("Format your responses using markdown");
    }

    @Test
    void should_putBlockContextBeforeRequest_when_modeIsABlockMode() {
        // Given
        AIEditorContextDTO context = context("block_generate", "{\"datasources\":[]}");

        // When
        String userPrompt = service.buildUserPrompt("  Weather in Rome  ", context);

        // Then
        assertThat(userPrompt)
                .isEqualTo("Context (JSON):\n{\"datasources\":[]}\n\n"
                        + "User request: Weather in Rome\n\nRespond with the JSON object only.");
    }

    @Test
    void should_omitContextSection_when_blockModeHasNoContext() {
        // Given
        AIEditorContextDTO context = context("block_agent", "  ");

        // When
        String userPrompt = service.buildUserPrompt("Make it blue", context);

        // Then
        assertThat(userPrompt).isEqualTo("User request: Make it blue\n\nRespond with the JSON object only.");
    }

    @Test
    void should_notTreatContextAsBlockMode_when_contextIsNull() {
        // When
        boolean isBlockMode = AIAssistantServiceCEImpl.isBlockMode(null);

        // Then
        assertThat(isBlockMode).isFalse();
    }
}
