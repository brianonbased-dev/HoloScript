// Test file to trigger type errors
const x: string = 42; // Type error: number is not assignable to string

interface TestInterface {
  name: string;
}

const test: TestInterface = { age: 25 }; // Type error: missing 'name' property

export { x, test };