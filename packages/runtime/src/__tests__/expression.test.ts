import { describe, expect, it } from "vitest";
import { evaluateCondition, explainCondition, ExpressionError, interpolate, resolveValue } from "../expression.ts";
import { lookup, truthy } from "../values.ts";

const scope = {
  response: { status: 200, body: { items: [{ id: "inv_1" }, { id: "inv_2" }], count: 2, note: "all good" }, ok: true },
  vars: { total: "42" },
  env: { TOKEN: "s3cret-token" },
  empty: [] as unknown[],
};

describe("lookup", () => {
  it("reads dotted paths, array indices, and both spellings of an index", () => {
    expect(lookup(scope, "response.status")).toBe(200);
    expect(lookup(scope, "response.body.items[1].id")).toBe("inv_2");
    expect(lookup(scope, "response.body.items.0.id")).toBe("inv_1");
  });

  it("is undefined for a path that isn't there, at any depth", () => {
    expect(lookup(scope, "response.missing")).toBeUndefined();
    expect(lookup(scope, "response.missing.deeper")).toBeUndefined();
    expect(lookup(scope, "response.body.items[9]")).toBeUndefined();
  });
});

describe("interpolate", () => {
  it("fills holes with text", () => {
    expect(interpolate("status={{ response.status }}", scope)).toBe("status=200");
  });

  it("throws on an unresolved path rather than sending an empty value", () => {
    // The whole point: a URL with a missing id is a request to a different endpoint,
    // and it will often succeed.
    expect(() => interpolate("/invoices/{{ invoice.id }}", scope)).toThrow(ExpressionError);
    try {
      interpolate("/invoices/{{ invoice.id }}", scope);
    } catch (error) {
      expect((error as ExpressionError).path).toBe("invoice.id");
    }
  });
});

describe("resolveValue", () => {
  it("keeps the type when the template is exactly one hole", () => {
    expect(resolveValue("{{ response.body }}", scope)).toEqual(scope.response.body);
    expect(resolveValue("{{ response.status }}", scope)).toBe(200);
  });

  it("is a string as soon as anything else is in the template", () => {
    expect(resolveValue("id-{{ response.status }}", scope)).toBe("id-200");
  });
});

describe("evaluateCondition", () => {
  it("compares a number to its own text form", () => {
    expect(evaluateCondition("{{ response.status }} == 200", scope)).toBe(true);
    expect(evaluateCondition('{{ response.status }} == "200"', scope)).toBe(true);
    expect(evaluateCondition("{{ response.status }} != 500", scope)).toBe(true);
  });

  it("orders numerically when both sides are numbers", () => {
    expect(evaluateCondition("{{ response.body.count }} > 1", scope)).toBe(true);
    expect(evaluateCondition("{{ response.body.count }} >= 2", scope)).toBe(true);
    expect(evaluateCondition("{{ response.body.count }} < 2", scope)).toBe(false);
  });

  it("reads `contains` three ways", () => {
    expect(evaluateCondition("{{ response.body.note }} contains good", scope)).toBe(true);
    expect(evaluateCondition("{{ response.body }} contains count", scope)).toBe(true);
    expect(evaluateCondition("{{ response.body.items }} contains nothing", scope)).toBe(false);
  });

  it("treats a bare expression as a truthiness test, with an empty list as false", () => {
    expect(evaluateCondition("{{ response.ok }}", scope)).toBe(true);
    expect(evaluateCondition("{{ response.body.items }}", scope)).toBe(true);
    expect(evaluateCondition("{{ empty }}", scope)).toBe(false);
  });

  it("answers false for a missing path instead of failing the run", () => {
    // A condition is a question — asking about a field that isn't there is fair.
    expect(evaluateCondition("{{ response.body.error }} == boom", scope)).toBe(false);
    expect(evaluateCondition("{{ response.body.error }}", scope)).toBe(false);
  });

  it("refuses an empty condition", () => {
    expect(() => evaluateCondition("   ", scope)).toThrow(ExpressionError);
  });

  it("does not evaluate host expressions", () => {
    // No `eval` anywhere: a condition that looks like code is text, and text is not
    // equal to the number it would evaluate to.
    expect(evaluateCondition("1+1 == 2", scope)).toBe(false);
    expect(evaluateCondition('{{ response.status }} == "process.exit(1)"', scope)).toBe(false);
  });

  it("does not mistake an operator inside a quoted string or a hole", () => {
    expect(evaluateCondition('"a > b" == "a > b"', scope)).toBe(true);
  });
});

describe("explainCondition", () => {
  it("shows what the operands actually were", () => {
    expect(explainCondition("{{ response.status }} == 200", scope)).toBe("200 == 200");
    expect(explainCondition("{{ response.body.error }} == boom", scope)).toBe("(unset) == boom");
  });
});

describe("truthy", () => {
  it("reads the strings a form field produces the way an author means them", () => {
    expect(truthy("false")).toBe(false);
    expect(truthy("0")).toBe(false);
    expect(truthy("")).toBe(false);
    expect(truthy("no")).toBe(true);
  });
});
