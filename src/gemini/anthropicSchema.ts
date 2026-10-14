/**
 * Pure JSON-schema translation for the Anthropic structured-outputs path.
 *
 * Our response schemas come from zodToJsonSchema over Gemini-style contracts:
 * every field always present, unused ones null (see decisionSchema.ts). Each
 * `.nullable()` serializes to a union (`anyOf: [X, {type:'null'}]` or
 * `type: [T, 'null']`), and Anthropic caps schemas at 16 union-typed
 * parameters — the planner's decision schema alone has 19, so the raw
 * schema is rejected with a 400 (seen in prod 2026-09-01).
 *
 * The fix is a round-trip translation owned by the adapter, invisible to
 * callers:
 *  - request:  toAnthropicSchema() collapses every null-union to its non-null
 *    branch and drops the field from `required` — "null when unused" becomes
 *    "omitted when unused", and no unions remain to count.
 *  - response: restoreOmittedNulls() walks the ORIGINAL schema and puts an
 *    explicit null back into every omitted nullable field, so the caller's
 *    Zod parse sees the exact Gemini-shaped answer it expects.
 *
 * Both functions take an optional collector that records WHAT they changed,
 * by JSON path (`holdings[].account_number`), so the call log and the trace
 * can show the translation (openspec `conversation-trace`, "adapter
 * translations are code steps"). The output is identical with or without it.
 */

/**
 * Keywords Anthropic's structured outputs reject; our schemas come from
 * zodToJsonSchema, which can emit them. Stripped only where a key is a schema
 * keyword — never inside a `properties` map, where it would be a field name.
 */
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  '$schema',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
]);

/** What toAnthropicSchema changed, by JSON path (`''` = the root object, shown as `(root)`). */
export interface SchemaChanges {
  /** Fields whose null option was removed (they became optional). */
  nullRemoved: string[];
  /** Fields removed from their object's `required` list. */
  requiredDropped: string[];
  /** Schema keywords dropped, with the node they sat on. */
  keywordsStripped: { path: string; keyword: string }[];
  /** Objects that had no `additionalProperties: false` and got one. */
  additionalPropertiesForced: string[];
}

export function emptySchemaChanges(): SchemaChanges {
  return { nullRemoved: [], requiredDropped: [], keywordsStripped: [], additionalPropertiesForced: [] };
}

/** True when the collector recorded at least one change to the schema itself. */
export function schemaChanged(changes: SchemaChanges): boolean {
  return (
    changes.nullRemoved.length > 0 ||
    changes.requiredDropped.length > 0 ||
    changes.keywordsStripped.length > 0 ||
    changes.additionalPropertiesForced.length > 0
  );
}

const joinPath = (parent: string, name: string): string => (parent === '' ? name : `${parent}.${name}`);
const shownPath = (path: string): string => (path === '' ? '(root)' : path);

function isNullSchema(node: unknown): boolean {
  return typeof node === 'object' && node !== null && (node as Record<string, unknown>).type === 'null';
}

interface Converted {
  schema: unknown;
  /** The original schema admitted null — the parent makes the property optional. */
  nullable: boolean;
}

function convert(node: unknown, path: string, changes: SchemaChanges | undefined): Converted {
  if (Array.isArray(node)) return { schema: node.map((n) => convert(n, path, changes).schema), nullable: false };
  if (node === null || typeof node !== 'object') return { schema: node, nullable: false };

  let nullable = false;
  const out: Record<string, unknown> = {};
  const nullableProps = new Set<string>();
  const original = node as Record<string, unknown>;

  for (const [key, value] of Object.entries(original)) {
    if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) {
      changes?.keywordsStripped.push({ path: shownPath(path), keyword: key });
      continue;
    }
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([name, propSchema]) => {
          const prop = convert(propSchema, joinPath(path, name), changes);
          if (prop.nullable) {
            nullableProps.add(name);
            changes?.nullRemoved.push(joinPath(path, name));
          }
          return [name, prop.schema];
        }),
      );
      continue;
    }
    if (key === 'items') {
      out.items = convert(value, `${path}[]`, changes).schema;
      continue;
    }
    if (key === 'anyOf' && Array.isArray(value)) {
      const branches = value.filter((b) => !isNullSchema(b));
      if (branches.length < value.length) nullable = true;
      if (branches.length === 1) {
        // Collapse the union wrapper onto its single real branch.
        const only = convert(branches[0], path, changes);
        nullable = nullable || only.nullable;
        if (only.schema !== null && typeof only.schema === 'object' && !Array.isArray(only.schema)) {
          Object.assign(out, only.schema);
        } else {
          out.anyOf = [only.schema];
        }
      } else {
        out.anyOf = branches.map((b) => convert(b, path, changes).schema);
      }
      continue;
    }
    if (key === 'type' && Array.isArray(value)) {
      const types = value.filter((t) => t !== 'null');
      if (types.length < value.length) nullable = true;
      out.type = types.length === 1 ? types[0] : types;
      continue;
    }
    out[key] = convert(value, path, changes).schema;
  }

  // Nullable fields became optional: drop them from required.
  if (Array.isArray(out.required)) {
    const required = (out.required as unknown[]).filter((name) => {
      const dropped = nullableProps.has(name as string);
      if (dropped) changes?.requiredDropped.push(joinPath(path, String(name)));
      return !dropped;
    });
    if (required.length > 0) out.required = required;
    else delete out.required;
  }
  // Structured outputs require additionalProperties:false on every object.
  if (out.type === 'object' || out.properties !== undefined) {
    if (original.additionalProperties !== false) changes?.additionalPropertiesForced.push(shownPath(path));
    out.additionalProperties = false;
  }
  return { schema: out, nullable };
}

/**
 * The schema actually sent to Anthropic: keywords stripped, null-unions
 * collapsed to optional fields. `changes`, when given, receives what was
 * changed; `rootPath` prefixes every recorded path (a tool's name, for a
 * tool parameter schema).
 */
export function toAnthropicSchema(schema: unknown, changes?: SchemaChanges, rootPath = ''): unknown {
  return convert(schema, rootPath, changes).schema;
}

/**
 * Reverses the request-side translation on the model's answer: guided by the
 * ORIGINAL (null-union) schema, every nullable field the model omitted is set
 * to an explicit null, recursively. Fields the original schema requires
 * non-null are left missing — the caller's own validation is the authority on
 * rejecting those. `filled`, when given, receives the path of every field
 * this call set to null because the model left it out.
 */
export function restoreOmittedNulls(schema: unknown, value: unknown, filled?: string[], path = ''): unknown {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return value;
  const s = schema as Record<string, unknown>;

  if (Array.isArray(s.anyOf)) {
    const branches = s.anyOf.filter((b) => !isNullSchema(b));
    const admitsNull = branches.length < s.anyOf.length;
    if (value === undefined || value === null) {
      if (admitsNull && value === undefined) filled?.push(path);
      return admitsNull ? null : value;
    }
    // Descend only when the branch is unambiguous (all our null-unions are).
    return branches.length === 1 ? restoreOmittedNulls(branches[0], value, filled, path) : value;
  }

  const admitsNull = Array.isArray(s.type) && s.type.includes('null');
  if (value === undefined || value === null) {
    if (admitsNull && value === undefined) filled?.push(path);
    return admitsNull ? null : value;
  }

  const type = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type;
  if (type === 'object' && s.properties && typeof s.properties === 'object' && !Array.isArray(s.properties)) {
    if (typeof value !== 'object' || Array.isArray(value)) return value;
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [name, propSchema] of Object.entries(s.properties as Record<string, unknown>)) {
      const restored = restoreOmittedNulls(propSchema, out[name], filled, joinPath(path, name));
      if (restored !== undefined) out[name] = restored;
    }
    return out;
  }
  if (type === 'array' && s.items !== undefined && Array.isArray(value)) {
    return value.map((item) => restoreOmittedNulls(s.items, item, filled, `${path}[]`));
  }
  return value;
}
