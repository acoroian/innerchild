import { json, type LoaderFunctionArgs } from "@remix-run/node";

import { requireUser } from "~/lib/auth.server";
import { LETTER_AUDIO_BUCKET, LETTER_VIDEO_BUCKET } from "~/lib/letters";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, responseHeaders } = await requireUser(request);
  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400, headers: responseHeaders });

  const { data: letter, error } = await supabase
    .from("letters")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return json({ error: error.message }, { status: 500, headers: responseHeaders });
  if (!letter) return json({ error: "Not found" }, { status: 404, headers: responseHeaders });

  let videoUrl: string | null = null;
  let audioUrl: string | null = null;
  if (letter.reply_video_path) {
    const { data } = await supabase.storage
      .from(LETTER_VIDEO_BUCKET)
      .createSignedUrl(letter.reply_video_path, 60 * 60);
    videoUrl = data?.signedUrl ?? null;
  }
  if (letter.reply_audio_path) {
    const { data } = await supabase.storage
      .from(LETTER_AUDIO_BUCKET)
      .createSignedUrl(letter.reply_audio_path, 60 * 60);
    audioUrl = data?.signedUrl ?? null;
  }

  return json({ letter, videoUrl, audioUrl }, { headers: responseHeaders });
}
