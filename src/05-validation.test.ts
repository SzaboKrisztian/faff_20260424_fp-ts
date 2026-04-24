import { describe, it, expect } from "vitest";
import { pipe } from "fp-ts/function";
import * as A from "fp-ts/Array";
import * as E from "fp-ts/Either";
import * as RA from "fp-ts/ReadonlyArray";
import * as NEA from "fp-ts/NonEmptyArray";
import { sequenceS } from "fp-ts/Apply";

/**
 * So far, we have used strings for errors, for example:
 *
 * const parse = (s: string): E.Either<string, number>
 *
 * This is fine for simple examples, but in a real application, you would want to use a more
 * structured type for errors, that offer better type safety, more information, and allows for
 * easier handling downstream.
 *
 * For example:
 */
type InvalidNumberError = {
  _tag: "InvalidNumber";
  input: string;
};

type NegativeNumberError = {
  _tag: "NegativeNumber";
  value: number;
};

type ParseError = InvalidNumberError | NegativeNumberError;

/**
 * Now our functions can return more structured errors:
 */
const parseNumber = (s: string): E.Either<ParseError, number> => {
  const n = Number(s);
  return isNaN(n) ? E.left({ _tag: "InvalidNumber", input: s }) : E.right(n);
};

const ensurePositive = (n: number): E.Either<ParseError, number> =>
  n < 0 ? E.left({ _tag: "NegativeNumber", value: n }) : E.right(n);

/**
 * And pattern matching on the error becomes easier and more type safe:
 */
const renderError = (e: ParseError): string => {
  switch (e._tag) {
    case "InvalidNumber":
      return `Invalid input: ${e.input}`;
    case "NegativeNumber":
      return `Negative value: ${e.value}`;
  }
};

const identity = <A>(a: A): A => a;

describe("Error modelling and validation", () => {
  it("models domain errors explicitly", () => {
    const success = pipe("42", parseNumber, E.flatMap(ensurePositive));
    expect(success).toEqual(E.right(42));

    const invalidInput = pipe("abc", parseNumber, E.flatMap(ensurePositive));
    expect(invalidInput).toEqual(
      E.left({ _tag: "InvalidNumber", input: "abc" }),
    );
    expect(E.match(renderError, identity)(invalidInput)).toBe(
      "Invalid input: abc",
    );

    const negativeValue = pipe("-5", parseNumber, E.flatMap(ensurePositive));
    expect(negativeValue).toEqual(
      E.left({ _tag: "NegativeNumber", value: -5 }),
    );
    expect(E.match(renderError, identity)(negativeValue)).toBe(
      "Negative value: -5",
    );
  });

  /**
   * But an issue with this is that we are stopping on the first error:
   */
  it("Either stops on first error", () => {
    const validate = (s: string): E.Either<string, number> =>
      isNaN(Number(s)) ? E.left(`invalid: ${s}`) : E.right(Number(s));

    const result = pipe(
      ["1", "oops", "bad"],
      A.traverse(E.Applicative)(validate),
    );

    // "bad" is never checked
    expect(result).toEqual(E.left("invalid: oops"));
  });

  /**
   * Accumulating errors is a common requirement for validation:
   */
  it("can accumulate errors with a Semigroup", () => {
    // We can use a Semigroup to accumulate errors. A Semigroup is a type class that defines how
    // to combine two values of the same type. A Semigroup defines a concat function that takes two
    // values, and returns a new value. Let's look at an example of a Semigroup for strings:
    const semigroupString = RA.getSemigroup<string>();

    // Build a validation applicative
    const V = E.getApplicativeValidation(semigroupString);

    const validate = (s: string): E.Either<string[], number> =>
      isNaN(Number(s)) ? E.left([`invalid: ${s}`]) : E.right(Number(s));

    const result = pipe(["1", "oops", "bad"], A.traverse(V)(validate));

    // Using a validation applicative, we treat the traversal as a series of independent
    // computations, accumulating all errors instead of short-circuiting on the first failure.
    expect(result).toEqual(E.left(["invalid: oops", "invalid: bad"]));
  });

  it("a Semigroup can be used to accumulate errors of any type, not just strings", () => {
    type PasswordValidationError =
      | { _tag: "PasswordTooShort" }
      | { _tag: "PasswordMissingNumber" }
      | { _tag: "PasswordMissingLowercase" }
      | { _tag: "PasswordMissingUppercase" }
      | { _tag: "PasswordMissingSpecialCharacter" };

    // Slightly nicer semantics than just using PasswordValidationError[], because in the Left
    // case the error array is always guaranteed to be non-empty.
    type PasswordValidationResult = E.Either<
      NEA.NonEmptyArray<PasswordValidationError>,
      string
    >;

    // Because the Semigroup (see further down) needs to return the same type as the type of its
    // two arguments, we need to wrap our error type in a NonEmptyArray, so that the Semigroup can
    // concatenate the arrays of errors together.
    const validatePasswordLength = (
      password: string,
    ): PasswordValidationResult =>
      password.length < 8
        ? E.left([{ _tag: "PasswordTooShort" }])
        : E.right(password);

    const validatePasswordNumber = (
      password: string,
    ): PasswordValidationResult =>
      /\d/.test(password)
        ? E.right(password)
        : E.left([{ _tag: "PasswordMissingNumber" }]);

    const validatePasswordLowercase = (
      password: string,
    ): PasswordValidationResult =>
      /[a-z]/.test(password)
        ? E.right(password)
        : E.left([{ _tag: "PasswordMissingLowercase" }]);

    const validatePasswordUppercase = (
      password: string,
    ): PasswordValidationResult =>
      /[A-Z]/.test(password)
        ? E.right(password)
        : E.left([{ _tag: "PasswordMissingUppercase" }]);

    const validatePasswordSpecialCharacter = (
      password: string,
    ): PasswordValidationResult =>
      /[!@#$%^&*]/.test(password)
        ? E.right(password)
        : E.left([{ _tag: "PasswordMissingSpecialCharacter" }]);

    const semigroupPasswordValidation =
      RA.getSemigroup<PasswordValidationError>();

    // The above is equivalent to:
    // const semigroupPasswordValidation = {
    //   concat: (x: PasswordValidationError[], y: PasswordValidationError[]) =>
    //     [...x, ...y],
    // }

    const V = E.getApplicativeValidation(semigroupPasswordValidation);

    // Each check returns the original password on success.
    // sequenceS(V) runs all independent checks and accumulates all Left values. If one or more
    // checks fail, we return an array of the accumulated errors. If all checks succeed, we discard
    // the object of Right values and return the original password.
    const validatePassword = (password: string) =>
      pipe(
        {
          length: validatePasswordLength(password),
          number: validatePasswordNumber(password),
          lowercase: validatePasswordLowercase(password),
          uppercase: validatePasswordUppercase(password),
          specialCharacter: validatePasswordSpecialCharacter(password),
        },
        sequenceS(V),
        E.map(() => password),
      );

    expect(validatePassword("{}")).toEqual(
      E.left([
        { _tag: "PasswordTooShort" },
        { _tag: "PasswordMissingNumber" },
        { _tag: "PasswordMissingLowercase" },
        { _tag: "PasswordMissingUppercase" },
        { _tag: "PasswordMissingSpecialCharacter" },
      ]),
    );

    expect(validatePassword("password")).toEqual(
      E.left([
        { _tag: "PasswordMissingNumber" },
        { _tag: "PasswordMissingUppercase" },
        { _tag: "PasswordMissingSpecialCharacter" },
      ]),
    );

    expect(validatePassword("Password1!")).toEqual(E.right("Password1!"));
  });

  it("a Semigroup can be used to accumulate errors, revisited", () => {
    // If we really insist on the validators returning single, specific errors instead of arrays
    // of the broader type, we can lift the error type at the check boundary.
    type PasswordTooShortError = { _tag: "PasswordTooShort" };
    type PasswordMissingNumberError = { _tag: "PasswordMissingNumber" };
    type PasswordMissingLowercaseError = { _tag: "PasswordMissingLowercase" };
    type PasswordMissingUppercaseError = { _tag: "PasswordMissingUppercase" };
    type PasswordMissingSpecialCharacterError = {
      _tag: "PasswordMissingSpecialCharacter";
    };

    type PasswordValidationError =
      | PasswordTooShortError
      | PasswordMissingNumberError
      | PasswordMissingLowercaseError
      | PasswordMissingUppercaseError
      | PasswordMissingSpecialCharacterError;

    const validatePasswordLength = (
      password: string,
    ): E.Either<PasswordTooShortError, string> =>
      password.length < 8
        ? E.left({ _tag: "PasswordTooShort" })
        : E.right(password);

    const validatePasswordNumber = (
      password: string,
    ): E.Either<PasswordMissingNumberError, string> =>
      /\d/.test(password)
        ? E.right(password)
        : E.left({ _tag: "PasswordMissingNumber" });

    const validatePasswordLowercase = (
      password: string,
    ): E.Either<PasswordMissingLowercaseError, string> =>
      /[a-z]/.test(password)
        ? E.right(password)
        : E.left({ _tag: "PasswordMissingLowercase" });

    const validatePasswordUppercase = (
      password: string,
    ): E.Either<PasswordMissingUppercaseError, string> =>
      /[A-Z]/.test(password)
        ? E.right(password)
        : E.left({ _tag: "PasswordMissingUppercase" });

    const validatePasswordSpecialCharacter = (
      password: string,
    ): E.Either<PasswordMissingSpecialCharacterError, string> =>
      /[!@#$%^&*]/.test(password)
        ? E.right(password)
        : E.left({ _tag: "PasswordMissingSpecialCharacter" });

    // This is the new liftError function that takes an Either with a single error, and lifts
    // it to an Either with an array of errors, by wrapping the error in an array. This allows
    // us to write our validators in a more intuitive way, while still being able to use the
    // same validation applicative to accumulate errors.
    const liftError = <E, A>(e: E.Either<E, A>): E.Either<E[], A> =>
      pipe(
        e,
        E.mapLeft((err) => [err]),
      );

    const semigroupPasswordValidation =
      RA.getSemigroup<PasswordValidationError>();

    const V = E.getApplicativeValidation(semigroupPasswordValidation);

    const validatePassword = (password: string) =>
      pipe(
        {
          // This is where we lift the error type at the check boundary
          length: liftError(validatePasswordLength(password)),
          number: liftError(validatePasswordNumber(password)),
          lowercase: liftError(validatePasswordLowercase(password)),
          uppercase: liftError(validatePasswordUppercase(password)),
          specialCharacter: liftError(
            validatePasswordSpecialCharacter(password),
          ),
        },
        sequenceS(V),
        E.map(() => password),
      );

    expect(validatePassword("{}")).toEqual(
      E.left([
        { _tag: "PasswordTooShort" },
        { _tag: "PasswordMissingNumber" },
        { _tag: "PasswordMissingLowercase" },
        { _tag: "PasswordMissingUppercase" },
        { _tag: "PasswordMissingSpecialCharacter" },
      ]),
    );

    expect(validatePassword("password")).toEqual(
      E.left([
        { _tag: "PasswordMissingNumber" },
        { _tag: "PasswordMissingUppercase" },
        { _tag: "PasswordMissingSpecialCharacter" },
      ]),
    );

    expect(validatePassword("Password1!")).toEqual(E.right("Password1!"));
  });
});
