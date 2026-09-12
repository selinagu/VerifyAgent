import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";

describe("application security headers", () => {
  it("allows only the documented Persona surfaces needed by the embedded flow", () => {
    const policy = contentSecurityPolicy(false);
    expect(policy).toContain("https://cdn.withpersona.com");
    expect(policy).toContain("frame-src 'self' https://inquiry.withpersona.com");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("default-src *");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("limits unsafe evaluation to development and grants camera access to Persona", () => {
    expect(contentSecurityPolicy(true)).toContain("'unsafe-eval'");
    const permissions = securityHeaders(false).find((header) => header.key === "Permissions-Policy")?.value;
    expect(permissions).toContain("camera=(self \"https://inquiry.withpersona.com\")");
    expect(permissions).toContain("microphone=()");
  });
});
