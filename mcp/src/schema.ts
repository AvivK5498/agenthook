// ToolParamSpec → JSON Schema. The tool inputSchemas are built LIVE from
// GET /tools so they never drift from the API. Type-aware numeric/array bounds
// mirror the CLI's proven interpretation (packages/cli/src/validate.ts:74-81):
// number min/max → minimum/maximum; array max → item count (maxItems).
import type { ToolParamSpec } from "./client.js";

export interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  maxLength?: number;
}

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties: false;
}

export function toJsonSchema(params: Record<string, ToolParamSpec>): JsonSchemaObject {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const [name, spec] of Object.entries(params)) {
    const prop: JsonSchemaProperty = { type: spec.type };
    if (spec.description !== undefined) prop.description = spec.description;
    if (spec.enum !== undefined) prop.enum = [...spec.enum];
    if (spec.type === "array" && spec.items) prop.items = { type: spec.items.type };
    if (spec.default !== undefined) prop.default = spec.default;

    if (spec.type === "number") {
      if (spec.min !== undefined) prop.minimum = spec.min;
      if (spec.max !== undefined) prop.maximum = spec.max;
    } else if (spec.type === "array") {
      if (spec.min !== undefined) prop.minItems = spec.min;
      if (spec.max !== undefined) prop.maxItems = spec.max;
    }
    if (spec.maxLength !== undefined) prop.maxLength = spec.maxLength;

    properties[name] = prop;
    if (spec.required) required.push(name);
  }

  const schema: JsonSchemaObject = { type: "object", properties, additionalProperties: false };
  if (required.length) schema.required = required;
  return schema;
}
