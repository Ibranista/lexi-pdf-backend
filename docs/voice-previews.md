# Voice catalog and saved previews

Authenticated `GET /v1/ai/voices` returns `{ voices: [...] }`. Each voice has
`id`, `name`, `description`, `supportedLanguages` and `samples` keyed by `en`,
`am`, and `ar`. Missing recordings are omitted from `samples`; the client disables
that preview. The endpoint does not invoke Gemini or charge AI credits.

Media files are served from `public/voices` at `/static/voices`, with versioned
filenames and a 30-day immutable cache. Production URLs use `PUBLIC_URL`;
localhost development falls back to the requesting origin, as existing TTS does.
Ship the public directory with the deployment. No database migration is needed.

To prepare missing samples once, using the configured Gemini API key/model:

```sh
node scripts/generate-voice-samples.js
```

The script uses short fixed English, Amharic and Arabic passages, spaces requests
22 seconds apart, saves each completed file, skips existing recordings on rerun,
and stops on provider failure. Never wire this script into Preview requests.
Increment `SAMPLE_VERSION` when intentionally changing the recordings so device
and CDN caches can distinguish versions.

Prepared in this change: Aoede (English, Amharic, Arabic), Kore (English).
The provider returned its daily free-tier quota limit while generating Kore
(Amharic), so Kore (Amharic/Arabic) and Puck (all three) are unavailable until
the script is rerun after quota resets. No substitute voice or language is used.
Review sample pronunciation with native speakers before publishing.

`voiceId` is allowlisted on realtime session, spoken chat, translation and TTS
requests. The selected voice is locked into the realtime ephemeral token and
included in generated-speech cache keys and timing-file lookup. Omitting it
preserves configured server defaults for older clients.

Reading context is bounded to 4,000 characters at session start. The server
instructions treat incremental `READING_CONTEXT` data as untrusted book text,
use the latest passage for ambiguous questions, and keep the original document
scope. Resumed transports receive up to eight prior transcript entries, each
capped at 1,000 characters, from the same authenticated user's document thread.

Focused tests:

```sh
npx jest --watchman=false --runInBand tests/unit/services/voices.test.js tests/unit/services/tts.test.js tests/unit/services/speech-chunker.test.js
```
