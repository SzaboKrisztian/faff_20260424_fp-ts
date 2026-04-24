import { describe, expect, it } from "vitest";
import { pipe, flow } from "fp-ts/function";

const addOne = (x: number): number => x + 1;
const double = (x: number) => x * 2;
const toString = (x: number): string => x.toString();

/**
 * The basic building block of fp-ts is the Pipe operator. Intuitively, you can use the operator
 * to chain a sequence of functions from left-to-right. The type definition of pipe takes an
 * arbitrary number of arguments. The first argument can be any arbitrary value and subsequent
 * arguments must be functions of arity one. The return type of a preceding function in the
 * pipeline must match the input type of the subsequent function.
 */
describe("pipe", () => {
  it("chains a sequence of functions from left-to-right", () => {
    // Try to uncomment the following function and see what happens:
    // const double = (x: number) => String(x * 2);

    // Notice that the return type is inferred
    const result1 = pipe(42, addOne);
    expect(result1).toBe(43);

    const result2 = pipe(1, addOne, double, toString);
    expect(result2).toBe("4");

    const result3 = pipe(2, double, (x) =>
      Array.from({ length: x }, (_, i) => i),
    );
    expect(result3).toEqual([0, 1, 2, 3]);
  });
});

/**
 * The flow operator is almost analogous to the pipe operator. The difference being the first
 * argument must be a function, rather than any arbitrary value, say a number. The first
 * function is also allowed to have an arity of more than one.
 *
 * What is a good use case for the flow operator? When should you use it over the pipe operator?
 * A general rule of thumb is when you want to avoid using an anonymous function.
 */
describe("flow", () => {
  const add = (x: number, y: number): number => x + y;

  it("chains a sequence of functions from left-to-right", () => {
    // The returned function from flow can have an arity of more than one, as long as the first
    // function has an arity of more than one.
    const addAndDouble = flow(add, double);
    const result1 = addAndDouble(1, 2);
    expect(result1).toBe(6);

    const addDoubleAndStringify = flow(add, double, toString);
    const result2 = addDoubleAndStringify(3, 4);
    expect(result2).toBe("14");
  });

  it("is useful for avoiding anonymous functions", () => {
    // The flow operator is useful for avoiding anonymous functions. For example, if we were to
    // use the pipe operator, we would have to write an anonymous function to chain the add and
    // double functions together.
    const concat = (a: number, transform: (x: number) => number) => [
      a,
      transform(a),
    ];
    const result1 = concat(1, (x) => pipe(x, addOne, double));
    expect(result1).toEqual([1, 4]);

    // With the flow operator, we can avoid the anonymous function and directly chain the add and
    // double functions together. The code is less verbose, and it lowers the chance of
    // shadowing variables from the outer scope.
    const result2 = concat(1, flow(addOne, double));
    expect(result2).toEqual([1, 4]);
  });
});
