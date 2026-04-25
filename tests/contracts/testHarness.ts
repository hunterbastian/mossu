export type ContractTest = () => void;

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEqual<T>(actual: T, expected: T, message: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

export function assertDeepEqual(actual: unknown, expected: unknown, message: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

export function assertApprox(actual: number, expected: number, epsilon: number, message: string) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected} +/- ${epsilon}, got ${actual}`);
  }
}

export function runContracts(tests: Record<string, ContractTest>) {
  const failures: string[] = [];
  Object.entries(tests).forEach(([name, test]) => {
    try {
      test();
      console.log(`✓ ${name}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`${name}: ${detail}`);
      console.error(`✗ ${name}`);
      console.error(`  ${detail}`);
    }
  });

  if (failures.length > 0) {
    throw new Error(`Contract tests failed:\n${failures.join("\n")}`);
  }
}
