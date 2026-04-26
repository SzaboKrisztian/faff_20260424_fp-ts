import { describe, expect, it } from "vitest";
import { pipe } from "fp-ts/function";
import * as A from "fp-ts/Array";
import * as Eq from "fp-ts/Eq";
import * as Ord from "fp-ts/Ord";
import * as M from "fp-ts/Monoid";
import * as N from "fp-ts/number";
import * as S from "fp-ts/string";
import * as B from "fp-ts/boolean";

describe("08 - Eq, Ord, Monoid", () => {
  it("Eq describes equality for a type", () => {
    const EqCaseInsensitiveString: Eq.Eq<string> = {
      equals: (a, b) => a.toLowerCase() === b.toLowerCase(),
    };

    expect(EqCaseInsensitiveString.equals("Chris", "chris")).toBe(true);
    expect(EqCaseInsensitiveString.equals("Chris", "Bob")).toBe(false);
  });

  it("Eq.struct builds equality for objects", () => {
    type User = {
      id: number;
      name: string;
    };

    const EqUserById: Eq.Eq<User> = Eq.struct({
      id: N.Eq,
    });

    expect(
      EqUserById.equals(
        { id: 1, name: "Chris" },
        { id: 1, name: "Different name" },
      ),
    ).toBe(true);

    expect(
      EqUserById.equals({ id: 1, name: "Chris" }, { id: 2, name: "Chris" }),
    ).toBe(false);
  });

  it("Array.uniq uses Eq to remove duplicates", () => {
    type User = {
      id: number;
      name: string;
    };

    const EqUserById: Eq.Eq<User> = Eq.struct({
      id: N.Eq,
    });

    const users: User[] = [
      { id: 1, name: "Chris" },
      { id: 2, name: "Ana" },
      { id: 1, name: "Duplicate Chris" },
    ];

    const result = pipe(users, A.uniq(EqUserById));

    expect(result).toEqual([
      { id: 1, name: "Chris" },
      { id: 2, name: "Ana" },
    ]);
  });

  it("Ord describes ordering for a type", () => {
    expect(N.Ord.compare(1, 2)).toBe(-1);
    expect(N.Ord.compare(2, 1)).toBe(1);
    expect(N.Ord.compare(2, 2)).toBe(0);
  });

  it("Array.sort uses Ord", () => {
    const result = pipe([3, 1, 2], A.sort(N.Ord));

    expect(result).toEqual([1, 2, 3]);
  });

  it("Ord.reverse reverses ordering", () => {
    const result = pipe([3, 1, 2], A.sort(Ord.reverse(N.Ord)));

    expect(result).toEqual([3, 2, 1]);
  });

  it("Ord.contramap derives ordering for objects", () => {
    type User = {
      id: number;
      name: string;
    };

    const OrdUserByName: Ord.Ord<User> = pipe(
      S.Ord,
      Ord.contramap((user: User) => user.name),
    );

    const users: User[] = [
      { id: 1, name: "Chris" },
      { id: 2, name: "Ana" },
      { id: 3, name: "Bogdan" },
    ];

    const result = pipe(users, A.sort(OrdUserByName));

    expect(result).toEqual([
      { id: 2, name: "Ana" },
      { id: 3, name: "Bogdan" },
      { id: 1, name: "Chris" },
    ]);
  });

  it("Ord.tuple sorts by multiple fields", () => {
    type User = {
      id: number;
      name: string;
      age: number;
    };

    const OrdUserByAgeThenName: Ord.Ord<User> = pipe(
      Ord.tuple(N.Ord, S.Ord),
      Ord.contramap((user: User) => [user.age, user.name] as const),
    );

    const users: User[] = [
      { id: 1, name: "Chris", age: 30 },
      { id: 2, name: "Ana", age: 30 },
      { id: 3, name: "Bogdan", age: 20 },
    ];

    const result = pipe(users, A.sort(OrdUserByAgeThenName));

    expect(result).toEqual([
      { id: 3, name: "Bogdan", age: 20 },
      { id: 2, name: "Ana", age: 30 },
      { id: 1, name: "Chris", age: 30 },
    ]);
  });

  it("Monoid is Semigroup plus an empty value", () => {
    expect(N.MonoidSum.concat(2, 3)).toBe(5);
    expect(N.MonoidSum.empty).toBe(0);

    expect(S.Monoid.concat("hello", " world")).toBe("hello world");
    expect(S.Monoid.empty).toBe("");
  });

  it("Monoid.concatAll combines many values", () => {
    const sum = M.concatAll(N.MonoidSum)([1, 2, 3, 4]);

    expect(sum).toBe(10);
  });

  it("different Monoids can exist for the same type", () => {
    const sum = M.concatAll(N.MonoidSum)([2, 3, 4]);
    const product = M.concatAll(N.MonoidProduct)([2, 3, 4]);

    expect(sum).toBe(9);
    expect(product).toBe(24);
  });

  it("Monoid.struct combines objects field by field", () => {
    type Metrics = {
      tasksCreated: number;
      tasksCompleted: number;
      hadErrors: boolean;
    };

    const MonoidMetrics: M.Monoid<Metrics> = M.struct({
      tasksCreated: N.MonoidSum,
      tasksCompleted: N.MonoidSum,
      hadErrors: B.MonoidAny,
    });

    const result = M.concatAll(MonoidMetrics)([
      { tasksCreated: 3, tasksCompleted: 1, hadErrors: false },
      { tasksCreated: 5, tasksCompleted: 4, hadErrors: true },
      { tasksCreated: 2, tasksCompleted: 2, hadErrors: false },
    ]);

    expect(result).toEqual({
      tasksCreated: 10,
      tasksCompleted: 7,
      hadErrors: true,
    });
  });

  it("Array.foldMap maps each item to a Monoid value, then combines them", () => {
    type Task = {
      title: string;
      estimateHours: number;
      completed: boolean;
    };

    const tasks: Task[] = [
      { title: "A", estimateHours: 2, completed: true },
      { title: "B", estimateHours: 3, completed: false },
      { title: "C", estimateHours: 5, completed: true },
    ];

    const totalEstimate = pipe(
      tasks,
      A.foldMap(N.MonoidSum)((task) => task.estimateHours),
    );

    expect(totalEstimate).toBe(10);
  });

  it("foldMap becomes powerful with Monoid.struct", () => {
    type Task = {
      title: string;
      estimateHours: number;
      completed: boolean;
    };

    type Summary = {
      totalEstimateHours: number;
      completedCount: number;
      hasIncompleteTasks: boolean;
    };

    const MonoidSummary: M.Monoid<Summary> = M.struct({
      totalEstimateHours: N.MonoidSum,
      completedCount: N.MonoidSum,
      hasIncompleteTasks: B.MonoidAny,
    });

    const tasks: Task[] = [
      { title: "A", estimateHours: 2, completed: true },
      { title: "B", estimateHours: 3, completed: false },
      { title: "C", estimateHours: 5, completed: true },
    ];

    const summary = pipe(
      tasks,
      A.foldMap(MonoidSummary)(
        (task): Summary => ({
          totalEstimateHours: task.estimateHours,
          completedCount: task.completed ? 1 : 0,
          hasIncompleteTasks: !task.completed,
        }),
      ),
    );

    expect(summary).toEqual({
      totalEstimateHours: 10,
      completedCount: 2,
      hasIncompleteTasks: true,
    });
  });
});
