import { redactSensitive } from "./redaction";

export function logStructured(event: Record<string, unknown>): void {
  console.info(JSON.stringify(redactSensitive(event)));
}
