import * as mfa from "./mfa.mjs";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const secretKey = (() => {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed?.default) return parsed.default as string;
    } catch (_) {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
})();

if (!supabaseUrl || !secretKey) {
  throw new Error("Supabase server credentials are unavailable");
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function b64ToBytes(value: string) {
  const bin = atob(value);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function bytesToB64(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}
function bytesToB64Url(bytes: Uint8Array) {
  return bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function sha256Hex(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function pbkdf2(password: string, saltB64: string, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: b64ToBytes(saltB64),
      iterations,
    },
    material,
    256,
  );
  return bytesToB64(new Uint8Array(bits));
}
function constantTimeEqual(a: string, b: string) {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToB64Url(bytes);
}
function requestIp(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
async function recordFailure(username: string, ipHash: string, currentCount = 0) {
  const failedCount = currentCount + 1;
  const lockedUntil =
    failedCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
  await admin.from("workspace_login_attempts").upsert(
    {
      username,
      ip_hash: ipHash,
      failed_count: failedCount,
      locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "username,ip_hash" },
  );
  return lockedUntil;
}
async function bootstrapWorkspacePayload() {
  const dataUrl = "https://dalulu05168.github.io/growth-story-workspace/data/people.json";
  const res = await fetch(dataUrl, { headers: { "User-Agent": "ChenNan-Workspace-Cloud" } });
  if (!res.ok) throw new Error("default dataset HTTP " + res.status);
  const source = await res.json();
  const people = Array.isArray(source) ? source : (Array.isArray(source?.people) ? source.people : []);
  if (!people.length) throw new Error("default dataset is empty");
  return {
    people,
    records: [],
    docs: [],
    dailyDocs: {},
    customGroups: [],
    meta: {
      defaultDatasetVersion: String(source?.schema_version ?? "3.0"),
      defaultDatasetName: String(source?.dataset_name ?? "法国人物70位"),
      cloudInitializedAt: new Date().toISOString()
    },
    portfolio: { holdings: [], buyPlans: [], settings: {} },
    tradeSim: { offers: [], recommendations: [] }
  };
}

async function requireSession(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { error: json({ ok: false, error: "未登录" }, 401) };

  const tokenHash = await sha256Hex(token);
  const { data: session, error } = await admin
    .from("workspace_sessions")
    .select("id,account_id,expires_at,mfa_verified")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !session) {
    return { error: json({ ok: false, error: "登录会话无效" }, 401) };
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await admin.from("workspace_sessions").delete().eq("id", session.id);
    return { error: json({ ok: false, error: "登录已过期，请重新登录" }, 401) };
  }
  const { data: owner } = await admin.from("workspace_accounts").select("disabled,totp_enabled").eq("id",session.account_id).maybeSingle();
  if(!owner||owner.disabled||owner.totp_enabled&&!session.mfa_verified)return {error:json({ok:false,error:"请完成动态验证后登录",code:"MFA_REQUIRED"},401)};
  await admin
    .from("workspace_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.id);
  return { session, token };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    return json({ ok: false, error: "请求格式错误" }, 400);
  }

  const action = String(body?.action ?? "");

  if (action === "health") {
    return json({ ok: true, service: "workspace-cloud", now: new Date().toISOString() });
  }

  if (action === "login") {
    const username = String(body?.username ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    if (!username || !password) {
      return json({ ok: false, error: "请输入账号和密码" }, 400);
    }

    const ipHash = await sha256Hex(requestIp(req));
    const { data: attempt } = await admin
      .from("workspace_login_attempts")
      .select("failed_count,locked_until")
      .eq("username", username)
      .eq("ip_hash", ipHash)
      .maybeSingle();

    if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > Date.now()) {
      return json({ ok: false, error: "连续登录失败次数过多，请稍后再试" }, 429);
    }

    const { data: account, error: accountError } = await admin
      .from("workspace_accounts")
      .select("id,username,display_name,password_salt,password_hash,password_iterations,disabled,totp_enabled")
      .eq("username", username)
      .maybeSingle();

    let valid = false;
    if (!accountError && account && !account.disabled) {
      const derived = await pbkdf2(password, account.password_salt, account.password_iterations);
      valid = constantTimeEqual(derived, account.password_hash);
    }

    if (!valid) {
      const lockedUntil = await recordFailure(
        username,
        ipHash,
        Number(attempt?.failed_count ?? 0),
      );
      return json(
        {
          ok: false,
          error: lockedUntil
            ? "账号或密码错误，登录已临时锁定"
            : "账号或密码错误",
        },
        401,
      );
    }

    await admin
      .from("workspace_login_attempts")
      .delete()
      .eq("username", username)
      .eq("ip_hash", ipHash);

    await admin
      .from("workspace_sessions")
      .delete()
      .eq("account_id", account.id)
      .lt("expires_at", new Date().toISOString());

    if(account.totp_enabled){
      const challenge=randomToken();
      const {error}=await admin.from("workspace_login_challenges").insert({account_id:account.id,challenge_hash:await sha256Hex(challenge),purpose:"verify",expires_at:new Date(Date.now()+5*60*1000).toISOString()});
      if(error)return json({ok:false,error:"创建动态验证失败"},500);
      return json({ok:true,requiresMfa:true,challenge});
    }
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const { error: sessionError } = await admin.from("workspace_sessions").insert({
      account_id: account.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
    if (sessionError) return json({ ok: false, error: "创建登录会话失败" }, 500);

    return json({
      ok: true,
      token,
      expiresAt,
      account: {
        username: account.username,
        displayName: account.display_name || "辰南",
      },
    });
  }

  if(action==="mfa_verify"){
    const hash=await sha256Hex(String(body.challenge||""));
    const {data:c}=await admin.from("workspace_login_challenges").select("*").eq("challenge_hash",hash).maybeSingle();
    if(!c||c.failed_count>=5||new Date(c.expires_at).getTime()<=Date.now())return json({ok:false,error:"动态验证已过期或尝试次数过多，请重新登录"},401);
    const {data:a}=await admin.from("workspace_accounts").select("id,username,display_name,disabled,totp_secret,totp_last_step,recovery_hashes").eq("id",c.account_id).maybeSingle();
    if(!a||a.disabled)return json({ok:false,error:"账户不可用"},401);
    let step=null,recoveryHash=null;
    try{
      if(body.recoveryCode&&c.purpose==="verify"){
        recoveryHash=await sha256Hex(String(body.recoveryCode).trim().toUpperCase());
        if(!a.recovery_hashes.includes(recoveryHash))recoveryHash=null;
      }else{
        const seed=await mfa.open(c.purpose==="enroll"?c.encrypted_seed:a.totp_secret,Deno.env.get("WORKSPACE_MFA_KEY")||secretKey);
        step=await mfa.verify(seed,String(body.code||""),c.purpose==="enroll"?-1:Number(a.totp_last_step));
      }
    }catch(error){console.error("MFA seed verification failed");return json({ok:false,error:"动态验证暂不可用，请联系管理员"},503)}
    if(step===null&&recoveryHash===null){await admin.rpc("workspace_fail_mfa",{p_hash:hash});return json({ok:false,error:"验证码或恢复码错误，或验证码已经使用"},401)}
    const recoveryCodes=c.purpose==="enroll"?Array.from({length:10},()=>crypto.randomUUID().replaceAll("-","").slice(0,20).toUpperCase()):null;
    const recoveryHashes=recoveryCodes?await Promise.all(recoveryCodes.map(sha256Hex)):null;
    const token=randomToken(),expiresAt=new Date(Date.now()+12*60*60*1000).toISOString();
    const {data:sid,error}=await admin.rpc("workspace_complete_mfa",{p_challenge_hash:hash,p_step:step,p_recovery_hash:recoveryHash,p_token_hash:await sha256Hex(token),p_expires:expiresAt,p_recovery_hashes:recoveryHashes});
    if(error)return json({ok:false,error:"完成动态验证失败"},500);
    if(!sid)return json({ok:false,error:"验证已失效，请重新登录"},401);
    return json({ok:true,token,expiresAt,account:{username:a.username,displayName:a.display_name||"辰南"},recoveryCodes});
  }

  const auth = await requireSession(req);
  if (auth.error) return auth.error;
  const session = auth.session!;

  if(action==="mfa_status"){
    const {data:a,error}=await admin.from("workspace_accounts").select("totp_enabled,recovery_hashes").eq("id",session.account_id).single();
    if(error)return json({ok:false,error:"读取安全设置失败"},500);
    return json({ok:true,enabled:a.totp_enabled,recoveryRemaining:a.recovery_hashes.length});
  }
  if(action==="mfa_enroll"){
    const {data:a}=await admin.from("workspace_accounts").select("username,password_salt,password_hash,password_iterations,totp_enabled").eq("id",session.account_id).single();
    if(!a||a.totp_enabled)return json({ok:false,error:"账户已绑定验证器"},400);
    const ipHash=await sha256Hex(requestIp(req));
    const {data:attempt}=await admin.from("workspace_login_attempts").select("failed_count,locked_until").eq("username",a.username).eq("ip_hash",ipHash).maybeSingle();
    if(attempt?.locked_until&&new Date(attempt.locked_until).getTime()>Date.now())return json({ok:false,error:"尝试次数过多，请稍后再试"},429);
    if(!constantTimeEqual(await pbkdf2(String(body.password||""),a.password_salt,a.password_iterations),a.password_hash)){await recordFailure(a.username,ipHash,Number(attempt?.failed_count||0));return json({ok:false,error:"密码错误"},401)}
    const seed=mfa.secret(),challenge=randomToken();
    const encrypted=await mfa.seal(seed,Deno.env.get("WORKSPACE_MFA_KEY")||secretKey);
    await admin.from("workspace_login_challenges").delete().eq("account_id",session.account_id).eq("purpose","enroll");
    const {error}=await admin.from("workspace_login_challenges").insert({account_id:session.account_id,challenge_hash:await sha256Hex(challenge),purpose:"enroll",encrypted_seed:encrypted,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
    if(error)return json({ok:false,error:"绑定验证器失败"},500);
    return json({ok:true,challenge,secret:seed,uri:"otpauth://totp/"+encodeURIComponent("辰南:"+a.username)+"?secret="+seed+"&issuer="+encodeURIComponent("辰南撰写")+"&algorithm=SHA1&digits=6&period=30"});
  }
  if (action === "logout") {
    await admin.from("workspace_sessions").delete().eq("id", session.id);
    return json({ ok: true });
  }

  if (action === "load") {
    const { data, error } = await admin
      .from("workspace_cloud_state")
      .select("payload,version,updated_at")
      .eq("account_id", session.account_id)
      .maybeSingle();

    if (error) return json({ ok: false, error: "读取云端数据失败" }, 500);

    if (!data) {
      try {
        const payload = await bootstrapWorkspacePayload();
        const now = new Date().toISOString();
        const { data: inserted, error: insertError } = await admin
          .from("workspace_cloud_state")
          .insert({
            account_id: session.account_id,
            payload,
            version: 1,
            updated_at: now,
          })
          .select("payload,version,updated_at")
          .single();
        if (insertError) throw insertError;
        return json({
          ok: true,
          payload: inserted.payload,
          version: inserted.version,
          updatedAt: inserted.updated_at,
          initialized: true,
        });
      } catch (bootstrapError) {
        console.error("workspace bootstrap failed", bootstrapError);
        return json({ ok: false, error: "首次初始化云端人物数据失败" }, 502);
      }
    }

    return json({
      ok: true,
      payload: data.payload,
      version: data.version,
      updatedAt: data.updated_at,
    });
  }

  if (action === "save") {
    const payload = body?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json({ ok: false, error: "云端数据格式错误" }, 400);
    }
    const serialized = JSON.stringify(payload);
    if (serialized.length > 6_000_000) {
      return json({ ok: false, error: "云端数据超过单次保存限制" }, 413);
    }

    const expectedVersion =
      body?.expectedVersion === null || body?.expectedVersion === undefined
        ? null
        : Number(body.expectedVersion);

    const { data: current, error: currentError } = await admin
      .from("workspace_cloud_state")
      .select("version")
      .eq("account_id", session.account_id)
      .maybeSingle();
    if (currentError) return json({ ok: false, error: "读取云端版本失败" }, 500);

    if (!current) {
      const { data: inserted, error: insertError } = await admin
        .from("workspace_cloud_state")
        .insert({
          account_id: session.account_id,
          payload,
          version: 1,
          updated_at: new Date().toISOString(),
        })
        .select("version,updated_at")
        .single();
      if (insertError) return json({ ok: false, error: "首次写入云端失败" }, 500);
      return json({
        ok: true,
        version: inserted.version,
        updatedAt: inserted.updated_at,
      });
    }

    if (expectedVersion !== null && expectedVersion !== Number(current.version)) {
      return json(
        {
          ok: false,
          error: "云端数据已被其他设备更新，请重新载入",
          code: "VERSION_CONFLICT",
          currentVersion: current.version,
        },
        409,
      );
    }

    const nextVersion = Number(current.version) + 1;
    const { data: updated, error: updateError } = await admin
      .from("workspace_cloud_state")
      .update({
        payload,
        version: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("account_id", session.account_id)
      .eq("version", current.version)
      .select("version,updated_at")
      .maybeSingle();

    if (updateError) return json({ ok: false, error: "保存云端数据失败" }, 500);
    if (!updated) {
      return json(
        { ok: false, error: "云端数据发生并发更新，请重新载入", code: "VERSION_CONFLICT" },
        409,
      );
    }
    return json({ ok: true, version: updated.version, updatedAt: updated.updated_at });
  }

  return json({ ok: false, error: "未知操作" }, 400);
});

