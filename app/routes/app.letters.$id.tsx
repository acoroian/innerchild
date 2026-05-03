import { json, redirect, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/node";
import { Link, useLoaderData, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";

import { requireUser } from "~/lib/auth.server";
import { LETTER_AUDIO_BUCKET, LETTER_VIDEO_BUCKET, type Letter, type LetterReplyStatus } from "~/lib/letters";

export const meta: MetaFunction = () => [{ title: "Reply — mosaicrise" }];

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, responseHeaders } = await requireUser(request);
  const id = params.id;
  if (!id) throw redirect("/app", { headers: responseHeaders });

  const { data: letterRow, error } = await supabase
    .from("letters")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !letterRow) throw redirect("/app", { headers: responseHeaders });
  const letter = letterRow as Letter;

  const { data: subject } = await supabase
    .from("subjects")
    .select("display_name, kind")
    .eq("id", letter.subject_id)
    .maybeSingle();

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

  return json({ letter, subject, videoUrl, audioUrl }, { headers: responseHeaders });
}

const STATUS_LABEL: Record<LetterReplyStatus, string> = {
  queued: "Queued…",
  classifying: "Reading carefully…",
  retrieving: "Looking through what you've shared…",
  scripting: "Writing a reply…",
  synthesizing: "Recording the voice…",
  rendering: "Rendering the video…",
  ready: "Ready",
  failed: "Something went wrong",
};

export default function LetterReply() {
  const { letter, subject, videoUrl, audioUrl } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const inflight = letter.reply_status !== "ready" && letter.reply_status !== "failed";

  useEffect(() => {
    if (!inflight) return;
    const i = setInterval(() => revalidator.revalidate(), 3000);
    return () => clearInterval(i);
  }, [inflight, revalidator]);

  return (
    <div>
      <Link to={`/app/subjects/${letter.subject_id}`} className="text-sm text-dusk-500 hover:text-dusk-900">
        ← Back to {subject?.display_name ?? "subject"}
      </Link>

      <h1 className="mt-4 font-serif text-3xl text-dusk-900 sm:text-4xl">
        Reply from {subject?.display_name ?? "your subject"}
      </h1>

      {letter.crisis_flag !== "none" ? (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">If you&apos;re in crisis, please reach out.</p>
          <p className="mt-1">Call or text 988 (US) — there&apos;s someone who wants to help.</p>
        </div>
      ) : null}

      {letter.reply_status === "ready" && videoUrl ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-dusk-700/15 bg-dusk-900">
          <video
            src={videoUrl}
            controls
            playsInline
            className="aspect-video w-full bg-dusk-900"
          />
        </div>
      ) : letter.reply_status === "failed" ? (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-5 text-sm text-red-900">
          <p className="font-medium">{STATUS_LABEL[letter.reply_status]}</p>
          <p className="mt-1">{letter.reply_error ?? "Unknown error."}</p>
        </div>
      ) : (
        <div className="mt-6 rounded-md border border-dusk-700/15 bg-white p-6 text-center">
          <p className="font-serif text-lg text-dusk-900">{STATUS_LABEL[letter.reply_status]}</p>
          <p className="mt-2 text-sm text-dusk-500">
            This page will update on its own. Most replies arrive in under two minutes.
          </p>
        </div>
      )}

      {letter.reply_status === "ready" && letter.reply_script ? (
        <section className="mt-8">
          <h2 className="font-serif text-lg text-dusk-900">Script</h2>
          <p className="mt-2 whitespace-pre-wrap font-serif text-base leading-relaxed text-dusk-700">
            {letter.reply_script}
          </p>
          {audioUrl ? (
            <audio src={audioUrl} controls className="mt-3 w-full" />
          ) : null}
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-serif text-lg text-dusk-900">Your letter</h2>
        <p className="mt-2 whitespace-pre-wrap font-serif text-base leading-relaxed text-dusk-700">
          {letter.body}
        </p>
      </section>
    </div>
  );
}
