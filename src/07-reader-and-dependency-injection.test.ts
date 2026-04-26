import { describe, expect, it } from "vitest";
import { pipe } from "fp-ts/function";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import * as R from "fp-ts/Reader";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";

/**
 * Reader<R, A> is just (env: R) => A.
 *
 * It represents a computation that needs some dependencies.
 */
describe("Reader and Dependency Injection", () => {
  it("Reader is a function from environment to value", () => {
    type Env = {
      appName: string;
    };

    const program: R.Reader<Env, string> = (env) => `Hello from ${env.appName}`;

    expect(program({ appName: "fp-ts" })).toBe("Hello from fp-ts");
  });

  it("ask returns the whole environment", () => {
    type Env = {
      appName: string;
      port: number;
    };

    const program: R.Reader<Env, Env> = R.ask<Env>();

    expect(program({ appName: "api", port: 3000 })).toEqual({
      appName: "api",
      port: 3000,
    });
  });

  it("asks selects something from the environment", () => {
    type Env = {
      config: {
        baseUrl: string;
      };
    };

    const getBaseUrl: R.Reader<Env, string> = R.asks(
      (env) => env.config.baseUrl,
    );

    expect(
      getBaseUrl({
        config: {
          baseUrl: "https://example.com",
        },
      }),
    ).toBe("https://example.com");
  });

  it("map transforms the output of a Reader", () => {
    type Env = { multiplier: number };

    const getMultiplier: R.Reader<Env, number> = R.asks(
      (env) => env.multiplier,
    );

    const doubled: R.Reader<Env, number> = pipe(
      getMultiplier,
      R.map((n) => n * 2),
    );

    expect(doubled({ multiplier: 5 })).toBe(10);
  });

  it("flatMap chains Readers that depend on the same environment", () => {
    type Env = {
      greeting: string;
      name: string;
    };

    const getGreeting: R.Reader<Env, string> = R.asks((env) => env.greeting);

    const greetByName = (greeting: string): R.Reader<Env, string> =>
      R.asks((env) => `${greeting}, ${env.name}!`);

    const program: R.Reader<Env, string> = pipe(
      getGreeting,
      R.flatMap(greetByName),
    );

    expect(program({ greeting: "Hello", name: "Chris" })).toBe("Hello, Chris!");
  });

  /**
   * local transforms the environment before passing it to a Reader.
   * This lets you adapt a Reader that expects one shape of environment
   * to work with a different (usually larger) one.
   */
  it("local adapts the environment for a Reader", () => {
    type SmallEnv = { name: string };
    type BigEnv = { user: { name: string }; debug: boolean };

    const greet: R.Reader<SmallEnv, string> = (env) => `Hi, ${env.name}`;

    const program: R.Reader<BigEnv, string> = pipe(
      greet,
      R.local((big: BigEnv): SmallEnv => ({ name: big.user.name })),
    );

    expect(program({ user: { name: "Chris" }, debug: true })).toBe("Hi, Chris");
  });
});

/**
 * ReaderTaskEither<R, E, A> is roughly:
 *
 * (env: R) => () => Promise<Either<E, A>>
 *
 * R = dependencies/config
 * E = possible error
 * A = successful result
 *
 * ReaderTaskEither lets us write programs that need dependencies, perform async work, and fail
 * in a typed way, without passing dependencies through every function manually.
 */
describe("ReaderTaskEither", () => {
  it("ReaderTaskEither is dependency injection + async + failure", async () => {
    type Env = {
      users: {
        findById: (id: number) => Promise<{ id: number; name: string } | null>;
      };
    };

    type AppError = {
      _tag: "UserNotFound";
      id: number;
    };

    const findUser =
      (
        id: number,
      ): RTE.ReaderTaskEither<Env, AppError, { id: number; name: string }> =>
      (env) =>
      async () => {
        const user = await env.users.findById(id);

        return user === null
          ? E.left({ _tag: "UserNotFound", id })
          : E.right(user);
      };

    const env: Env = {
      users: {
        findById: async (id) => (id === 1 ? { id: 1, name: "Chris" } : null),
      },
    };

    expect(await findUser(1)(env)()).toEqual(E.right({ id: 1, name: "Chris" }));

    expect(await findUser(2)(env)()).toEqual(
      E.left({ _tag: "UserNotFound", id: 2 }),
    );
  });

  it("asks can pull a dependency from the environment", async () => {
    type Env = {
      logger: {
        info: (message: string) => void;
      };
    };

    const messages: string[] = [];

    const logInfo = (message: string): RTE.ReaderTaskEither<Env, never, void> =>
      pipe(
        RTE.asks((env: Env) => env.logger),
        RTE.map((logger) => logger.info(message)),
      );

    const env: Env = {
      logger: {
        info: (message) => {
          messages.push(message);
        },
      },
    };

    const result = await logInfo("hello")(env)();

    expect(result).toEqual(E.right(undefined));
    expect(messages).toEqual(["hello"]);
  });

  it("fromTaskEither lifts normal TaskEither code into ReaderTaskEither", async () => {
    type Env = {
      config: {
        minPasswordLength: number;
      };
    };

    type AppError =
      | { _tag: "PasswordTooShort" }
      | { _tag: "PasswordMissingNumber" };

    const validatePasswordWithMinLength = (
      minLength: number,
      password: string,
    ): TE.TaskEither<AppError, string> =>
      pipe(
        password.length < minLength
          ? TE.left<AppError, string>({ _tag: "PasswordTooShort" })
          : TE.right<AppError, string>(password),
        TE.flatMap((validPassword) =>
          /\d/.test(validPassword)
            ? TE.right(validPassword)
            : TE.left({ _tag: "PasswordMissingNumber" } as AppError),
        ),
      );

    const validatePassword = (
      password: string,
    ): RTE.ReaderTaskEither<Env, AppError, string> =>
      pipe(
        RTE.asks((env: Env) => env.config.minPasswordLength),
        RTE.flatMap((minLength) =>
          RTE.fromTaskEither(
            validatePasswordWithMinLength(minLength, password),
          ),
        ),
      );

    const env: Env = {
      config: {
        minPasswordLength: 8,
      },
    };

    expect(await validatePassword("abc")(env)()).toEqual(
      E.left({ _tag: "PasswordTooShort" }),
    );

    expect(await validatePassword("abcdefgh")(env)()).toEqual(
      E.left({ _tag: "PasswordMissingNumber" }),
    );

    expect(await validatePassword("abcdefg1")(env)()).toEqual(
      E.right("abcdefg1"),
    );
  });

  it("composes injected dependencies with Do notation", async () => {
    type User = {
      id: number;
      name: string;
    };

    type Settings = {
      theme: "light" | "dark";
    };

    type Env = {
      users: {
        findById: (id: number) => Promise<User | null>;
      };
      settings: {
        findByUserId: (userId: number) => Promise<Settings>;
      };
    };

    type AppError = {
      _tag: "UserNotFound";
      id: number;
    };

    const findUser =
      (id: number): RTE.ReaderTaskEither<Env, AppError, User> =>
      (env) =>
      async () => {
        const user = await env.users.findById(id);

        return user === null
          ? E.left({ _tag: "UserNotFound", id })
          : E.right(user);
      };

    const findSettings =
      (user: User): RTE.ReaderTaskEither<Env, never, Settings> =>
      (env) =>
      async () => {
        const settings = await env.settings.findByUserId(user.id);
        return E.right(settings);
      };

    /**
     * bindW is used instead of bind, because the error type of findSettings is never, which is
     * not assignable to AppError. bindW widens the error type to never | AppError, which is
     * effectively just AppError. Try changing bindW to bind and see the type error!
     */
    const getUserProfile = (id: number) =>
      pipe(
        RTE.Do,
        RTE.bindW("user", () => findUser(id)),
        RTE.bindW("settings", ({ user }) => findSettings(user)),
        RTE.map(({ user, settings }) => ({
          id: user.id,
          name: user.name,
          theme: settings.theme,
        })),
      );

    const env: Env = {
      users: {
        findById: async (id) => (id === 1 ? { id: 1, name: "Chris" } : null),
      },
      settings: {
        findByUserId: async () => ({ theme: "dark" }),
      },
    };

    expect(await getUserProfile(1)(env)()).toEqual(
      E.right({
        id: 1,
        name: "Chris",
        theme: "dark",
      }),
    );

    expect(await getUserProfile(2)(env)()).toEqual(
      E.left({ _tag: "UserNotFound", id: 2 }),
    );
  });

  it("local adapts a larger environment to the smaller environment a program needs", async () => {
    type LoggerEnv = {
      logger: {
        info: (message: string) => void;
      };
    };

    type AppEnv = {
      config: {
        appName: string;
      };
      services: {
        logger: {
          info: (message: string) => void;
        };
      };
    };

    const messages: string[] = [];

    const logInfo = (
      message: string,
    ): RTE.ReaderTaskEither<LoggerEnv, never, void> =>
      pipe(
        RTE.asks((env: LoggerEnv) => env.logger),
        RTE.map((logger) => logger.info(message)),
      );

    const program: RTE.ReaderTaskEither<AppEnv, never, void> = pipe(
      logInfo("hello"),
      RTE.local(
        (env: AppEnv): LoggerEnv => ({
          logger: env.services.logger,
        }),
      ),
    );

    const env: AppEnv = {
      config: {
        appName: "api",
      },
      services: {
        logger: {
          info: (message) => {
            messages.push(message);
          },
        },
      },
    };

    const result = await program(env)();

    expect(result).toEqual(E.right(undefined));
    expect(messages).toEqual(["hello"]);
  });

  /**
   * right, left, and of are the simplest ways to lift pure values into
   * ReaderTaskEither. They ignore the environment entirely.
   */
  it("right and left lift pure values into RTE", async () => {
    const success = RTE.right(42);
    const failure = RTE.left("boom");

    expect(await success({})()).toEqual(E.right(42));
    expect(await failure({})()).toEqual(E.left("boom"));
  });

  it("fromEither lifts an Either into RTE", async () => {
    const fromRight = RTE.fromEither(E.right("ok"));
    const fromLeft = RTE.fromEither(E.left("fail"));

    expect(await fromRight({})()).toEqual(E.right("ok"));
    expect(await fromLeft({})()).toEqual(E.left("fail"));
  });

  it("fromOption lifts an Option into RTE, providing an error for None", async () => {
    const fromSome = RTE.fromOption(() => "not found")(O.some(42));
    const fromNone = RTE.fromOption(() => "not found")(O.none);

    expect(await fromSome({})()).toEqual(E.right(42));
    expect(await fromNone({})()).toEqual(E.left("not found"));
  });

  /**
   * fromPredicate creates an RTE that succeeds if a predicate holds,
   * or fails with a provided error otherwise. Useful for validation steps.
   */
  it("fromPredicate succeeds or fails based on a condition", async () => {
    const isPositive = RTE.fromPredicate(
      (n: number) => n > 0,
      (n) => `${n} is not positive`,
    );

    expect(await isPositive(5)({})()).toEqual(E.right(5));
    expect(await isPositive(-1)({})()).toEqual(E.left("-1 is not positive"));
  });

  /**
   * mapLeft transforms the error channel without affecting the success value.
   * Useful when composing programs that have different error types and you need
   * to normalize them.
   */
  it("mapLeft transforms the error channel", async () => {
    const program = pipe(
      RTE.left({ code: 404 }),
      RTE.mapLeft((err) => `Error: ${err.code}`),
    );

    expect(await program({})()).toEqual(E.left("Error: 404"));
  });

  /**
   * filterOrElse lets you assert a condition on the success value after
   * a computation, short-circuiting to an error if the predicate fails.
   */
  it("filterOrElse asserts a condition on the success value", async () => {
    type Env = { maxAge: number };

    const validateAge = (
      age: number,
    ): RTE.ReaderTaskEither<Env, string, number> =>
      pipe(
        RTE.right(age),
        RTE.filterOrElse(
          (a) => a >= 0,
          (a) => `Invalid age: ${a}`,
        ),
        RTE.filterOrElseW(
          (a) => a <= 150,
          (a) => `Unrealistic age: ${a}` as const,
        ),
      );

    expect(await validateAge(25)({} as Env)()).toEqual(E.right(25));
    expect(await validateAge(-1)({} as Env)()).toEqual(
      E.left("Invalid age: -1"),
    );
    expect(await validateAge(200)({} as Env)()).toEqual(
      E.left("Unrealistic age: 200"),
    );
  });

  /**
   * orElse lets you recover from an error by trying an alternative RTE.
   * orElseW is the same but widens the error type (useful when the recovery
   * path can fail with a different error type).
   */
  it("orElse recovers from an error with a fallback", async () => {
    type Env = {
      cache: Map<string, string>;
      db: Map<string, string>;
    };

    const fromCache =
      (key: string): RTE.ReaderTaskEither<Env, "cache-miss", string> =>
      (env) =>
      async () => {
        const value = env.cache.get(key);
        return value ? E.right(value) : E.left("cache-miss" as const);
      };

    const fromDb =
      (key: string): RTE.ReaderTaskEither<Env, "db-miss", string> =>
      (env) =>
      async () => {
        const value = env.db.get(key);
        return value ? E.right(value) : E.left("db-miss" as const);
      };

    const lookup = (key: string) =>
      pipe(
        fromCache(key),
        RTE.orElseW(() => fromDb(key)),
      );

    const env: Env = {
      cache: new Map([["a", "from-cache"]]),
      db: new Map([["b", "from-db"]]),
    };

    expect(await lookup("a")(env)()).toEqual(E.right("from-cache"));
    expect(await lookup("b")(env)()).toEqual(E.right("from-db"));
    expect(await lookup("c")(env)()).toEqual(E.left("db-miss"));
  });

  /**
   * tap runs a side-effectful RTE but discards its result, keeping the
   * original value flowing through the pipeline. Great for logging, auditing,
   * or triggering side effects without interrupting the main data flow.
   */
  it("tap runs a side-effect without changing the value", async () => {
    const log: string[] = [];

    type Env = {
      logger: (msg: string) => void;
    };

    const program = pipe(
      RTE.right(42),
      RTE.tap((value) => RTE.fromIO(() => log.push(`Got: ${value}`))),
      RTE.map((n) => n + 1),
    );

    const env: Env = { logger: (msg) => log.push(msg) };

    expect(await program(env)()).toEqual(E.right(43));
    expect(log).toEqual(["Got: 42"]);
  });

  /**
   * traverseArray maps each element of an array to a ReaderTaskEither
   * and collects the results. If any element fails, the whole thing fails.
   */
  it("traverseArray processes a list of items with RTE", async () => {
    type Env = {
      banned: string[];
    };

    type AppError = { _tag: "Banned"; name: string };

    const validateName =
      (name: string): RTE.ReaderTaskEither<Env, AppError, string> =>
      (env) =>
      async () =>
        env.banned.includes(name)
          ? E.left({ _tag: "Banned" as const, name })
          : E.right(name.toUpperCase());

    const validateAll = (names: string[]) =>
      pipe(names, RTE.traverseArray(validateName));

    const env: Env = { banned: ["evil"] };

    expect(await validateAll(["alice", "bob"])(env)()).toEqual(
      E.right(["ALICE", "BOB"]),
    );

    expect(await validateAll(["alice", "evil"])(env)()).toEqual(
      E.left({ _tag: "Banned", name: "evil" }),
    );
  });

  /**
   * match (and matchW) fold an RTE into a ReaderTask, handling both the
   * error and success branches. This is how you "exit" the Either and
   * produce a single unified result type.
   */
  it("match folds both error and success into a single value", async () => {
    type Env = { prefix: string };

    const succeed: RTE.ReaderTaskEither<Env, string, string> =
      RTE.right("data");
    const fail: RTE.ReaderTaskEither<Env, string, string> = RTE.left("oops");

    const handle = RTE.match(
      (err: string) => `Failed: ${err}`,
      (val: string) => `OK: ${val}`,
    );

    expect(await handle(succeed)({ prefix: "" })()).toBe("OK: data");
    expect(await handle(fail)({ prefix: "" })()).toBe("Failed: oops");
  });

  /**
   * flatMapEither chains an RTE with a function that returns a plain Either.
   * This is useful when a validation step is synchronous and doesn't need
   * the environment or async, avoiding the boilerplate of wrapping in RTE.
   */
  it("flatMapEither chains with a synchronous Either-returning function", async () => {
    const parsePositiveInt = (s: string): E.Either<string, number> => {
      const n = parseInt(s, 10);
      return isNaN(n)
        ? E.left(`"${s}" is not a number`)
        : n <= 0
          ? E.left(`${n} is not positive`)
          : E.right(n);
    };

    const program = (input: string) =>
      pipe(
        RTE.right(input),
        RTE.flatMapEither(parsePositiveInt),
        RTE.map((n) => n * 10),
      );

    expect(await program("5")({})()).toEqual(E.right(50));
    expect(await program("abc")({})()).toEqual(E.left('"abc" is not a number'));
    expect(await program("-3")({})()).toEqual(E.left("-3 is not positive"));
  });

  /**
   * let (aliased as RTE.let) adds a computed, non-effectful field to the
   * Do accumulator. Unlike bind, it doesn't run an RTE — it just derives
   * a value from what's already been accumulated.
   *
   * apSW adds an independent RTE computation to the Do accumulator.
   * Unlike bind, the computation doesn't have access to the accumulated
   * values — it runs independently and its result is added to the object.
   * apSW widens the error type, like bindW.
   */
  it("Do notation with let and apSW for non-dependent computations", async () => {
    type Env = {
      taxRate: number;
    };

    const getPrice = RTE.right(100);
    const getDiscount = RTE.right(0.1);

    const calculateTotal = pipe(
      RTE.Do,
      RTE.apSW("price", getPrice),
      RTE.apSW("discount", getDiscount),
      RTE.let(
        "discountedPrice",
        ({ price, discount }) => price * (1 - discount),
      ),
      RTE.bindW("tax", ({ discountedPrice }) =>
        RTE.asks((env: Env) => discountedPrice * env.taxRate),
      ),
      RTE.map(({ discountedPrice, tax }) => ({
        total: discountedPrice + tax,
      })),
    );

    expect(await calculateTotal({ taxRate: 0.2 })()).toEqual(
      E.right({ total: 108 }),
    );
  });
});
