import { describe, expect, it } from "vitest";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";

/**
 * Option represents a value that can either be present (Some) or absent (None). It is a powerful
 * tool for modeling computations that can fail or return no value. The Option type is a sum type,
 * which means it can be one of two cases: Some or None. The Some case contains a value, while the
 * None case represents the absence of a value.
 *
 * The Option type provides several useful functions for working with optional values, such as map,
 * flatMap, match, and getOrElse. These functions allow you to transform and manipulate optional
 * values in a safe and composable way.
 */
describe("Option", () => {
  it("represents presence with Some and absence with None", () => {
    expect(O.some("hello")).toEqual({ _tag: "Some", value: "hello" });
    expect(O.none).toEqual({ _tag: "None" });
  });

  it("turns nullable values into Option", () => {
    const value: string | null = "Chris";
    const missing: string | null = null;

    expect(O.fromNullable(value)).toEqual(O.some("Chris"));
    expect(O.fromNullable(missing)).toEqual(O.none);
  });

  it("works in the same way with undefined values", () => {
    const value: string | undefined = "Chris";
    const missing: string | undefined = undefined;

    expect(O.fromNullable(value)).toEqual(O.some("Chris"));
    expect(O.fromNullable(missing)).toEqual(O.none);
  });

  it("maps over Some, but ignores None", () => {
    const shout = (s: string) => s.toUpperCase();

    expect(pipe(O.some("hello"), O.map(shout))).toEqual(O.some("HELLO"));
    expect(pipe(O.none, O.map(shout))).toEqual(O.none);
  });

  it("flatMaps when the next step can also fail", () => {
    const inverse = (n: number): O.Option<number> =>
      n === 0 ? O.none : O.some(1 / n);

    expect(pipe(O.some(2), O.flatMap(inverse))).toEqual(O.some(0.5));
    expect(pipe(O.some(0), O.flatMap(inverse))).toEqual(O.none);
    expect(pipe(O.none, O.flatMap(inverse))).toEqual(O.none);
  });

  it("uses match to leave the Option world", () => {
    const render = (option: O.Option<number>) =>
      pipe(
        option,
        O.match(
          // First arg is the default value, which is used when the Option is None
          () => "no value",
          // Second arg is a function that takes the value out of the Some and returns a new value
          (n) => `value is ${n}`,
        ),
      );

    expect(render(O.some(42))).toBe("value is 42");
    expect(render(O.none)).toBe("no value");
  });

  it("uses getOrElse for defaults", () => {
    const shoutWithDefault = (option: O.Option<string>) =>
      pipe(
        option,
        O.map((s: string) => s.toUpperCase()),
        O.getOrElse(() => "DEFAULT"),
      );

    expect(shoutWithDefault(O.none)).toBe("DEFAULT");
    expect(shoutWithDefault(O.some("hello"))).toBe("HELLO");
  });

  it("can model a small failing pipeline", () => {
    const head = <A>(items: readonly A[]): O.Option<A> =>
      items.length === 0 ? O.none : O.some(items[0]!);

    const inverse = (n: number): O.Option<number> =>
      n === 0 ? O.none : O.some(1 / n);

    const calculate = (numbers: readonly number[]) =>
      pipe(
        numbers,
        head,
        O.map((n) => n * 2),
        O.flatMap(inverse),
        O.match(
          () => "no result",
          (n) => `result is ${n}`,
        ),
      );

    expect(calculate([2, 10, 20])).toBe("result is 0.25");
    expect(calculate([])).toBe("no result");
    expect(calculate([0])).toBe("no result");
  });
});
