import { describe, expect, it } from "vitest";
import { pipe } from "fp-ts/function";
import * as E from "fp-ts/Either";
import * as IO from "fp-ts/IO";
import * as IOE from "fp-ts/IOEither";
import * as TE from "fp-ts/TaskEither";

describe("009 - IO and side effects", () => {
  it("IO is a lazy synchronous side effect", () => {
    const effects: string[] = [];

    const program: IO.IO<number> = () => {
      effects.push("executed");
      return 42;
    };

    expect(effects).toEqual([]);

    const result = program();

    expect(result).toBe(42);
    expect(effects).toEqual(["executed"]);
  });

  it("IO.map transforms the result without running the effect immediately", () => {
    let executed = false;

    const readNumber: IO.IO<number> = () => {
      executed = true;
      return 21;
    };

    const program = pipe(
      readNumber,
      IO.map((n) => n * 2),
    );

    expect(executed).toBe(false);

    expect(program()).toBe(42);
    expect(executed).toBe(true);
  });

  it("IO is useful for Date.now, Math.random, logging, and other sync effects", () => {
    const now: IO.IO<number> = () => Date.now();

    const result = now();

    expect(typeof result).toBe("number");
  });

  it("IOEither is lazy synchronous side effect + failure", () => {
    type ConfigError = {
      _tag: "MissingEnvVar";
      key: string;
    };

    const readEnvVar =
      (
        key: string,
        env: Record<string, string | undefined>,
      ): IOE.IOEither<ConfigError, string> =>
      () => {
        const value = env[key];

        return value === undefined
          ? E.left({ _tag: "MissingEnvVar", key })
          : E.right(value);
      };

    const env = {
      API_URL: "https://example.com",
    };

    expect(readEnvVar("API_URL", env)()).toEqual(
      E.right("https://example.com"),
    );

    expect(readEnvVar("MISSING", env)()).toEqual(
      E.left({ _tag: "MissingEnvVar", key: "MISSING" }),
    );
  });

  it("IOEither.tryCatch wraps throwing synchronous code", () => {
    type JsonError = {
      _tag: "InvalidJson";
      message: string;
    };

    const parseJson = (input: string): IOE.IOEither<JsonError, unknown> =>
      IOE.tryCatch(
        () => JSON.parse(input),
        (error): JsonError => ({
          _tag: "InvalidJson",
          message: error instanceof Error ? error.message : "unknown error",
        }),
      );

    expect(parseJson('{"ok": true}')()).toEqual(E.right({ ok: true }));

    expect(parseJson("{bad json")()).toEqual(
      E.left({
        _tag: "InvalidJson",
        message: expect.any(String),
      }),
    );
  });

  it("IOEither.map and flatMap compose synchronous fallible effects", () => {
    type ConfigError =
      | { _tag: "MissingEnvVar"; key: string }
      | { _tag: "InvalidPort"; value: string };

    const readEnvVar =
      (
        key: string,
        env: Record<string, string | undefined>,
      ): IOE.IOEither<ConfigError, string> =>
      () => {
        const value = env[key];

        return value === undefined
          ? E.left({ _tag: "MissingEnvVar", key })
          : E.right(value);
      };

    const parsePort = (value: string): IOE.IOEither<ConfigError, number> =>
      IOE.tryCatch(
        () => {
          const port = Number(value);

          if (!Number.isInteger(port)) {
            throw new Error("invalid port");
          }

          return port;
        },
        () => ({ _tag: "InvalidPort", value }),
      );

    const readPort = (
      env: Record<string, string | undefined>,
    ): IOE.IOEither<ConfigError, number> =>
      pipe(readEnvVar("PORT", env), IOE.flatMap(parsePort));

    expect(readPort({ PORT: "3000" })()).toEqual(E.right(3000));

    expect(readPort({})()).toEqual(
      E.left({ _tag: "MissingEnvVar", key: "PORT" }),
    );

    expect(readPort({ PORT: "abc" })()).toEqual(
      E.left({ _tag: "InvalidPort", value: "abc" }),
    );
  });

  it("TE.fromIO lifts IO into a TaskEither pipeline", async () => {
    const readTimestamp: IO.IO<number> = () => 123456;

    const program = pipe(
      TE.right<string, string>("hello"),
      TE.bindTo("message"),
      TE.bind("timestamp", () => TE.fromIO(readTimestamp)),
    );

    const result = await program();

    expect(result).toEqual(
      E.right({
        message: "hello",
        timestamp: 123456,
      }),
    );
  });

  it("TE.fromIOEither lifts IOEither into a TaskEither pipeline", async () => {
    type ConfigError = {
      _tag: "MissingEnvVar";
      key: string;
    };

    const readEnvVar =
      (
        key: string,
        env: Record<string, string | undefined>,
      ): IOE.IOEither<ConfigError, string> =>
      () => {
        const value = env[key];

        return value === undefined
          ? E.left({ _tag: "MissingEnvVar", key })
          : E.right(value);
      };

    const program = pipe(
      TE.Do,
      TE.bind("apiUrl", () =>
        TE.fromIOEither(
          readEnvVar("API_URL", {
            API_URL: "https://example.com",
          }),
        ),
      ),
      TE.bind("response", ({ apiUrl }) =>
        TE.right(`would fetch from ${apiUrl}`),
      ),
    );

    const result = await program();

    expect(result).toEqual(
      E.right({
        apiUrl: "https://example.com",
        response: "would fetch from https://example.com",
      }),
    );
  });

  it("tapIO runs a synchronous side effect inside TaskEither without changing the result", async () => {
    const logs: string[] = [];

    const log =
      (message: string): IO.IO<void> =>
      () => {
        logs.push(message);
      };

    const program = pipe(
      TE.right<string, number>(42),
      TE.tapIO((n) => log(`got ${n}`)),
      TE.map((n) => n * 2),
    );

    const result = await program();

    expect(result).toEqual(E.right(84));
    expect(logs).toEqual(["got 42"]);
  });

  it("tapIO does not run when the TaskEither is already Left", async () => {
    const logs: string[] = [];

    const log =
      (message: string): IO.IO<void> =>
      () => {
        logs.push(message);
      };

    const program = pipe(
      TE.left<string, number>("boom"),
      TE.tapIO((n) => log(`got ${n}`)),
    );

    const result = await program();

    expect(result).toEqual(E.left("boom"));
    expect(logs).toEqual([]);
  });
});
