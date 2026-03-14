import React from "react";
import { Button } from "./Button";
import { Input } from "./Input";
import { MultiButton } from "./MultiButton";

export type FormEntryDef = {
  type: "choice" | "button" | "text" | "separator" | "color";
  label: string;
  values: string[] | string | number[];
  id: string;
  icon?: string;
};

export type FormDef = {
  entries: FormEntryDef[];
};

export interface FormProps {
  form: FormDef;
  values: Record<string, any>;
  onChange: (id: string, value: any) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function Form({ form, values, onChange, className = "", style }: FormProps) {
  return (
    <div className={`form ${className}`.trim()} style={style}>
      {form.entries.map((entry) => (
        <div key={entry.id} className="form-entry">
          {entry.type === "text" && (
            <>
              <label>{entry.label}</label>
              <Input
                type="text"
                name={entry.id}
                value={(values[entry.id] as string) ?? ""}
                onChange={(v) => onChange(entry.id, v)}
              />
            </>
          )}
          {entry.type === "color" && (
            <>
              <label>{entry.label}</label>
              <Input
                type="color"
                name={entry.id}
                value={(values[entry.id] as string) ?? "#000000"}
                onChange={(v) => onChange(entry.id, v)}
              />
            </>
          )}
          {entry.type === "choice" && (() => {
            const vals = entry.values as (string | number)[];
            const currentIndex = vals.indexOf(values[entry.id]);
            return (
              <>
                <label>{entry.label}</label>
                <MultiButton
                  className="form-button"
                  items={vals.map(String)}
                  selected={currentIndex >= 0 ? [currentIndex] : []}
                  onSelect={(index) => onChange(entry.id, vals[index])}
                />
              </>
            );
          })()}
          {entry.type === "button" && (
            <Button
              className="form-button"
              icon={entry.icon}
              onClick={() => {
                onChange(entry.id, true);
                onChange(entry.id, false);
              }}
            >
              {entry.label}
            </Button>
          )}
          {entry.type === "separator" && (
            <div className="form-separator">{entry.label || ""}</div>
          )}
        </div>
      ))}
    </div>
  );
}
