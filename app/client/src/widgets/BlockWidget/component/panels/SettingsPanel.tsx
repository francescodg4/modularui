import React, { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { Button, Input, Switch, Text } from "@appsmith/ads";
import { batchUpdateWidgetProperty } from "actions/controlActions";
import { coerceSettingValue, type BlockSettingField } from "../../definition";
import type { BlockWidgetProps } from "../../widget";
import {
  FieldGrid,
  FieldLabel,
  Muted,
  NativeSelect,
  PanelBody,
  SpacedRow,
} from "./styles";

interface SettingsPanelProps {
  widget: BlockWidgetProps;
}

function toInputValue(value: unknown): string {
  if (value === undefined || value === null) return "";

  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function SettingField({
  field,
  name,
  onChange,
  value,
}: {
  name: string;
  field: BlockSettingField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "boolean") {
    return (
      <div>
        <Switch isSelected={value === true} onChange={onChange}>
          {field.title}
        </Switch>
        {field.description && <Muted>{field.description}</Muted>}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <FieldLabel>
        {field.title}
        <NativeSelect
          aria-label={field.title}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          value={toInputValue(value)}
        >
          {(field.options || []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
        {field.description && <Muted>{field.description}</Muted>}
      </FieldLabel>
    );
  }

  return (
    <Input
      description={field.description}
      label={field.title}
      onChange={onChange}
      size="md"
      type={field.type === "number" ? "number" : "text"}
      value={toInputValue(value)}
    />
  );
}

/** Edits the block's settings through the form its settings schema describes. */
function SettingsPanel({ widget }: SettingsPanelProps) {
  const dispatch = useDispatch();
  const schema = widget.settingsSchema || {};
  const [draft, setDraft] = useState<Record<string, unknown>>(
    widget.settings || {},
  );

  // Pick up changes made elsewhere (the agent, a snapshot restore) while the panel is open.
  useEffect(() => {
    setDraft(widget.settings || {});
  }, [widget.settings]);

  const names = Object.keys(schema);

  if (names.length === 0) {
    return (
      <PanelBody>
        <Text kind="body-m">
          This block has no settings. Ask for one in the Prompt tab, for example
          &quot;make the city a setting&quot;.
        </Text>
      </PanelBody>
    );
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(widget.settings);

  const save = () => {
    const settings = { ...draft };

    names.forEach((name) => {
      settings[name] = coerceSettingValue(schema[name], settings[name]);
    });

    dispatch(
      batchUpdateWidgetProperty(widget.widgetId, { modify: { settings } }),
    );
  };

  return (
    <PanelBody>
      <FieldGrid>
        {names.map((name) => (
          <SettingField
            field={schema[name]}
            key={name}
            name={name}
            onChange={(value) => setDraft({ ...draft, [name]: value })}
            value={draft[name]}
          />
        ))}
      </FieldGrid>
      <SpacedRow>
        <Muted>
          Settings are saved with the block. The block reloads its data after a
          change.
        </Muted>
        <Button isDisabled={!isDirty} onClick={save} size="md">
          Save settings
        </Button>
      </SpacedRow>
    </PanelBody>
  );
}

export default SettingsPanel;
