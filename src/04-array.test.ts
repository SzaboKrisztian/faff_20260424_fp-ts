import { describe, expect, it } from "vitest";
import { pipe } from "fp-ts/function";
import * as A from "fp-ts/Array";
import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";

describe("Array", () => {
  it("maps over arrays", () => {
    const double = (n: number) => n * 2;
    const jsArrayApproach = [1, 2, 3].map(double);
    const fpTsApproach = A.map(double)([1, 2, 3]);

    expect(jsArrayApproach).toEqual([2, 4, 6]);
    expect(fpTsApproach).toEqual([2, 4, 6]);
  });

  /**
   * It gets more interesting when the mapping function can fail.
   *
   * The expression A.traverse(E.Applicative)(parse)(input) basically means:
   * (string[]) → Either<string, number[]>
   *
   * We are using E.Applicative, because we are dealing Either. There is also O.Applicative
   * for Option, T.ApplicativePar/T.ApplicativeSeq for Task, and TE.ApplicativePar/TE.ApplicativeSeq
   * for TaskEither.
   *
   * All of these stop on first failure. For Task and TaskEither, we have the two variants of
   * parallel and sequential traversal. Both variants will also stop on first failure.
   */
  it("traverses an array with a mapping function that returns an Either", () => {
    const parse = (s: string): E.Either<string, number> => {
      const n = Number(s);

      return isNaN(n) ? E.left(`not a number: ${s}`) : E.right(n);
    };

    const result = pipe(["1", "2", "3"], A.traverse(E.Applicative)(parse));

    expect(result).toEqual(E.right([1, 2, 3]));
  });

  it("fails if any element fails to parse", () => {
    const parse = (s: string): E.Either<string, number> => {
      const n = Number(s);

      return isNaN(n) ? E.left(`not a number: ${s}`) : E.right(n);
    };

    const result = pipe(["1", "two", "3"], A.traverse(E.Applicative)(parse));

    expect(result).toEqual(E.left("not a number: two"));
  });

  /**
   * Now for the async version, that uses TaskEither instead of Either.
   */
  it("runs async operations over arrays", async () => {
    const fetch = (n: number): TE.TaskEither<string, number> =>
      n > 0 ? TE.right(n * 2) : TE.left("bad");

    const result = await pipe([1, 2, 3], TE.traverseArray(fetch))();

    expect(result).toEqual(E.right([2, 4, 6]));
  });

  /**
   * Parallel vs sequential traversal
   */
  it("runs in parallel by default", async () => {
    const fetch = (n: number): TE.TaskEither<string, number> => TE.right(n);

    const result = await pipe(
      [1, 2, 3],
      TE.traverseArray(fetch), // parallel
    )();

    expect(result).toEqual(E.right([1, 2, 3]));
  });

  it("can also run sequentially", async () => {
    const fetch = (n: number): TE.TaskEither<string, number> => TE.right(n);

    const result = await pipe(
      [1, 2, 3],
      TE.traverseSeqArray(fetch), // sequential
    )();

    expect(result).toEqual(E.right([1, 2, 3]));
  });

  // Both parallel and sequential traversal will stop on first failure
  it("stops on first failure", async () => {
    const fetch = (n: number): TE.TaskEither<string, number> =>
      n === 2 ? TE.left("boom") : TE.right(n);

    const result = await pipe([1, 2, 3], TE.traverseArray(fetch))();
    expect(result).toEqual(E.left("boom"));

    const resultSeq = await pipe([1, 2, 3], TE.traverseSeqArray(fetch))();
    expect(resultSeq).toEqual(E.left("boom"));
  });

  it("filters out missing values using Option", () => {
    const parse = (s: string): O.Option<number> =>
      isNaN(Number(s)) ? O.none : O.some(Number(s));

    const result = pipe(["1", "oops", "3"], A.filterMap(parse));

    expect(result).toEqual([1, 3]);
  });

  it("separates failures and successes", () => {
    const parse = (s: string): E.Either<string, number> => {
      const n = Number(s);

      return isNaN(n) ? E.left(`not a number: ${s}`) : E.right(n);
    };

    const result = pipe(["1", "oops", "3"], A.partitionMap(parse));

    expect(result).toEqual({
      left: ["not a number: oops"],
      right: [1, 3],
    });
  });
});
