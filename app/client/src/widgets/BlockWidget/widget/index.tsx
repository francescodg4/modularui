import React from "react";

import type { DerivedPropertiesMap } from "WidgetProvider/factory/types";
import type { WidgetProps, WidgetState } from "widgets/BaseWidget";
import BaseWidget from "widgets/BaseWidget";
import type { AutocompletionDefinitions } from "WidgetProvider/types";
import type { SetterConfig, Stylesheet } from "entities/AppTheming";
import type { AppThemeProperties } from "entities/AppTheming";
import { WIDGET_PADDING, WIDGET_TAGS } from "constants/WidgetConstants";
import { ValidationTypes } from "constants/WidgetValidation";
import { EventType } from "constants/AppsmithActionConstants/ActionConstants";
import { Colors } from "constants/Colors";
import { DefaultAutocompleteDefinitions } from "widgets/WidgetUtils";
import { generateTypeDef } from "utils/autocomplete/defCreatorUtils";
import type { ExtraDef } from "utils/autocomplete/defCreatorUtils";
import { DynamicHeight } from "utils/WidgetFeatures";
import { RenderModes } from "constants/WidgetConstants";

import IconSVG from "../icon.svg";
import ThumbnailSVG from "../thumbnail.svg";
import BlockComponent from "../component";
import { BLOCK_WIDGET_TYPE, BlockState } from "../constants";
import type { BlockStateType } from "../constants";
import type {
  BlockDataSourceRef,
  BlockPermission,
  BlockSettingsSchema,
  BlockSnapshot,
  BlockView,
} from "../definition";

/** The output the controller JS object exposes, bound into `controllerState`. */
export interface BlockControllerState {
  data?: unknown;
  error?: string | null;
  logs?: Array<{ time?: string; message?: string } | string>;
  updatedAt?: string | null;
}

export interface BlockQueryRef {
  key: string;
  actionId: string;
}

export interface BlockWidgetProps extends WidgetProps {
  blockState: BlockStateType;
  title: string;
  showTitle: boolean;
  srcDoc: BlockView;
  settings: Record<string, unknown>;
  settingsSchema: BlockSettingsSchema;
  blockControllerId?: string;
  blockQueries: BlockQueryRef[];
  blockPermissions: BlockPermission[];
  blockDataSource?: BlockDataSourceRef | null;
  blockSnapshots: BlockSnapshot[];
  controllerState?: BlockControllerState;
  onRefresh?: string;
  theme: AppThemeProperties;
}

/**
 * A block starts empty with a prompt area. Generating it from a description turns it into a widget made of:
 * - a View: HTML/CSS/JS rendered in the Custom widget's sandboxed iframe (`srcDoc`),
 * - a Controller: block settings plus a JS object (`blockControllerId`) whose `run()` calls the block's queries,
 *   parses their responses and stores the result in its `data` variable,
 * - Model access through queries on datasources, which keep the credentials.
 *
 * `controllerState` binds the controller's output and `onRefresh` triggers `run()`. Both are regular bindings, so
 * renaming the JS object keeps the block working.
 */
class BlockWidget extends BaseWidget<BlockWidgetProps, WidgetState> {
  static type = BLOCK_WIDGET_TYPE;

  static getConfig() {
    return {
      name: "Block",
      iconSVG: IconSVG,
      thumbnailSVG: ThumbnailSVG,
      needsMeta: false,
      isCanvas: false,
      tags: [WIDGET_TAGS.DISPLAY],
      searchTags: ["ai", "prompt", "dashboard", "generate", "block"],
    };
  }

  static getDefaults() {
    return {
      widgetName: "Block",
      rows: 30,
      columns: 24,
      version: 1,
      isVisible: true,
      blockState: BlockState.EMPTY,
      title: "",
      showTitle: true,
      srcDoc: { html: "", css: "", js: "" },
      settings: {},
      settingsSchema: {},
      blockQueries: [],
      blockPermissions: [],
      blockSnapshots: [],
      theme: "{{appsmith.theme}}",
      dynamicBindingPathList: [{ key: "theme" }],
      borderColor: Colors.GREY_5,
      borderWidth: "1",
      backgroundColor: "#FFFFFF",
    };
  }

  static getAutoLayoutConfig() {
    return {
      widgetSize: [
        {
          viewportMinWidth: 0,
          configuration: () => ({
            minWidth: "240px",
            minHeight: "160px",
          }),
        },
      ],
    };
  }

  static getAutocompleteDefinitions(): AutocompletionDefinitions {
    return (widget: BlockWidgetProps, extraDefsToDefine?: ExtraDef) => ({
      isVisible: DefaultAutocompleteDefinitions.isVisible,
      settings: generateTypeDef(widget.settings, extraDefsToDefine),
      controllerState: generateTypeDef(
        widget.controllerState,
        extraDefsToDefine,
      ),
    });
  }

  static getSetterConfig(): SetterConfig {
    return {
      __setters: {
        setVisibility: {
          path: "isVisible",
          type: "boolean",
        },
      },
    };
  }

  static getStylesheetConfig(): Stylesheet {
    return {
      borderRadius: "{{appsmith.theme.borderRadius.appBorderRadius}}",
      boxShadow: "{{appsmith.theme.boxShadow.appBoxShadow}}",
    };
  }

  static getPropertyPaneContentConfig() {
    return [
      {
        sectionName: "General",
        children: [
          {
            propertyName: "title",
            label: "Title",
            helpText:
              "Shown above the block. Use the gear icon on the block for settings, prompt, snapshots and script.",
            controlType: "INPUT_TEXT",
            placeholderText: "Block title",
            isBindProperty: true,
            isTriggerProperty: false,
            validation: { type: ValidationTypes.TEXT },
          },
          {
            propertyName: "showTitle",
            label: "Show title",
            controlType: "SWITCH",
            isJSConvertible: true,
            isBindProperty: true,
            isTriggerProperty: false,
            validation: { type: ValidationTypes.BOOLEAN },
          },
          {
            propertyName: "isVisible",
            label: "Visible",
            helpText: "Controls the visibility of the widget",
            controlType: "SWITCH",
            isJSConvertible: true,
            isBindProperty: true,
            isTriggerProperty: false,
            validation: { type: ValidationTypes.BOOLEAN },
          },
        ],
      },
      {
        sectionName: "Controller",
        hidden: (props: BlockWidgetProps) =>
          props.blockState !== BlockState.READY,
        children: [
          {
            propertyName: "controllerState",
            label: "Controller output",
            helpText:
              "The controller's output passed to the view. Set when the block is generated.",
            controlType: "INPUT_TEXT",
            isBindProperty: true,
            isTriggerProperty: false,
            validation: { type: ValidationTypes.OBJECT },
          },
          {
            propertyName: "onRefresh",
            label: "onRefresh",
            helpText:
              "Runs the controller. Triggered on load, on the refresh interval and by the view.",
            controlType: "ACTION_SELECTOR",
            isJSConvertible: true,
            isBindProperty: true,
            isTriggerProperty: true,
          },
        ],
      },
    ];
  }

  static getPropertyPaneStyleConfig() {
    return [
      {
        sectionName: "Color",
        children: [
          {
            helpText: "Use a html color name, HEX, RGB or RGBA value",
            placeholderText: "#FFFFFF / Gray / rgb(255, 99, 71)",
            propertyName: "backgroundColor",
            label: "Background color",
            controlType: "COLOR_PICKER",
            isJSConvertible: true,
            isBindProperty: true,
            isTriggerProperty: false,
            validation: { type: ValidationTypes.TEXT },
          },
          {
            helpText: "Use a html color name, HEX, RGB or RGBA value",
            placeholderText: "#FFFFFF / Gray / rgb(255, 99, 71)",
            propertyName: "borderColor",
            label: "Border color",
            controlType: "COLOR_PICKER",
            isBindProperty: true,
            isTriggerProperty: false,
            validation: { type: ValidationTypes.TEXT },
          },
        ],
      },
      {
        sectionName: "Border and shadow",
        children: [
          {
            helpText: "Enter value for border width",
            propertyName: "borderWidth",
            label: "Border width",
            placeholderText: "Enter value in px",
            controlType: "INPUT_TEXT",
            isBindProperty: true,
            isTriggerProperty: false,
            validation: { type: ValidationTypes.NUMBER },
          },
          {
            propertyName: "borderRadius",
            label: "Border radius",
            helpText: "Rounds the corners of the widgets's outer border edge",
            controlType: "BORDER_RADIUS_OPTIONS",
            isJSConvertible: true,
            isBindProperty: true,
            isTriggerProperty: false,
            validation: { type: ValidationTypes.TEXT },
          },
          {
            propertyName: "boxShadow",
            label: "Box shadow",
            helpText:
              "Enables you to cast a drop shadow from the frame of the widget",
            controlType: "BOX_SHADOW_OPTIONS",
            isJSConvertible: true,
            isBindProperty: true,
            isTriggerProperty: false,
            validation: { type: ValidationTypes.TEXT },
          },
        ],
      },
    ];
  }

  static getDerivedPropertiesMap(): DerivedPropertiesMap {
    return {};
  }

  static getDefaultPropertiesMap(): Record<string, string> {
    return {};
  }

  // TODO: Fix this the next time the file is edited
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static getMetaPropertiesMap(): Record<string, any> {
    return {};
  }

  /** Runs the controller through the `onRefresh` trigger. Reports whether the run succeeded. */
  runController = (onComplete?: (success: boolean) => void) => {
    if (!this.props.onRefresh) {
      onComplete?.(false);

      return;
    }

    super.executeAction({
      triggerPropertyName: "onRefresh",
      dynamicString: this.props.onRefresh,
      event: {
        type: EventType.CUSTOM_WIDGET_EVENT,
        callback: ({ success }) => onComplete?.(success),
      },
    });
  };

  setDragDisabled = (disabled: boolean) => {
    this.disableDrag(disabled);
  };

  getWidgetView() {
    return (
      <BlockComponent
        backgroundColor={this.props.backgroundColor}
        blockControllerId={this.props.blockControllerId}
        blockState={this.props.blockState}
        borderColor={this.props.borderColor}
        borderRadius={this.props.borderRadius}
        borderWidth={this.props.borderWidth}
        boxShadow={this.props.boxShadow}
        controllerState={this.props.controllerState}
        dynamicHeight={DynamicHeight.FIXED}
        height={this.props.componentHeight - WIDGET_PADDING * 2}
        isEditor={this.props.renderMode === RenderModes.CANVAS}
        layoutSystemType={this.props.layoutSystemType}
        onRefresh={this.props.onRefresh}
        permissions={this.props.blockPermissions || []}
        runController={this.runController}
        setDragDisabled={this.setDragDisabled}
        settings={this.props.settings || {}}
        settingsSchema={this.props.settingsSchema || {}}
        showTitle={this.props.showTitle}
        srcDoc={this.props.srcDoc}
        theme={this.props.theme}
        title={this.props.title}
        widgetId={this.props.widgetId}
        widgetName={this.props.widgetName}
        width={this.props.componentWidth - WIDGET_PADDING * 2}
      />
    );
  }
}

export default BlockWidget;
