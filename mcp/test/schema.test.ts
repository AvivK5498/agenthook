import { describe, expect, it } from "vitest";
import { toJsonSchema } from "../src/schema.js";
import type { ToolParamSpec } from "../src/client.js";

describe("toJsonSchema", () => {
  it("maps a string param with maxLength + description", () => {
    const s = toJsonSchema({ prompt: { type: "string", required: true, maxLength: 4000, description: "the prompt" } });
    expect(s.properties.prompt).toEqual({ type: "string", description: "the prompt", maxLength: 4000 });
    expect(s.required).toEqual(["prompt"]);
    expect(s.type).toBe("object");
    expect(s.additionalProperties).toBe(false);
  });

  it("collects every required param, and omits `required` entirely when none", () => {
    const s = toJsonSchema({
      a: { type: "string", required: true },
      b: { type: "string" },
      c: { type: "number", required: true },
    });
    expect(s.required).toEqual(["a", "c"]);

    const none = toJsonSchema({ b: { type: "string" } });
    expect(none.required).toBeUndefined();
  });

  it("maps enum (copied to a mutable array) and default", () => {
    const spec: Record<string, ToolParamSpec> = {
      model: { type: "string", enum: ["seedance-2", "kling-3"] as const, default: "seedance-2" },
    };
    const model = toJsonSchema(spec).properties.model!;
    expect(model.enum).toEqual(["seedance-2", "kling-3"]);
    expect(Array.isArray(model.enum)).toBe(true);
    expect(model.default).toBe("seedance-2");
  });

  it("maps number min/max to minimum/maximum", () => {
    const s = toJsonSchema({ duration: { type: "number", min: 1, max: 12, default: 5 } });
    expect(s.properties.duration).toEqual({ type: "number", default: 5, minimum: 1, maximum: 12 });
  });

  it("maps array items and array max to maxItems (NOT maximum)", () => {
    const refs = toJsonSchema({ reference_images: { type: "array", items: { type: "string" }, max: 14 } }).properties
      .reference_images!;
    expect(refs.type).toBe("array");
    expect(refs.items).toEqual({ type: "string" });
    expect(refs.maxItems).toBe(14);
    expect(refs.maximum).toBeUndefined();
  });

  it("maps array min to minItems", () => {
    const tags = toJsonSchema({ tags: { type: "array", items: { type: "string" }, min: 1 } }).properties.tags!;
    expect(tags.minItems).toBe(1);
  });

  it("maps a boolean with a default", () => {
    const s = toJsonSchema({ audio: { type: "boolean", default: true } });
    expect(s.properties.audio).toEqual({ type: "boolean", default: true });
  });

  it("does not emit numeric bounds as JSON-Schema keys for non-numeric types", () => {
    // A string param carrying stray min/max must not become minimum/maximum.
    const x = toJsonSchema({ x: { type: "string", min: 2, max: 5 } }).properties.x!;
    expect(x.minimum).toBeUndefined();
    expect(x.maximum).toBeUndefined();
    expect(x.minItems).toBeUndefined();
  });

  it("produces an empty-but-valid object schema for a tool with no params", () => {
    const s = toJsonSchema({});
    expect(s).toEqual({ type: "object", properties: {}, additionalProperties: false });
  });
});
