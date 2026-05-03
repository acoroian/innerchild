import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";

import { createServerSupabaseClient } from "~/lib/supabase.server";

async function handleSignOut(request: Request) {
  const responseHeaders = new Headers();
  const supabase = createServerSupabaseClient(request, responseHeaders);
  await supabase.auth.signOut();
  throw redirect("/", { headers: responseHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  return handleSignOut(request);
}

export async function loader({ request }: LoaderFunctionArgs) {
  return handleSignOut(request);
}
