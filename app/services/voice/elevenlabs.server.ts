import type {
  ConsentRecordRef,
  VoiceCloneResult,
  VoiceEngine,
  VoiceSynthResult,
} from "./types.server";

// ElevenLabs Instant Voice Cloning. Real implementation behind
// VOICE_ENGINE=elevenlabs. Will throw at construction time if no API key.
//
// Endpoints:
//   POST /v1/voices/add       multipart/form-data { name, files: [audio], description }
//                              → { voice_id }
//   POST /v1/text-to-speech/{voice_id}  body { text, model_id, output_format }
//                              → audio/mpeg

const BASE_URL = "https://api.elevenlabs.io";

export class ElevenLabsVoiceEngine implements VoiceEngine {
  constructor(
    private readonly apiKey: string,
    /**
     * Optional: when set, cloneFromSample short-circuits and returns this
     * preset voice ID instead of attempting a real clone. Use this on the
     * ElevenLabs Free tier (which doesn't support /v1/voices/add). When the
     * account upgrades to Starter+, leave this unset and real cloning kicks in.
     */
    private readonly presetVoiceId?: string,
  ) {
    if (!apiKey) {
      throw new Error("ElevenLabsVoiceEngine requires ELEVENLABS_API_KEY");
    }
  }

  async cloneFromSample(input: {
    audioUrl: string;
    consent: ConsentRecordRef;
  }): Promise<VoiceCloneResult> {
    if (this.presetVoiceId) {
      // Free-tier fallback: return the preset voice ID. The audio sample is
      // still uploaded to Storage (in the calling job) so we have it on file
      // for when the account upgrades and can re-run the clone.
      return { voiceId: this.presetVoiceId };
    }

    const audioRes = await fetch(input.audioUrl);
    if (!audioRes.ok) {
      throw new Error(`Failed to fetch sample audio: ${audioRes.status}`);
    }
    const audioBlob = await audioRes.blob();

    const form = new FormData();
    form.append("name", `mosaicrise-${input.consent.consentRecordId.slice(0, 8)}`);
    form.append(
      "description",
      `Subject voice clone. Consent record ${input.consent.consentRecordId}, attestation ${input.consent.attestationKind} (text version ${input.consent.attestationTextVersion}).`,
    );
    form.append("files", audioBlob, "sample.audio");

    const res = await fetch(`${BASE_URL}/v1/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": this.apiKey },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ElevenLabs clone failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as { voice_id?: string };
    if (!json.voice_id) {
      throw new Error("ElevenLabs response missing voice_id");
    }
    return { voiceId: json.voice_id };
  }

  async synthesize(input: {
    voiceId: string;
    text: string;
    idempotencyKey: string;
  }): Promise<VoiceSynthResult> {
    const res = await fetch(
      `${BASE_URL}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: input.text,
          model_id: "eleven_turbo_v2_5",
          output_format: "mp3_44100_128",
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ElevenLabs synth failed (${res.status}): ${text}`);
    }
    const buf = await res.arrayBuffer();
    // Caller is responsible for uploading to Storage; here we return a data
    // URL placeholder. In Phase 4 the caller uploads to Storage and persists
    // the storage_path on the letter row.
    const base64 = Buffer.from(buf).toString("base64");
    return {
      audioUrl: `data:audio/mpeg;base64,${base64}`,
      // ElevenLabs doesn't return duration; estimate ~150 wpm × text length.
      durationMs: Math.ceil((input.text.split(/\s+/).length / 150) * 60_000),
    };
  }
}
