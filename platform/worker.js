import {
  PASS_CATALOG,
  clampInteger,
  makeDrawCode,
  makeSerial,
  makeZone,
  normalizeAccessCode,
  passMeta,
  randomHex,
  sanitizeCode,
  validIsoDate,
  validTime
} from "./lib.js";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    code TEXT NOT NULL COLLATE NOCASE,
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    venue TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(event_id, code, event_date)
  )`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    serial TEXT NOT NULL COLLATE NOCASE UNIQUE,
    pass_type TEXT NOT NULL,
    rarity TEXT NOT NULL,
    zone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','USED','REVOKED')),
    draw_code TEXT NOT NULL COLLATE NOCASE UNIQUE,
    draw_code_key TEXT NOT NULL COLLATE NOCASE UNIQUE,
    verify_token TEXT NOT NULL COLLATE NOCASE UNIQUE,
    batch_id TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    draw_expires_at TEXT,
    claimed_at TEXT,
    claim_id TEXT UNIQUE,
    attendee_name TEXT NOT NULL DEFAULT '',
    used_at TEXT,
    revoked_at TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TRIGGER IF NOT EXISTS block_ticket_insert_deleted_session
    BEFORE INSERT ON tickets
    FOR EACH ROW
    WHEN EXISTS (SELECT 1 FROM sessions WHERE id = NEW.session_id AND deleted_at IS NOT NULL)
    BEGIN
      SELECT RAISE(ABORT, 'SESSION_DELETED');
    END`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS issue_requests (
    request_id TEXT PRIMARY KEY,
    payload_hash TEXT NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    bucket TEXT PRIMARY KEY,
    window_started_at INTEGER NOT NULL,
    request_count INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_event_date ON sessions(event_id, event_date, start_time)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_visible_date ON sessions(deleted_at, event_date, start_time)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_session_claim ON tickets(session_id, claimed_at, status)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_batch ON tickets(batch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at)`,
  `PRAGMA optimize`
];

const schemaReady = new WeakMap();

async function ensureSchema(db) {
  if (!schemaReady.has(db)) {
    schemaReady.set(db, db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((error) => {
      schemaReady.delete(db);
      throw error;
    }));
  }
  return schemaReady.get(db);
}

function nowIso() {
  return new Date().toISOString();
}

function nextIso(previous) {
  const current = Date.now();
  const prior = Date.parse(previous ?? "");
  return new Date(Number.isFinite(prior) && current <= prior ? prior + 1 : current).toISOString();
}

function calendarDateInTaipei(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function uuid(prefix) {
  const value = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${randomHex(8)}`;
  return `${prefix}_${value}`;
}

function text(value, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const ownOrigin = new URL(request.url).origin;
  if (origin === ownOrigin) return origin;
  const configured = String(env.ALLOWED_ORIGINS ?? "https://xieyaozhong.github.io")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.includes(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function corsHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  const headers = {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin"
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function response(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders(request, env) });
}

function ok(request, env, data, status = 200) {
  return response(request, env, { ok: true, data }, status);
}

function fail(request, env, status, code, message) {
  return response(request, env, { ok: false, error: { code, message } }, status);
}

async function readJson(request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 32_768) {
    throw Object.assign(new Error("Request body is too large."), { status: 413, code: "BODY_TOO_LARGE" });
  }
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch {
    throw Object.assign(new Error("Request body must be a JSON object."), { status: 400, code: "INVALID_JSON" });
  }
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function safeEqual(left, right) {
  const [a, b] = await Promise.all([digest(String(left)), digest(String(right))]);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

async function requireAdmin(request, env) {
  if (!env.THEARD_ADMIN_KEY) return false;
  const header = request.headers.get("Authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  return supplied.length >= 12 && safeEqual(supplied, env.THEARD_ADMIN_KEY);
}

async function rateLimited(request, env, action, limit = 40) {
  const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? "local";
  const key = await digest(`${env.THEARD_RATE_KEY ?? env.THEARD_ADMIN_KEY ?? "theard"}|${ip}|${action}`);
  const currentWindow = Math.floor(Date.now() / 60_000);
  const result = await env.DB.prepare(`
    INSERT INTO rate_limits (bucket, window_started_at, request_count)
    VALUES (?, ?, 1)
    ON CONFLICT(bucket) DO UPDATE SET
      window_started_at = CASE WHEN rate_limits.window_started_at = excluded.window_started_at THEN rate_limits.window_started_at ELSE excluded.window_started_at END,
      request_count = CASE WHEN rate_limits.window_started_at = excluded.window_started_at THEN rate_limits.request_count + 1 ELSE 1 END
    RETURNING request_count
  `).bind(key, currentWindow).first();
  return Number(result?.request_count ?? 1) > limit;
}

async function audit(db, action, entityType, entityId, detail = {}) {
  const createdAt = nowIso();
  await db.prepare(`INSERT INTO audit_logs (id, action, entity_type, entity_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(uuid("log"), action, entityType, entityId, JSON.stringify(detail), createdAt)
    .run();
}

function publicSession(row, availableCount = undefined) {
  return {
    id: row.session_id,
    eventId: row.event_id,
    eventName: row.event_name,
    eventCode: row.event_code,
    sessionCode: row.session_code,
    date: row.event_date,
    time: row.start_time,
    venue: row.venue,
    note: row.session_note,
    status: row.session_status,
    ...(availableCount === undefined ? {} : { availableCount })
  };
}

function publicTicket(row) {
  return {
    id: row.ticket_id,
    serial: row.serial,
    passType: row.pass_type,
    rarity: row.rarity,
    zone: row.zone,
    status: row.ticket_status,
    verifyToken: row.verify_token,
    attendeeName: row.attendee_name ?? ""
  };
}

const CODE_QUERY = `
  SELECT
    t.id AS ticket_id, t.serial, t.pass_type, t.rarity, t.zone,
    t.status AS ticket_status, t.verify_token, t.draw_code, t.draw_expires_at,
    t.claimed_at, t.claim_id, t.attendee_name,
    s.id AS session_id, s.code AS session_code, s.event_date, s.start_time,
    s.venue, s.note AS session_note, s.status AS session_status, s.deleted_at AS session_deleted_at,
    e.id AS event_id, e.code AS event_code, e.name AS event_name, e.status AS event_status
  FROM tickets t
  JOIN sessions s ON s.id = t.session_id
  JOIN events e ON e.id = s.event_id
  WHERE t.draw_code_key = ?
`;

async function lookupCode(db, code) {
  return db.prepare(CODE_QUERY).bind(normalizeAccessCode(code)).first();
}

async function availableForSession(db, sessionId) {
  const row = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM tickets t
    JOIN sessions s ON s.id = t.session_id
    WHERE t.session_id = ? AND s.deleted_at IS NULL
      AND t.status = 'ACTIVE' AND t.claimed_at IS NULL
      AND (t.draw_expires_at IS NULL OR t.draw_expires_at > ?)
  `).bind(sessionId, nowIso()).first();
  return Number(row?.count ?? 0);
}

async function handlePublicSessions(request, env) {
  const currentTime = nowIso();
  const currentDate = calendarDateInTaipei();
  const rows = await env.DB.prepare(`
    SELECT
      s.id AS session_id, s.code AS session_code, s.event_date, s.start_time,
      s.venue, s.note AS session_note, s.status AS session_status,
      e.id AS event_id, e.code AS event_code, e.name AS event_name, e.status AS event_status,
      COUNT(t.id) AS issued_count,
      SUM(CASE WHEN t.claimed_at IS NOT NULL THEN 1 ELSE 0 END) AS claimed_count,
      SUM(CASE WHEN t.status = 'ACTIVE' AND t.claimed_at IS NULL
        AND (t.draw_expires_at IS NULL OR t.draw_expires_at > ?) THEN 1 ELSE 0 END) AS available_count
    FROM sessions s
    JOIN events e ON e.id = s.event_id
    LEFT JOIN tickets t ON t.session_id = s.id
    WHERE s.deleted_at IS NULL AND s.status = 'OPEN' AND e.status = 'PUBLISHED' AND s.event_date >= ?
    GROUP BY s.id
    ORDER BY s.event_date ASC, s.start_time ASC, e.name ASC, s.code ASC
    LIMIT 24
  `).bind(currentTime, currentDate).all();
  const sessions = (rows.results ?? []).map((row) => ({
    id: row.session_id,
    eventId: row.event_id,
    eventName: row.event_name,
    eventCode: row.event_code,
    eventStatus: row.event_status,
    sessionCode: row.session_code,
    date: row.event_date,
    time: row.start_time,
    venue: row.venue,
    note: row.session_note,
    status: row.session_status,
    totals: {
      issued: Number(row.issued_count ?? 0),
      available: Number(row.available_count ?? 0),
      claimed: Number(row.claimed_count ?? 0)
    }
  }));
  return ok(request, env, { sessions, syncedAt: currentTime });
}

function codeUnavailable(row) {
  if (!row || row.session_deleted_at || row.ticket_status === "REVOKED" || row.event_status === "CLOSED") return true;
  if (row.claimed_at) return false;
  if (row.ticket_status !== "ACTIVE" || row.session_status !== "OPEN") return true;
  return Boolean(row.draw_expires_at && row.draw_expires_at <= nowIso());
}

async function handleLookup(request, env) {
  if (await rateLimited(request, env, "lookup", 60)) return fail(request, env, 429, "RATE_LIMITED", "嘗試次數過多，請稍後再試。");
  const body = await readJson(request);
  const key = normalizeAccessCode(body.code);
  if (key.length < 12) return fail(request, env, 404, "CODE_UNAVAILABLE", "抽取碼無效、已停用或已過期。");
  const row = await lookupCode(env.DB, key);
  if (codeUnavailable(row)) return fail(request, env, 404, "CODE_UNAVAILABLE", "抽取碼無效、已停用或已過期。");
  const availableCount = await availableForSession(env.DB, row.session_id);
  return ok(request, env, {
    session: publicSession(row, availableCount),
    code: { claimed: Boolean(row.claimed_at), claimedAt: row.claimed_at ?? null }
  });
}

async function handleClaim(request, env) {
  if (await rateLimited(request, env, "claim", 30)) return fail(request, env, 429, "RATE_LIMITED", "嘗試次數過多，請稍後再試。");
  const body = await readJson(request);
  const key = normalizeAccessCode(body.code);
  if (key.length < 12) return fail(request, env, 404, "CODE_UNAVAILABLE", "抽取碼無效、已停用或已過期。");
  let row = await lookupCode(env.DB, key);
  if (codeUnavailable(row)) return fail(request, env, 404, "CODE_UNAVAILABLE", "抽取碼無效、已停用或已過期。");

  let recovered = Boolean(row.claimed_at);
  if (!recovered) {
    const claimedAt = nowIso();
    const claimId = uuid("clm");
    const attendeeName = text(body.attendeeName, 60);
    const result = await env.DB.prepare(`
      UPDATE tickets
      SET claimed_at = ?, claim_id = ?, attendee_name = ?, updated_at = ?
      WHERE id = ? AND draw_code_key = ? AND claimed_at IS NULL AND status = 'ACTIVE'
        AND (draw_expires_at IS NULL OR draw_expires_at > ?)
        AND EXISTS (
          SELECT 1 FROM sessions s
          JOIN events e ON e.id = s.event_id
          WHERE s.id = tickets.session_id AND s.deleted_at IS NULL
            AND s.status = 'OPEN' AND e.status = 'PUBLISHED'
        )
    `).bind(claimedAt, claimId, attendeeName, claimedAt, row.ticket_id, key, claimedAt).run();

    if (Number(result?.meta?.changes ?? 0) === 1) {
      await audit(env.DB, "DRAW_CLAIMED", "ticket", row.ticket_id, { claimId, sessionId: row.session_id });
    } else {
      recovered = true;
    }
    row = await lookupCode(env.DB, key);
  }

  if (!row?.claimed_at) return fail(request, env, 409, "CLAIM_CONFLICT", "票券正在處理中，請重新輸入抽取碼。");
  const availableCount = await availableForSession(env.DB, row.session_id);
  return ok(request, env, {
    session: publicSession(row, availableCount),
    ticket: publicTicket(row),
    claim: { id: row.claim_id, claimedAt: row.claimed_at, attendeeName: row.attendee_name ?? "", recovered }
  });
}

function validateIssue(body) {
  const eventName = text(body.eventName, 60);
  const eventCode = sanitizeCode(body.eventCode, 12);
  const sessionCode = sanitizeCode(body.sessionCode, 10);
  const date = text(body.date, 10);
  const time = text(body.time, 5);
  const requestedQuantity = Number(body.quantity);
  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 25) {
    throw Object.assign(new Error("每次可發行 1–25 張票券；更多票券請分批發行。"), { status: 400, code: "INVALID_QUANTITY" });
  }
  const quantity = requestedQuantity;
  const startNumber = clampInteger(body.startNumber, 1, 999_999, 1);
  const meta = passMeta(body.passType);
  const rawExpiry = text(body.drawExpiresAt, 40);
  let drawExpiresAt = null;
  if (!eventName || eventCode.length < 2 || !sessionCode || !validIsoDate(date) || !validTime(time)) {
    throw Object.assign(new Error("請確認活動名稱、代碼、場次、日期與時間。"), { status: 400, code: "INVALID_SESSION" });
  }
  if (rawExpiry) {
    const expiry = new Date(rawExpiry);
    if (Number.isNaN(expiry.valueOf())) {
      throw Object.assign(new Error("抽取碼到期時間格式不正確。"), { status: 400, code: "INVALID_EXPIRY" });
    }
    if (expiry.valueOf() <= Date.now()) {
      throw Object.assign(new Error("抽取碼到期時間必須晚於現在。"), { status: 400, code: "EXPIRY_IN_PAST" });
    }
    drawExpiresAt = expiry.toISOString();
  }
  return {
    eventName,
    eventCode,
    sessionCode,
    date,
    time,
    quantity,
    startNumber,
    passType: meta.passType,
    rarity: meta.rarity,
    venue: text(body.venue, 80),
    note: text(body.note, 180),
    drawExpiresAt
  };
}

async function handleIssue(request, env) {
  const body = await readJson(request);
  const requestId = text(body.requestId, 96);
  if (!/^[A-Za-z0-9_-]{12,96}$/.test(requestId)) {
    return fail(request, env, 400, "REQUEST_ID_REQUIRED", "發行請求缺少有效的重試識別碼，請重新整理後再試。");
  }
  const fingerprint = Object.fromEntries(Object.keys(body).filter((key) => key !== "requestId").sort().map((key) => [key, body[key]]));
  const payloadHash = await digest(JSON.stringify(fingerprint));
  const prior = await env.DB.prepare(`SELECT payload_hash, response_json FROM issue_requests WHERE request_id = ?`).bind(requestId).first();
  if (prior) {
    if (prior.payload_hash !== payloadHash) return fail(request, env, 409, "REQUEST_ID_CONFLICT", "此發行請求識別碼已用於不同內容。");
    const cached = JSON.parse(prior.response_json);
    const cachedSession = cached?.session?.id
      ? await env.DB.prepare(`SELECT deleted_at FROM sessions WHERE id = ?`).bind(cached.session.id).first()
      : null;
    if (!cachedSession || cachedSession.deleted_at) {
      return fail(request, env, 409, "SESSION_DELETED", "此發行請求所屬場次已刪除，不能重新送出舊的票券資料。");
    }
    return ok(request, env, cached, 201);
  }
  const data = validateIssue(body);

  const now = nowIso();
  const eventId = `evt_${data.eventCode}`;
  const sessionId = `${data.eventCode}-${data.date.replaceAll("-", "")}-${data.sessionCode}`;
  const batchId = `bat_${data.eventCode}_${Date.now().toString(36)}_${randomHex(3)}`;
  const existingSession = await env.DB.prepare(`
    SELECT s.status, s.deleted_at, s.start_time, s.venue, s.note, e.name AS event_name
    FROM sessions s JOIN events e ON e.id = s.event_id
    WHERE s.id = ?
  `).bind(sessionId).first();
  if (existingSession?.deleted_at) {
    return fail(request, env, 409, "SESSION_DELETED", "此活動代碼、日期與場次碼已刪除；請改用新的場次碼。");
  }
  if (existingSession?.status === "CLOSED") {
    return fail(request, env, 409, "SESSION_CLOSED", "此場次已關閉；請先在後台重新開啟後再發行。");
  }
  if (existingSession && (
    existingSession.event_name !== data.eventName
    || existingSession.start_time !== data.time
    || existingSession.venue !== data.venue
    || existingSession.note !== data.note
  )) {
    return fail(request, env, 409, "SESSION_METADATA_CONFLICT", "此場次已存在但資料不同；請先使用場次編輯功能，再發行新的票券批次。");
  }
  const existingEvent = await env.DB.prepare(`SELECT name FROM events WHERE id = ?`).bind(eventId).first();
  if (existingEvent && existingEvent.name !== data.eventName) {
    return fail(request, env, 409, "EVENT_METADATA_CONFLICT", "此活動代碼已使用其他活動名稱，請確認活動代碼。");
  }

  const existingResult = await env.DB.prepare(`SELECT serial FROM tickets WHERE session_id = ?`).bind(sessionId).all();
  const existing = new Set((existingResult.results ?? []).map((row) => String(row.serial).toUpperCase()));
  const issued = [];
  let number = data.startNumber;
  while (issued.length < data.quantity) {
    const serial = makeSerial(data.eventCode, data.date, data.sessionCode, number);
    const currentNumber = number;
    number += 1;
    if (existing.has(serial)) continue;
    const drawCode = makeDrawCode(data.eventCode, data.sessionCode);
    issued.push({
      id: uuid("tkt"),
      serial,
      passType: data.passType,
      rarity: data.rarity,
      zone: makeZone(data.passType, currentNumber),
      drawCode,
      drawCodeKey: normalizeAccessCode(drawCode),
      verifyToken: randomHex(16)
    });
    existing.add(serial);
  }

  const resultData = {
    session: {
      id: sessionId,
      eventId,
      eventName: data.eventName,
      eventCode: data.eventCode,
      sessionCode: data.sessionCode,
      date: data.date,
      time: data.time,
      venue: data.venue,
      note: data.note,
      status: "OPEN"
    },
    batch: { id: batchId, requestId, issued: issued.length, passType: data.passType },
    tickets: issued.map(({ drawCodeKey, ...ticket }) => ticket)
  };

  const statements = [
    env.DB.prepare(`
      INSERT INTO events (id, code, name, note, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'PUBLISHED', ?, ?)
      ON CONFLICT(code) DO NOTHING
    `).bind(eventId, data.eventCode, data.eventName, data.note, now, now),
    env.DB.prepare(`
      INSERT INTO sessions (id, event_id, code, event_date, start_time, venue, note, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
      ON CONFLICT(id) DO UPDATE SET start_time = excluded.start_time, venue = excluded.venue, note = excluded.note, updated_at = excluded.updated_at
    `).bind(sessionId, eventId, data.sessionCode, data.date, data.time, data.venue, data.note, now, now),
    ...issued.map((ticket) => env.DB.prepare(`
      INSERT INTO tickets (
        id, session_id, serial, pass_type, rarity, zone, status,
        draw_code, draw_code_key, verify_token, batch_id, issued_at,
        draw_expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      ticket.id,
      sessionId,
      ticket.serial,
      ticket.passType,
      ticket.rarity,
      ticket.zone,
      ticket.drawCode,
      ticket.drawCodeKey,
      ticket.verifyToken,
      batchId,
      now,
      data.drawExpiresAt,
      now
    )),
    env.DB.prepare(`INSERT INTO issue_requests (request_id, payload_hash, response_json, created_at) VALUES (?, ?, ?, ?)`)
      .bind(requestId, payloadHash, JSON.stringify(resultData), now),
    env.DB.prepare(`INSERT INTO audit_logs (id, action, entity_type, entity_id, detail_json, created_at) VALUES (?, 'BATCH_ISSUED', 'session', ?, ?, ?)`)
      .bind(uuid("log"), sessionId, JSON.stringify({ batchId, requestId, quantity: issued.length, passType: data.passType }), now)
  ];

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const raced = await env.DB.prepare(`SELECT payload_hash, response_json FROM issue_requests WHERE request_id = ?`).bind(requestId).first();
    if (raced) {
      if (raced.payload_hash !== payloadHash) return fail(request, env, 409, "REQUEST_ID_CONFLICT", "此發行請求識別碼已用於不同內容。");
      const cached = JSON.parse(raced.response_json);
      const cachedSession = cached?.session?.id
        ? await env.DB.prepare(`SELECT deleted_at FROM sessions WHERE id = ?`).bind(cached.session.id).first()
        : null;
      if (!cachedSession || cachedSession.deleted_at) {
        return fail(request, env, 409, "SESSION_DELETED", "此發行請求所屬場次已刪除，不能重新送出舊的票券資料。");
      }
      return ok(request, env, cached, 201);
    }
    const deletedSession = await env.DB.prepare(`SELECT deleted_at FROM sessions WHERE id = ?`).bind(sessionId).first();
    if (deletedSession?.deleted_at) {
      return fail(request, env, 409, "SESSION_DELETED", "場次已刪除，不能再加入票券。");
    }
    throw error;
  }
  return ok(request, env, resultData, 201);
}

function adminTicket(row) {
  return {
    id: row.id,
    serial: row.serial,
    passType: row.pass_type,
    rarity: row.rarity,
    zone: row.zone,
    status: row.status,
    drawCode: row.draw_code,
    verifyToken: row.verify_token,
    batchId: row.batch_id,
    issuedAt: row.issued_at,
    expiresAt: row.draw_expires_at,
    claimedAt: row.claimed_at,
    claimId: row.claim_id,
    attendeeName: row.attendee_name,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at
  };
}

async function handleAdminState(request, env) {
  const currentTime = nowIso();
  const sessionRows = await env.DB.prepare(`
    SELECT
      s.id, s.event_id, s.code AS session_code, s.event_date, s.start_time,
      s.venue, s.note, s.status, s.created_at, s.updated_at,
      e.name AS event_name, e.code AS event_code,
      COUNT(t.id) AS issued_count,
      SUM(CASE WHEN t.status = 'ACTIVE' AND t.claimed_at IS NULL
        AND (t.draw_expires_at IS NULL OR t.draw_expires_at > ?)
        AND s.status = 'OPEN' AND e.status = 'PUBLISHED' THEN 1 ELSE 0 END) AS available_count,
      SUM(CASE WHEN t.claimed_at IS NOT NULL THEN 1 ELSE 0 END) AS claimed_count,
      SUM(CASE WHEN t.status = 'USED' THEN 1 ELSE 0 END) AS used_count,
      SUM(CASE WHEN t.status = 'REVOKED' THEN 1 ELSE 0 END) AS revoked_count
    FROM sessions s
    JOIN events e ON e.id = s.event_id
    LEFT JOIN tickets t ON t.session_id = s.id
    WHERE s.deleted_at IS NULL
    GROUP BY s.id
    ORDER BY s.event_date DESC, s.start_time DESC, s.created_at DESC
  `).bind(currentTime).all();
  const ticketRows = await env.DB.prepare(`
    SELECT t.* FROM tickets t
    JOIN sessions s ON s.id = t.session_id
    WHERE s.deleted_at IS NULL
    ORDER BY t.issued_at DESC, t.serial DESC
  `).all();
  const ticketsBySession = new Map();
  for (const row of ticketRows.results ?? []) {
    if (!ticketsBySession.has(row.session_id)) ticketsBySession.set(row.session_id, []);
    ticketsBySession.get(row.session_id).push(adminTicket(row));
  }
  const sessions = (sessionRows.results ?? []).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    eventName: row.event_name,
    eventCode: row.event_code,
    sessionCode: row.session_code,
    date: row.event_date,
    time: row.start_time,
    venue: row.venue,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totals: {
      issued: Number(row.issued_count ?? 0),
      available: Number(row.available_count ?? 0),
      claimed: Number(row.claimed_count ?? 0),
      used: Number(row.used_count ?? 0),
      revoked: Number(row.revoked_count ?? 0)
    },
    tickets: ticketsBySession.get(row.id) ?? []
  }));
  return ok(request, env, { sessions, syncedAt: nowIso() });
}

async function handleTicketPatch(request, env, ticketId) {
  const body = await readJson(request);
  const status = String(body.status ?? "").toUpperCase();
  if (!new Set(["ACTIVE", "USED", "REVOKED"]).has(status)) return fail(request, env, 400, "INVALID_STATUS", "票券狀態不正確。");
  const ticket = await env.DB.prepare(`
    SELECT t.status, t.claimed_at
    FROM tickets t JOIN sessions s ON s.id = t.session_id
    WHERE t.id = ? AND s.deleted_at IS NULL
  `).bind(ticketId).first();
  if (!ticket) return fail(request, env, 404, "NOT_FOUND", "找不到票券。");
  if (status === "USED" && !ticket.claimed_at) return fail(request, env, 409, "NOT_CLAIMED", "尚未領取的票券不能標記為已使用。");
  if (ticket.status === "REVOKED" && status !== "REVOKED") return fail(request, env, 409, "INVALID_TRANSITION", "已撤銷的票券不能重新啟用。");
  if (ticket.status === "USED" && status === "ACTIVE") return fail(request, env, 409, "INVALID_TRANSITION", "已使用的票券不能重新啟用。");
  const now = nowIso();
  const result = await env.DB.prepare(`
    UPDATE tickets SET
      status = ?,
      used_at = CASE WHEN ? = 'USED' THEN COALESCE(used_at, ?) ELSE used_at END,
      revoked_at = CASE WHEN ? = 'REVOKED' THEN COALESCE(revoked_at, ?) ELSE revoked_at END,
      updated_at = ?
    WHERE id = ? AND EXISTS (
      SELECT 1 FROM sessions s WHERE s.id = tickets.session_id AND s.deleted_at IS NULL
    )
  `).bind(status, status, now, status, now, now, ticketId).run();
  if (Number(result?.meta?.changes ?? 0) !== 1) return fail(request, env, 404, "NOT_FOUND", "找不到票券。");
  await audit(env.DB, "TICKET_STATUS_CHANGED", "ticket", ticketId, { status });
  return ok(request, env, { id: ticketId, status, updatedAt: now });
}

async function handleRegenerate(request, env, ticketId) {
  const row = await env.DB.prepare(`
    SELECT t.id, t.claimed_at, t.status, t.draw_expires_at, t.draw_code_key,
      e.code AS event_code, e.status AS event_status, s.code AS session_code, s.status AS session_status
    FROM tickets t JOIN sessions s ON s.id = t.session_id JOIN events e ON e.id = s.event_id
    WHERE t.id = ? AND s.deleted_at IS NULL
  `).bind(ticketId).first();
  if (!row) return fail(request, env, 404, "NOT_FOUND", "找不到票券。");
  if (row.claimed_at) return fail(request, env, 409, "ALREADY_CLAIMED", "已抽取的票券不能重新產生抽取碼。");
  if (row.status !== "ACTIVE") return fail(request, env, 409, "NOT_ACTIVE", "只有啟用中的票券可以重新產生抽取碼。");
  if (row.session_status !== "OPEN" || row.event_status !== "PUBLISHED") return fail(request, env, 409, "SESSION_CLOSED", "場次目前未開放抽取。");
  if (row.draw_expires_at && row.draw_expires_at <= nowIso()) return fail(request, env, 409, "CODE_EXPIRED", "抽取碼已過期，請發行新的票券批次。");
  const drawCode = makeDrawCode(row.event_code, row.session_code);
  const updatedAt = nowIso();
  const result = await env.DB.prepare(`
    UPDATE tickets SET draw_code = ?, draw_code_key = ?, updated_at = ?
    WHERE id = ? AND draw_code_key = ? AND claimed_at IS NULL AND status = 'ACTIVE'
      AND (draw_expires_at IS NULL OR draw_expires_at > ?)
      AND EXISTS (
        SELECT 1 FROM sessions s JOIN events e ON e.id = s.event_id
        WHERE s.id = tickets.session_id AND s.deleted_at IS NULL
          AND s.status = 'OPEN' AND e.status = 'PUBLISHED'
      )
  `).bind(drawCode, normalizeAccessCode(drawCode), updatedAt, ticketId, row.draw_code_key, updatedAt).run();
  if (Number(result?.meta?.changes ?? 0) !== 1) return fail(request, env, 409, "CODE_CHANGED", "票券狀態剛剛已變更，請同步後再試。");
  await audit(env.DB, "DRAW_CODE_REGENERATED", "ticket", ticketId);
  return ok(request, env, { id: ticketId, drawCode, updatedAt });
}

async function handleSessionPatch(request, env, sessionId) {
  const body = await readJson(request);
  const immutableFields = ["id", "eventId", "eventName", "eventCode", "sessionCode", "date", "deletedAt"];
  if (immutableFields.some((field) => Object.hasOwn(body, field))) {
    return fail(request, env, 400, "IMMUTABLE_FIELD", "活動名稱、活動代碼、場次碼與日期已綁定既有票券；若填寫錯誤，請刪除未領取場次後重新建立。");
  }
  const expectedUpdatedAt = text(body.expectedUpdatedAt, 40);
  if (!expectedUpdatedAt) return fail(request, env, 400, "EXPECTED_VERSION_REQUIRED", "請先同步最新場次資料再操作。");
  const session = await env.DB.prepare(`
    SELECT id, start_time, venue, note, status, updated_at
    FROM sessions WHERE id = ? AND deleted_at IS NULL
  `).bind(sessionId).first();
  if (!session) return fail(request, env, 404, "NOT_FOUND", "找不到場次，可能已被刪除。");
  if (session.updated_at !== expectedUpdatedAt) {
    return fail(request, env, 409, "SESSION_CHANGED", "場次資料剛剛已更新，請同步後再試。");
  }

  if (Object.hasOwn(body, "status")) {
    const status = String(body.status ?? "").toUpperCase();
    if (!new Set(["OPEN", "CLOSED"]).has(status)) return fail(request, env, 400, "INVALID_STATUS", "場次狀態不正確。");
    if (status === session.status) return ok(request, env, { id: sessionId, status, updatedAt: session.updated_at, unchanged: true });
    const updatedAt = nextIso(session.updated_at);
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE sessions SET status = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL AND updated_at = ?
      `).bind(status, updatedAt, sessionId, expectedUpdatedAt),
      env.DB.prepare(`
        INSERT INTO audit_logs (id, action, entity_type, entity_id, detail_json, created_at)
        SELECT ?, 'SESSION_STATUS_CHANGED', 'session', ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ? AND deleted_at IS NULL AND updated_at = ?)
      `).bind(uuid("log"), sessionId, JSON.stringify({ before: session.status, after: status }), updatedAt, sessionId, updatedAt)
    ]);
    if (Number(results?.[0]?.meta?.changes ?? 0) !== 1) {
      return fail(request, env, 409, "SESSION_CHANGED", "場次資料剛剛已更新，請同步後再試。");
    }
    return ok(request, env, { id: sessionId, status, updatedAt });
  }

  if (!["time", "venue", "note"].some((field) => Object.hasOwn(body, field))) {
    return fail(request, env, 400, "INVALID_UPDATE", "沒有可更新的場次欄位。");
  }
  const rawTime = String(Object.hasOwn(body, "time") ? body.time : session.start_time).trim();
  const rawVenue = String(Object.hasOwn(body, "venue") ? body.venue : session.venue).trim();
  const rawNote = String(Object.hasOwn(body, "note") ? body.note : session.note).trim();
  if (!validTime(rawTime) || rawVenue.length > 80 || rawNote.length > 180) {
    return fail(request, env, 400, "INVALID_SESSION", "請確認開始時間、場地與公開說明的格式及長度。");
  }
  const changed = {};
  if (rawTime !== session.start_time) changed.time = { before: session.start_time, after: rawTime };
  if (rawVenue !== session.venue) changed.venue = { before: session.venue, after: rawVenue };
  if (rawNote !== session.note) changed.note = { before: session.note, after: rawNote };
  if (!Object.keys(changed).length) {
    return ok(request, env, {
      id: sessionId, time: session.start_time, venue: session.venue, note: session.note,
      updatedAt: session.updated_at, unchanged: true
    });
  }
  const updatedAt = nextIso(session.updated_at);
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE sessions SET start_time = ?, venue = ?, note = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL AND updated_at = ?
    `).bind(rawTime, rawVenue, rawNote, updatedAt, sessionId, expectedUpdatedAt),
    env.DB.prepare(`
      INSERT INTO audit_logs (id, action, entity_type, entity_id, detail_json, created_at)
      SELECT ?, 'SESSION_UPDATED', 'session', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ? AND deleted_at IS NULL AND updated_at = ?)
    `).bind(uuid("log"), sessionId, JSON.stringify({ changed }), updatedAt, sessionId, updatedAt)
  ]);
  if (Number(results?.[0]?.meta?.changes ?? 0) !== 1) {
    return fail(request, env, 409, "SESSION_CHANGED", "場次資料剛剛已更新，請同步後再試。");
  }
  return ok(request, env, { id: sessionId, time: rawTime, venue: rawVenue, note: rawNote, updatedAt });
}

async function handleSessionDelete(request, env, sessionId) {
  const body = await readJson(request);
  const expectedUpdatedAt = text(body.expectedUpdatedAt, 40);
  if (!expectedUpdatedAt) return fail(request, env, 400, "EXPECTED_VERSION_REQUIRED", "請先同步最新場次資料再刪除。");
  const session = await env.DB.prepare(`
    SELECT s.id, s.status, s.updated_at,
      COUNT(t.id) AS issued_count,
      SUM(CASE WHEN t.claimed_at IS NOT NULL OR t.status = 'USED' THEN 1 ELSE 0 END) AS protected_count
    FROM sessions s LEFT JOIN tickets t ON t.session_id = s.id
    WHERE s.id = ? AND s.deleted_at IS NULL
    GROUP BY s.id
  `).bind(sessionId).first();
  if (!session) return fail(request, env, 404, "NOT_FOUND", "找不到場次，可能已被刪除。");
  if (session.updated_at !== expectedUpdatedAt) {
    return fail(request, env, 409, "SESSION_CHANGED", "場次資料剛剛已更新，請同步後重新確認刪除。");
  }
  if (Number(session.protected_count ?? 0) > 0) {
    return fail(request, env, 409, "SESSION_HAS_CLAIMS", "此場次已有參加者領票，為保留票券與核銷紀錄不能刪除；請改為關閉場次。");
  }
  const deletedAt = nextIso(session.updated_at);
  const detail = JSON.stringify({ issued: Number(session.issued_count ?? 0), previousStatus: session.status });
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE sessions SET status = 'CLOSED', deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL AND updated_at = ?
        AND NOT EXISTS (
          SELECT 1 FROM tickets
          WHERE session_id = sessions.id AND (claimed_at IS NOT NULL OR status = 'USED')
        )
    `).bind(deletedAt, deletedAt, sessionId, expectedUpdatedAt),
    env.DB.prepare(`
      UPDATE tickets SET status = 'REVOKED', revoked_at = COALESCE(revoked_at, ?), updated_at = ?
      WHERE session_id = ? AND claimed_at IS NULL AND status = 'ACTIVE'
        AND EXISTS (SELECT 1 FROM sessions WHERE id = ? AND deleted_at = ?)
    `).bind(deletedAt, deletedAt, sessionId, sessionId, deletedAt),
    env.DB.prepare(`
      INSERT INTO audit_logs (id, action, entity_type, entity_id, detail_json, created_at)
      SELECT ?, 'SESSION_DELETED', 'session', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ? AND deleted_at = ?)
    `).bind(uuid("log"), sessionId, detail, deletedAt, sessionId, deletedAt)
  ]);
  if (Number(results?.[0]?.meta?.changes ?? 0) !== 1) {
    const latest = await env.DB.prepare(`
      SELECT s.deleted_at, s.updated_at,
        SUM(CASE WHEN t.claimed_at IS NOT NULL OR t.status = 'USED' THEN 1 ELSE 0 END) AS protected_count
      FROM sessions s LEFT JOIN tickets t ON t.session_id = s.id
      WHERE s.id = ? GROUP BY s.id
    `).bind(sessionId).first();
    if (!latest || latest.deleted_at) return fail(request, env, 404, "NOT_FOUND", "場次已被刪除。");
    if (Number(latest.protected_count ?? 0) > 0) {
      return fail(request, env, 409, "SESSION_HAS_CLAIMS", "刪除前已有參加者完成領票，場次已保留；請改為關閉場次。");
    }
    return fail(request, env, 409, "SESSION_CHANGED", "場次資料剛剛已更新，請同步後重新確認刪除。");
  }
  return ok(request, env, {
    id: sessionId,
    deletedAt,
    affectedTickets: Number(results?.[1]?.meta?.changes ?? 0)
  });
}

async function handleVerify(request, env, url) {
  if (await rateLimited(request, env, "verify", 90)) return fail(request, env, 429, "RATE_LIMITED", "驗證次數過多，請稍後再試。");
  const body = request.method.toUpperCase() === "POST" ? await readJson(request) : Object.fromEntries(url.searchParams);
  const serial = text(body.serial, 60).toUpperCase();
  const token = text(body.token, 64).toUpperCase();
  if (!serial || token.length < 24) return fail(request, env, 404, "NOT_FOUND", "查無此票券或驗證資訊不正確。");
  const row = await env.DB.prepare(`
    SELECT t.status AS ticket_status, t.serial, t.pass_type, t.rarity, t.zone, t.claimed_at,
      s.id AS session_id, s.code AS session_code, s.event_date, s.start_time, s.venue,
      e.code AS event_code, e.name AS event_name
    FROM tickets t JOIN sessions s ON s.id = t.session_id JOIN events e ON e.id = s.event_id
    WHERE t.serial = ? AND t.verify_token = ? AND s.deleted_at IS NULL
  `).bind(serial, token).first();
  if (!row) return fail(request, env, 404, "NOT_FOUND", "查無此票券或驗證資訊不正確。");
  return ok(request, env, {
    valid: row.ticket_status === "ACTIVE" && Boolean(row.claimed_at),
    status: row.ticket_status,
    ticket: { serial: row.serial, passType: row.pass_type, rarity: row.rarity, zone: row.zone, claimedAt: row.claimed_at },
    session: {
      id: row.session_id,
      eventName: row.event_name,
      eventCode: row.event_code,
      sessionCode: row.session_code,
      date: row.event_date,
      time: row.start_time,
      venue: row.venue
    }
  });
}

async function route(request, env) {
  if (!env.DB) return fail(request, env, 503, "DATABASE_UNAVAILABLE", "票券資料服務尚未完成設定。");
  await ensureSchema(env.DB);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (url.pathname === "/" || url.pathname === "/api/health") return ok(request, env, { service: "THEARD EVENT OPS", status: "READY", time: nowIso() });
  if (url.pathname === "/api/public/sessions" && method === "GET") return handlePublicSessions(request, env);
  if (url.pathname === "/api/public/lookup" && method === "POST") return handleLookup(request, env);
  if (url.pathname === "/api/public/claim" && method === "POST") return handleClaim(request, env);
  if (url.pathname === "/api/public/verify" && (method === "POST" || method === "GET")) return handleVerify(request, env, url);

  if (url.pathname.startsWith("/api/admin/")) {
    if (!(await requireAdmin(request, env))) {
      if (await rateLimited(request, env, "admin-auth", 12)) return fail(request, env, 429, "RATE_LIMITED", "後台登入嘗試過多，請稍後再試。");
      return fail(request, env, 401, "UNAUTHORIZED", "後台金鑰不正確或已失效。");
    }
    if (url.pathname === "/api/admin/state" && method === "GET") return handleAdminState(request, env);
    if (url.pathname === "/api/admin/issue" && method === "POST") return handleIssue(request, env);
    const ticketMatch = url.pathname.match(/^\/api\/admin\/tickets\/([^/]+)$/);
    if (ticketMatch && method === "PATCH") return handleTicketPatch(request, env, decodeURIComponent(ticketMatch[1]));
    const regenerateMatch = url.pathname.match(/^\/api\/admin\/tickets\/([^/]+)\/regenerate$/);
    if (regenerateMatch && method === "POST") return handleRegenerate(request, env, decodeURIComponent(regenerateMatch[1]));
    const sessionMatch = url.pathname.match(/^\/api\/admin\/sessions\/([^/]+)$/);
    if (sessionMatch && method === "PATCH") return handleSessionPatch(request, env, decodeURIComponent(sessionMatch[1]));
    if (sessionMatch && method === "DELETE") return handleSessionDelete(request, env, decodeURIComponent(sessionMatch[1]));
  }
  return fail(request, env, 404, "NOT_FOUND", "找不到此服務路徑。");
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      const status = Number(error?.status ?? 500);
      const code = error?.code ?? "INTERNAL_ERROR";
      const message = status >= 500 ? "資料服務暫時無法使用，請稍後再試。" : error.message;
      return fail(request, env, status, code, message);
    }
  }
};

export { SCHEMA, route };
