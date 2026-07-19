type JsonHeaders = Record<string, string>;

function jsonError(status: number, error: string, corsHeaders: JsonHeaders): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    let normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4 !== 0) normalized += "=";
    return JSON.parse(atob(normalized)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasAdminRole(value: unknown): boolean {
  if (value === "admin" || value === "service_role") return true;
  return Array.isArray(value) && value.some((role) => role === "admin" || role === "service_role");
}

function isAuthorizedAdmin(payload: Record<string, unknown>): boolean {
  if (hasAdminRole(payload.role)) return true;

  const app = asRecord(payload.app_metadata);
  const user = asRecord(payload.user_metadata);

  return (
    hasAdminRole(app.role) ||
    hasAdminRole(app.roles) ||
    app.is_admin === true ||
    hasAdminRole(user.role) ||
    hasAdminRole(user.roles) ||
    user.is_admin === true
  );
}

export function requireAdmin(req: Request, corsHeaders: JsonHeaders): Response | null {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return jsonError(401, "unauthorized", corsHeaders);

  const payload = decodeJwtPayload(token);
  if (!payload) return jsonError(401, "unauthorized", corsHeaders);
  if (!isAuthorizedAdmin(payload)) return jsonError(403, "forbidden", corsHeaders);

  return null;
}
