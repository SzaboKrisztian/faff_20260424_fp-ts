# learn-fp-ts

A small, test-driven crash course for learning the core ideas of the `fp-ts` library.

This project is not a production app. It is a collection of focused Vitest examples that introduce the most useful `fp-ts` building blocks through small, executable lessons.

## What This Covers

The examples walk through a practical progression:

- `pipe` and `flow` for function composition
- `Option` for nullable or missing values
- `Either` for typed failures
- `Task` for lazy async computations
- `TaskEither` for async computations that can fail
- `Array` traversal and sequencing
- validation with accumulated errors
- do notation with `Do`, `bind`, `apS`, and `let`

## Project Structure

- `src/01-pipe-and-flow.test.ts`
  Introduces left-to-right composition with `pipe` and reusable function composition with `flow`.

- `src/02-option-map-flatmap-match.test.ts`
  Covers `Option`, including `some`, `none`, `fromNullable`, `map`, `flatMap`, `match`, and `getOrElse`.

- `src/03-task-either-taskeither.test.ts`
  Explains the difference between `Either`, `Task`, and `TaskEither`, including lazy async execution and error handling.

- `src/04-array.test.ts`
  Shows how arrays interact with `Either`, `TaskEither`, and `Option` using traversal, filtering, and partitioning.

- `src/05-validation.test.ts`
  Demonstrates domain error modeling and how to accumulate validation errors with `getApplicativeValidation` and a `Semigroup`.

- `src/06-do-bind-aps.test.ts`
  Introduces `fp-ts` do notation for combining dependent and independent computations in a readable way.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Run all lessons:

```bash
pnpm test
```

Run the first lesson only:

```bash
pnpm test1
```

## How To Use This Repo

The intended workflow is simple:

1. Open one test file at a time.
2. Read the comments and examples.
3. Run the tests.
4. Change the code, break it, and observe the types and failures.
5. Move to the next file once the current lesson feels clear.

Because the examples are small and isolated, this repo works well as a hands-on introduction to `fp-ts` without needing a larger application context.

## Why This Format

`fp-ts` can feel abstract when introduced through type classes and theory alone. This repo takes a more practical route:

- each concept is shown with runnable examples
- the tests act as documentation
- the topics build on each other in a useful order
- the examples stay close to real programming concerns like nullability, validation, async work, and composition

## Stack

- TypeScript
- Vitest
- `fp-ts`

## Goal

By the end of these exercises, you should be comfortable reading and writing small `fp-ts` pipelines, understanding when to use `Option` vs `Either` vs `TaskEither`, and recognizing the difference between dependent composition and independent combination.
