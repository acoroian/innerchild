import { json, type ActionFunctionArgs } from "@remix-run/node";

import { requireUser } from "~/lib/auth.server";
import {
  buildPhotoStoragePath,
  getSubject,
  isAllowedPhotoMime,
  PHOTO_BUCKET,
  type AllowedPhotoMime,
} from "~/lib/subjects.server";

// Photo upload uses a two-step pattern to keep large bodies off the API:
//   POST /api/subjects/:id/photos { intent: "upload-url", content_type, byte_size? }
//     → { upload_url, token, storage_path, photo_id }
//     Client uploads bytes directly to Supabase Storage with the signed token.
//   POST /api/subjects/:id/photos { intent: "confirm", photo_id, storage_path,
//                                    content_type, byte_size?, is_primary? }
//     → { photo }
//     Server inserts the subject_photos row.
export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const { user, supabase, responseHeaders } = await requireUser(request);
  const subjectId = params.id;
  if (!subjectId) {
    return json({ error: "Missing subject id" }, { status: 400, headers: responseHeaders });
  }

  const subject = await getSubject(supabase, subjectId);
  if (!subject) {
    return json({ error: "Subject not found" }, { status: 404, headers: responseHeaders });
  }

  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body) {
    return json({ error: "Body must be JSON" }, { status: 400, headers: responseHeaders });
  }
  const intent = body.intent;

  if (intent === "upload-url") {
    const contentType = body.content_type;
    if (typeof contentType !== "string" || !isAllowedPhotoMime(contentType)) {
      return json(
        { error: "content_type must be image/jpeg, image/png, image/heic, or image/webp" },
        { status: 400, headers: responseHeaders },
      );
    }
    const photoId = crypto.randomUUID();
    const storagePath = buildPhotoStoragePath({
      userId: user.id,
      subjectId,
      photoId,
      contentType: contentType as AllowedPhotoMime,
    });
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !data) {
      return json(
        { error: error?.message ?? "Failed to issue upload URL" },
        { status: 500, headers: responseHeaders },
      );
    }
    return json(
      {
        upload_url: data.signedUrl,
        token: data.token,
        storage_path: storagePath,
        photo_id: photoId,
      },
      { status: 201, headers: responseHeaders },
    );
  }

  if (intent === "confirm") {
    const photoId = body.photo_id;
    const storagePath = body.storage_path;
    const contentType = body.content_type;
    const byteSize = body.byte_size;
    const isPrimary = body.is_primary === true;

    if (typeof photoId !== "string" || typeof storagePath !== "string" || typeof contentType !== "string") {
      return json(
        { error: "photo_id, storage_path, content_type are required" },
        { status: 400, headers: responseHeaders },
      );
    }
    if (!isAllowedPhotoMime(contentType)) {
      return json({ error: "content_type not allowed" }, { status: 400, headers: responseHeaders });
    }
    const expectedPath = buildPhotoStoragePath({
      userId: user.id,
      subjectId,
      photoId,
      contentType: contentType as AllowedPhotoMime,
    });
    if (storagePath !== expectedPath) {
      return json({ error: "storage_path does not match expected layout" }, {
        status: 400,
        headers: responseHeaders,
      });
    }
    if (byteSize !== undefined && (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize < 0)) {
      return json({ error: "byte_size must be a non-negative integer" }, {
        status: 400,
        headers: responseHeaders,
      });
    }

    if (isPrimary) {
      // Demote any existing primary so the unique partial index is happy.
      const { error: demoteErr } = await supabase
        .from("subject_photos")
        .update({ is_primary: false })
        .eq("subject_id", subjectId)
        .eq("is_primary", true);
      if (demoteErr) {
        return json({ error: demoteErr.message }, { status: 500, headers: responseHeaders });
      }
    }

    const { data, error } = await supabase
      .from("subject_photos")
      .insert({
        id: photoId,
        subject_id: subjectId,
        storage_path: storagePath,
        content_type: contentType,
        byte_size: byteSize ?? null,
        is_primary: isPrimary,
      })
      .select("*")
      .single();
    if (error) {
      return json({ error: error.message }, { status: 500, headers: responseHeaders });
    }
    return json({ photo: data }, { status: 201, headers: responseHeaders });
  }

  return json({ error: "intent must be 'upload-url' or 'confirm'" }, {
    status: 400,
    headers: responseHeaders,
  });
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
