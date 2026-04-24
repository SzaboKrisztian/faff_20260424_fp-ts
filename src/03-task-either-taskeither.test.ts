import { describe, expect, it } from "vitest";
import { pipe } from "fp-ts/function";
import * as E from "fp-ts/Either";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { sequenceS } from "fp-ts/Apply";

/**
 * Either is a type that represents a value that can be one of two cases: Left or Right. The Left
 * case typically represents an error or failure, while the Right case represents a success. This
 * is just a convention, but it is widely used. I like to remember it as "Right: things went right,
 * Left: things went wrong".
 */
describe("Either", () => {
  it("represents success (Right) or failure (Left)", () => {
    const success = E.right(42);
    const failure = E.left("error");

    expect(success).toEqual({ _tag: "Right", right: 42 });
    expect(failure).toEqual({ _tag: "Left", left: "error" });
  });

  it("map only affects Right", () => {
    const double = (n: number) => n * 2;

    expect(pipe(E.right(2), E.map(double))).toEqual(E.right(4));
    expect(pipe(E.left("err"), E.map(double))).toEqual(E.left("err"));
  });

  it("flatMap chains computations that can fail", () => {
    const parseNumber = (s: string): E.Either<string, number> =>
      isNaN(Number(s)) ? E.left("not a number") : E.right(Number(s));

    const inverse = (n: number): E.Either<string, number> =>
      n === 0 ? E.left("division by zero") : E.right(1 / n);

    const result = pipe("2", parseNumber, E.flatMap(inverse));

    expect(result).toEqual(E.right(0.5));
  });

  it("match unwraps Either", () => {
    const render = (e: E.Either<string, number>) =>
      pipe(
        e,
        E.match(
          (err) => `error: ${err}`,
          (n) => `value: ${n}`,
        ),
      );

    expect(render(E.right(10))).toBe("value: 10");
    expect(render(E.left("boom"))).toBe("error: boom");
  });
});

/**
 * Task is a type that represents an asynchronous computation that produces a value of type A. A
 * task can never fail, it always produces a value. It is a lazy computation, which means it does
 * not execute until it is explicitly invoked.
 */
describe("Task", () => {
  it("Task is a lazy async computation", async () => {
    let executed = false;

    const task: T.Task<number> = async () => {
      executed = true;
      return 42;
    };

    expect(executed).toBe(false);

    const result = await task();

    expect(executed).toBe(true);
    expect(result).toBe(42);
  });

  it("map transforms async results", async () => {
    const task = T.of(2);

    const result = pipe(
      task,
      T.map((n) => n * 2),
    );

    expect(await result()).toBe(4);
  });
});

/**
 * TaskEither is a type that combines the features of Either and Task. It represents an
 * asynchronous computation that can either fail with an error of type E (Left) or succeed with
 * a value of type A (Right). It is a powerful tool for modeling asynchronous computations that
 * can fail, such as network requests or database queries.
 */
describe("TaskEither", () => {
  it("TaskEither = async + failure", async () => {
    // Notice how similar this looks to the first Either test. The only difference is that the
    // functions are now async and we have to await the results.
    const success = TE.right(42);
    const failure = TE.left("error");

    expect(await success()).toEqual(E.right(42));
    expect(await failure()).toEqual(E.left("error"));
  });

  it("map works on the success side", async () => {
    const success = TE.right(2);
    const failure = TE.left("error");

    const double = (n: number) => n * 2;

    const successfulTask = pipe(success, TE.map(double));
    const failedTask = pipe(failure, TE.map(double));

    expect(await successfulTask()).toEqual(E.right(4));
    expect(await failedTask()).toEqual(E.left("error"));
  });

  it("short-circuits on failure", async () => {
    const fail: TE.TaskEither<string, number> = TE.left("boom");

    const result = await pipe(
      fail,
      TE.map((n) => n * 2), // never runs
    )();

    expect(result).toEqual(E.left("boom"));
  });

  it("match unwraps TaskEither", async () => {
    const result = await pipe(
      TE.right(10),
      TE.match(
        (err) => `error: ${err}`,
        (n) => `value: ${n}`,
      ),
    )();

    expect(result).toBe("value: 10");
  });

  it("flatMap chains async computations that can fail", async () => {
    const fetchUser = (id: number): TE.TaskEither<string, { id: number }> =>
      id === 1 ? TE.right({ id }) : TE.left("user not found");

    const fetchPosts = (user: {
      id: number;
    }): TE.TaskEither<string, string[]> =>
      user.id === 1 ? TE.right(["post1", "post2"]) : TE.left("no posts");

    const getPostsForUser = (id: number) =>
      pipe(fetchUser(id), TE.flatMap(fetchPosts));

    // The second function call is needed because TaskEither (like Task) is a lazy computation.
    // If we were to just call getPostsForUser(1), we would get back a TaskEither that has not
    // executed yet. By calling it again, we are invoking the TaskEither and getting back a Promise
    // that resolves to an Either.
    expect(await getPostsForUser(1)()).toEqual(E.right(["post1", "post2"]));
    expect(await getPostsForUser(2)()).toEqual(E.left("user not found"));
  });

  it("models a real async flow", async () => {
    const parseInput = (s: string): E.Either<string, number> => {
      const parsed = Number(s);

      return Number.isNaN(parsed) ? E.left("invalid number") : E.right(parsed);
    };

    const fetchFromApi = (n: number): TE.TaskEither<string, number> =>
      n > 0 ? TE.right(n * 2) : TE.left("negative number");

    const compute = (n: number): TE.TaskEither<string, number> =>
      TE.right(n + 1);

    const program = (input: string) =>
      pipe(
        input,
        parseInput, // Either
        TE.fromEither, // lift to TaskEither
        TE.flatMap(fetchFromApi),
        TE.flatMap(compute),
        TE.match(
          (err) => `error: ${err}`,
          (n) => `result: ${n}`,
        ),
      );

    expect(await program("2")()).toBe("result: 5");
    expect(await program("-1")()).toBe("error: negative number");
    expect(await program("abc")()).toBe("error: invalid number");
  });

  /**
   * flatMap is meant for chaining dependent computations, but another common pattern is where
   * multiple independent computations need to be run in parallel and their results combined.
   */
  it("combines independent TaskEithers with sequenceS", async () => {
    const fetchUser = TE.right({ id: 1 });
    const fetchSettings = TE.right({ theme: "dark" });

    const result = await pipe(
      {
        user: fetchUser,
        settings: fetchSettings,
      },
      // ApplicativePar makes sequenceS run the TaskEithers in parallel. This would be the
      // equivalent of using Promise.all. If we were to use sequenceS(TE.ApplicativeSeq), the
      // TaskEithers would run sequentially, which is the equivalent of using await on each one.
      // Although this would not feed the result of one TaskEither into the next, as flatMap does.
      sequenceS(TE.ApplicativePar), // await Promise.all([fetchUser, fetchSettings]);
      // sequenceS(TE.ApplicativeSeq), // [await fetchUser, await fetchSettings];
    )();

    expect(result).toEqual(
      E.right({
        user: { id: 1 },
        settings: { theme: "dark" },
      }),
    );
  });

  it("fails if any independent computation fails", async () => {
    const ok = TE.right<string, number>(1);
    const fail = TE.left<string, number>("boom");

    // Works identically with TE.ApplicativeSeq
    const result = await pipe({ ok, fail }, sequenceS(TE.ApplicativePar))();

    expect(result).toEqual(E.left("boom"));
  });
});
