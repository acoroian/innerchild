import { redirect } from "@remix-run/node";
import type { User } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "./supabase.server";

export interface AuthedRequest {
  user: User;
  supabase: ReturnType<typeof createServerSupabaseClient>;
  responseHeaders: Headers;
}

export async function requireUser(request: Request): Promise<AuthedRequest> {
  const responseHeaders = new Headers();
  const supabase = createServerSupabaseClient(request, responseHeaders);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    const url = new URL(request.url);
    const next = url.pathname + url.search;
    throw redirect(`/signin?next=${encodeURIComponent(next)}`, { headers: responseHeaders });
  }
  return { user: data.user, supabase, responseHeaders };
}

export async function getOptionalUser(request: Request): Promise<{
  user: User | null;
  supabase: ReturnType<typeof createServerSupabaseClient>;
  responseHeaders: Headers;
}> {
  const responseHeaders = new Headers();
  const supabase = createServerSupabaseClient(request, responseHeaders);
  const { data } = await supabase.auth.getUser();
  return { user: data.user ?? null, supabase, responseHeaders };
}
