import { describe, it, expect } from "vitest";
import { pipe } from "fp-ts/function";
import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";

describe("Do notation, bind, and apS", () => {
  /**
   * Mental model:
   * bind = flatMap + add field to object
   */
  it("bind chains dependent computations", async () => {
    const fetchUser = (id: number): TE.TaskEither<string, { id: number }> =>
      TE.right({ id });

    // Normally the below param would be `user` and we would look up the posts in the db
    const fetchPosts = (_: { id: number }): TE.TaskEither<string, string[]> =>
      TE.right(["post1", "post2"]);

    // Is the equivalent of: flatMap(user => map(posts => ({ user, posts }))
    const program = pipe(
      TE.Do,
      TE.bind("user", () => fetchUser(1)),
      TE.bind("posts", ({ user }) => fetchPosts(user)),
    );

    const result = await program();

    expect(result).toEqual(
      E.right({
        user: { id: 1 },
        posts: ["post1", "post2"],
      }),
    );
  });

  /**
   * apS = sequenceS(ApplicativePar) but nicer syntax
   *
   * apS means "apply to a struct". It is used to combine independent computations into an
   * arbitrary object. The computations are independent, because they don't rely on the results
   * of each other.
   */
  it("apS combines independent computations", async () => {
    const fetchUser = TE.right<string, { id: number }>({ id: 1 });
    const fetchSettings = TE.right<string, { theme: string }>({
      theme: "dark",
    });

    const program = pipe(
      TE.Do,
      TE.apS("user", fetchUser), // independent
      TE.apS("settings", fetchSettings), // independent
    );

    const result = await program();

    expect(result).toEqual(
      E.right({
        user: { id: 1 },
        settings: { theme: "dark" },
      }),
    );
  });

  it("mixes independent and dependent steps", async () => {
    const fetchUser = TE.right<string, { id: number }>({ id: 1 });
    const fetchSettings = TE.right<string, { theme: string }>({
      theme: "dark",
    });

    const fetchPosts = (_: { id: number }): TE.TaskEither<string, string[]> =>
      TE.right(["post1", "post2"]);

    const program = pipe(
      TE.Do,
      TE.apS("user", fetchUser), // independent
      TE.apS("settings", fetchSettings), // independent
      TE.bind("posts", ({ user }) => fetchPosts(user)), // dependent
    );

    const result = await program();

    expect(result).toEqual(
      E.right({
        user: { id: 1 },
        settings: { theme: "dark" },
        posts: ["post1", "post2"],
      }),
    );
  });

  it("short-circuits on first failure", async () => {
    const ok = TE.right<string, number>(1);
    const fail = TE.left<string, number>("boom");

    const program = pipe(
      TE.Do,
      TE.apS("a", ok),
      TE.apS("b", fail),
      TE.apS("c", ok), // never runs
    );

    const result = await program();

    expect(result).toEqual(E.left("boom"));
  });

  it("adds derived values with let", async () => {
    const program = pipe(
      TE.Do,
      TE.apS("a", TE.right(2)),
      TE.apS("b", TE.right(3)),
      TE.let("sum", ({ a, b }) => a + b),
    );

    const result = await program();

    expect(result).toEqual(E.right({ a: 2, b: 3, sum: 5 }));
  });

  /**
   * The Do notation is just syntax sugar for flatMap and map, but it allows writing much nicer
   * looking code, especially when you have a lot of steps. You can also mix and match bind, apS,
   * and let steps. The following snippet:
   *
   * const program = pipe(
   *   TE.Do,
   *   TE.apS("user", fetchUser),
   *   TE.bind("posts", ({ user }) => fetchPosts(user)),
   *   TE.let("count", ({ posts }) => posts.length),
   * );
   *
   * is equivalent to:
   *
   * const program = pipe(
   *  fetchUser,
   *   TE.flatMap(user =>
   *     pipe(
   *       fetchPosts(user),
   *       TE.map(posts => ({ user, posts })),
   *     ),
   *   ),
   *   TE.map(({ user, posts }) => ({ user, posts, count: posts.length })),
   * );
   */
});
