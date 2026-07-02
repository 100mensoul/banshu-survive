import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REPLICATE_MODEL = "black-forest-labs/flux-1.1-pro";
const STORAGE_BUCKET = "himejin-portraits";
const MAX_POLL_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;
const MAX_CALLS_PER_MINUTE = 5;

const rateLimitMap = new Map<string, number[]>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const times = rateLimitMap.get(userId) ?? [];
  const recent = times.filter((t) => now - t < windowMs);
  if (recent.length >= MAX_CALLS_PER_MINUTE) return false;
  recent.push(now);
  rateLimitMap.set(userId, recent);
  return true;
}

async function pollReplicatePrediction(
  predictionId: string,
  token: string,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < MAX_POLL_MS) {
    const res = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Replicate poll failed (${res.status}): ${text}`);
    }
    const prediction = (await res.json()) as Record<string, unknown>;
    const status = String(prediction.status ?? "");
    if (status === "succeeded") return prediction;
    if (status === "failed" || status === "canceled") {
      throw new Error(String(prediction.error ?? "Replicate generation failed"));
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Replicate generation timed out");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !replicateToken) {
    return jsonResponse({ error: "Server configuration incomplete" }, 500);
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (!checkRateLimit(user.id)) {
    return jsonResponse(
      { error: "Rate limit exceeded. Please wait before retrying." },
      429,
    );
  }

  let body: { profile_id?: string; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const profileId = String(body.profile_id ?? "").trim();
  const prompt = String(body.prompt ?? "").trim();
  if (!profileId || !prompt) {
    return jsonResponse({ error: "profile_id and prompt are required" }, 400);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("himejin_profiles")
    .select("id")
    .eq("id", profileId)
    .single();

  if (profileError || !profile) {
    return jsonResponse({ error: "Profile not found" }, 404);
  }

  const createRes = await fetch(
    `https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: "1:1",
          output_format: "webp",
        },
      }),
    },
  );

  if (!createRes.ok) {
    const text = await createRes.text();
    return jsonResponse({ error: `Replicate request failed: ${text}` }, 502);
  }

  let prediction = (await createRes.json()) as Record<string, unknown>;
  if (prediction.status !== "succeeded") {
    try {
      prediction = await pollReplicatePrediction(
        String(prediction.id),
        replicateToken,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse({ error: message }, 504);
    }
  }

  const output = prediction.output;
  const imageUrl = Array.isArray(output) ? output[0] : output;
  if (!imageUrl || typeof imageUrl !== "string") {
    return jsonResponse({ error: "No image URL in Replicate response" }, 502);
  }

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    return jsonResponse({ error: "Failed to download generated image" }, 502);
  }
  const imageBytes = new Uint8Array(await imageRes.arrayBuffer());

  const candidateId = crypto.randomUUID();
  const storagePath = `portraits/${profileId}/candidates/${candidateId}.webp`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, imageBytes, {
      contentType: "image/webp",
      upsert: false,
    });

  if (uploadError) {
    return jsonResponse(
      { error: `Storage upload failed: ${uploadError.message}` },
      500,
    );
  }

  const { data: pub } = supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  return jsonResponse({
    candidate_url: pub.publicUrl,
    candidate_path: storagePath,
    prompt,
  });
});
