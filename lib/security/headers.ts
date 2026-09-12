export const PERSONA_CDN_ORIGIN = "https://cdn.withpersona.com";
export const PERSONA_FRAME_ORIGIN = "https://inquiry.withpersona.com";

export function contentSecurityPolicy(development = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""} ${PERSONA_CDN_ORIGIN}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.withpersona.com",
    "connect-src 'self' https://*.withpersona.com",
    `frame-src 'self' ${PERSONA_FRAME_ORIGIN} https://*.withpersona.com`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(development = false) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(development) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: `camera=(self \"${PERSONA_FRAME_ORIGIN}\"), microphone=(), geolocation=()` },
  ];
}
