# for AI Part

for the AI part leverage langchain, install the necessary dependencies, add to .env the following keys: OPENAI_API_KEY=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
OPENAI_MODEL=gpt-4o-mini

and an example in python is here's a very simple snippet:

# Base LLM and instruction tuned LLM

from openai import OpenAI
import os
from dotenv import load_dotenv, find_dotenv

# Load env variables

load_dotenv(find_dotenv())

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
OPENAI_MODEL = os.getenv("OPENAI_MODEL")

def get_completion(prompt, model=OPENAI_MODEL):

    messages = [{
        "role":"user",
        "content":prompt
    }]

    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0
    )

    print(response.choices[0].message.content)

def get_completion_from_messages(messages,model=OPENAI_MODEL,temperature=0):
response = client.chat.completions.create(
model=model,
messages=messages,
temperature=temperature
)
print(str(response.choices[0]))
return response.choices[0].message.content

# use delimeters, it helps to avoid prompt injections

text = f"""
You should express what you want a model to do by \\
providing instructions that are as clear and \\
specific as you can possibly make them. \\
This will guide the model towards the desired output, \\
and reduce the chances of receiving irrelevant \\
or incorrect responses. Don't confuse writing a \\
clear prompt with writing a short prompt. \\
In many cases, longer prompts provide more clarity \\
and context for the model, which can lead to \\
more detailed and relevant outputs.
"""

prompt = f"Tell me about aeroglide ultraslim smart toothbrush company by sahil"

# get_completion(prompt)

# chatbot

# system message: gives an overall instruction, sets behavior of assistant, the user will have no idea about it

messages = [
{"role":"system","content":"You are friendly chatbot."},
{"role":"user","content":"Hi, my name is Ibraheem."},
{"role":"user","content":"Can you remind me, what is my name?"}
]

response = get_completion_from_messages(messages)
print(response)

# LexiPDF — Backend API specification

Everything the backend has to build for the LexiPDF reader client, written from
the client's data structures outward. Each endpoint below exists because a
specific screen needs it; where a response field maps onto a client type, the
type is named so the shape can be checked against the code.

**Client stack:** Expo 57 / React Native 0.86, `axios` with JWT access+refresh,
`zustand` + MMKV for local state (offline-first, synchronous reads). There is no
react-query provider; hooks fetch on mount and cache in a module variable.

---

## 0. Conventions

| Thing        | Rule                                                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base URL     | `EXPO_PUBLIC_API_URL`, defaults to `http://localhost:3000/v1`. Every path below is relative to that, i.e. `/auth/login` → `POST {BASE}/auth/login`.                                                                                  |
| Auth         | `Authorization: Bearer <access.token>` on everything except `/auth/*` and `/book-suggestions`.                                                                                                                                       |
| Errors       | `{ "code": <http status>, "message": "<human readable>" }` — already parsed by `getApiErrorMessage` (`src/utils/axios.ts`). Add `"reason"` (a stable machine string) wherever the client must branch; those are listed per endpoint. |
| 401          | Triggers one silent refresh via `POST /auth/refresh-tokens`, then a retry. A second 401 logs the user out. Never return 401 for "out of quota" — see §4.                                                                             |
| Timestamps   | Epoch milliseconds (`number`), never ISO strings, except `tokens.*.expires` which stays ISO to match the existing `TokenPayload`.                                                                                                    |
| Ids          | Opaque strings. The client uses them as React keys and as sync identities.                                                                                                                                                           |
| Nullability  | Omit optional keys entirely. Do not send `null` or `""` where the field is documented optional — several client call sites test truthiness on presence.                                                                              |
| Content type | JSON in, JSON out. No envelope: return the object directly, as `/auth/login` already does.                                                                                                                                           |

---

## 1. Identity: anonymous first, account later

The product requirement is that highlights, notes, bookmarks, vocabulary and
recents all work **before** the user has an account, and survive the moment they
sign in. The cheapest way to do that without a second code path is to give every
install a real (anonymous) user row on the server from the start.

### 1.1 Device registration

```http
POST /auth/device
Content-Type: application/json

{
  "deviceId": "a2f1c0de-1f47-4a1a-9a2b-9f0b0d3c8e11",
  "platform": "android",
  "model": "SM-S901E",
  "osVersion": "15",
  "appVersion": "1.0.0",
  "locale": "en-US"
}
```

`deviceId` is a UUID v4 the client generates on first launch and keeps in
`expo-secure-store`. It is **not** an OS identifier — do not expect it to be
stable across reinstalls, and do not use it for anything security-bearing.

**200** — same `AuthResponse` shape the existing client already handles:

```json
{
  "user": {
    "id": 4711,
    "email": "",
    "name": "",
    "role": "USER",
    "isEmailVerified": false,
    "isAnonymous": true
  },
  "tokens": {
    "access": { "token": "…", "expires": "2026-07-27T12:00:00.000Z" },
    "refresh": { "token": "…", "expires": "2026-08-26T12:00:00.000Z" }
  }
}
```

Calling it again with the same `deviceId` returns the **same** user with fresh
tokens — it is idempotent, and it is how the app recovers if the refresh token
is lost. `email` and `name` are `""` (not null) for anonymous users; the client
renders the account row from `isAnonymous`, not from a missing field.

### 1.2 Upgrading an anonymous user to a real account

There is no data-migration endpoint. The anonymous user row **becomes** the real
one, so nothing has to move.

```http
POST /auth/link/google      Authorization: Bearer <anon access token>
{ "idToken": "<google id token>" }

POST /auth/link/email       Authorization: Bearer <anon access token>
{ "email": "…", "password": "…", "name": "…" }
```

**200** → the same `AuthResponse`, now with `isAnonymous: false`, a real
`email`/`name`, and **newly issued tokens** (the client replaces both).

Cases the backend has to decide, because the client can only show what you tell
it:

| Case                                           | Response                                                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Google account already belongs to another user | **409** `{ "code": 409, "reason": "ACCOUNT_EXISTS", "message": "That Google account is already in use." }` — see §1.3. |
| Email already registered                       | **409** `ACCOUNT_EXISTS`.                                                                                              |
| Caller is already a full account               | **409** `ALREADY_LINKED`.                                                                                              |

### 1.3 Merging into an existing account

When linking hits `ACCOUNT_EXISTS`, the user owns data in two places. The client
signs them into the existing account and asks the server to fold the anonymous
one in:

```http
POST /auth/login  (or /auth/google)   → tokens for the existing account
POST /sync/merge                      Authorization: Bearer <existing account token>
{ "fromDeviceId": "a2f1c0de-…" }
```

**200** `{ "merged": { "documents": 12, "annotations": 84, "vocab": 31 } }`

Merge rule: union by entity id; on collision the **newer `updatedAt` wins**. The
anonymous user is then deleted. If `fromDeviceId` is unknown or already merged,
return **200** with zero counts rather than an error — the client retries this
call and it must be idempotent.

### 1.4 Sign out

`POST /auth/logout` already exists. After it, the client calls `POST /auth/device`
again with the same `deviceId` to get back to an anonymous session, so the reader
keeps working. **The anonymous user it returns must be a fresh, empty one** — do
not resurrect the merged account's data for a signed-out device.

---

## 2. Sync: highlights, notes, bookmarks, vocabulary, recents

### 2.1 The document identity problem — read this first

Every client store keys documents by `uri`, and on Android that is a Storage
Access Framework string like
`content://com.android.externalstorage.documents/document/primary%3ADownload%2Fbook.pdf`.
It is **device-local**: it changes between devices, between reinstalls, and
sometimes when a permission is re-granted. It cannot be the sync key.

So the client computes and sends a **`docKey`** alongside it:

```js
docKey = sha256(lowercase(fileName) + ':' + fileSizeBytes); // hex, 64 chars
```

- For a suggested web book (`kind: "BOOK"`), `docKey = sha256(readUrl)` with the
  `lexiCover` query parameter stripped first.
- The backend treats `docKey` as the primary document identity and stores `uri`
  as an opaque per-device pointer it never interprets.
- Two different files with the same name and size will collide. That is
  accepted; the consequence is shared highlights on two documents, not data loss.

> If you would rather key on a content hash of the first N bytes, say so and the
> client will compute that instead — it is one function either way. It has to be
> decided before any user data exists.

### 2.2 Entity shapes

These mirror the client stores exactly. Adding fields is fine; renaming is not.

**Document** — `RecentDoc` (`src/stores/recents-store.ts`) plus sync fields:

```json
{
  "docKey": "3f2a…",
  "uri": "content://…/book.pdf",
  "name": "Ego Is the Enemy.pdf",
  "ext": "PDF",
  "openedAt": 1769500000000,
  "page": 47,
  "pageCount": 214,
  "bookmarks": [12, 47, 88],
  "readingPlanMs": [42000, 51000],
  "readingTimeMsByPage": { "47": 182000 },
  "collections": ["studying", "later"],
  "updatedAt": 1769500000000,
  "deletedAt": null
}
```

`collections` replaces a separate collections entity — shelf ids are the fixed
set `"studying" | "later" | "important"` (`src/constants/collections.ts`). Do not
send display labels here; the client renders those from its own i18n.

**Annotation** — highlight, note and translation record in one row
(`src/stores/annotations-store.ts`). A highlight is a row with `note: ""`;
adding a note fills it in rather than creating a second row. Keep that.

```json
{
  "id": "m9x2k1-3",
  "docKey": "3f2a…",
  "page": 47,
  "text": "Ryan Holiday",
  "source": "Ego Is the Enemy",
  "color": "sky",
  "note": "Come back to this.",
  "createdAt": 1769500000000,
  "updatedAt": 1769500000000,
  "deletedAt": null
}
```

- `color` ∈ `"amber" | "rose" | "sage" | "sky"` — exactly these four.
- `text` is the **verbatim selected passage**. The reflow reader re-finds
  highlights by searching for this string in the page's text, so any
  normalisation on your side (smart quotes, whitespace collapsing, trimming
  ellipses) silently breaks the mark on the next device. Store and return the
  bytes you were given.
- `id` is generated client-side (`Date.now().toString(36)-seq`). Accept it as
  given; do not reassign. If it collides for a user, return **409** `ID_CONFLICT`
  and the client will re-issue.

**VocabEntry** — the word card in §5.2 (`src/stores/app-store.ts`):

```json
{
  "id": "m9x30a-0",
  "docKey": "3f2a…",
  "word": "optional",
  "pos": "adjective",
  "tr": "አማራጭ",
  "translit": "amarach",
  "lang": "am",
  "p": 47,
  "s1": "It means night no longer forced people to stop — staying active became a choice.",
  "s2": "The phrase marks the book's turning point: light gave people control over their time.",
  "createdAt": 1769500000000,
  "updatedAt": 1769500000000,
  "deletedAt": null
}
```

`lang` ∈ `"am" | "ar" | "en"` today (`Lang` in `src/stores/app-store.ts`).

### 2.3 The sync endpoint

One endpoint, both directions, so an offline burst reconciles in a single round
trip.

```http
POST /sync
Authorization: Bearer <token>

{
  "cursor": "eyJ0IjoxNzY5NTAwMDAwMDAwfQ",     // null on first sync
  "deviceId": "a2f1c0de-…",
  "changes": {
    "documents":   [ …Document… ],
    "annotations": [ …Annotation… ],
    "vocab":       [ …VocabEntry… ]
  }
}
```

**200**

```json
{
  "cursor": "eyJ0IjoxNzY5NTAwOTk5MDAwfQ",
  "changes": {
    "documents": [],
    "annotations": [],
    "vocab": []
  },
  "serverTime": 1769500999000
}
```

Rules:

1. **Last write wins per row**, compared on `updatedAt`. Ties break toward the
   server. There is no field-level merge and the client does not show conflicts.
2. **Deletes are tombstones**: `deletedAt` set, row retained. Return tombstones
   in `changes` so other devices can remove their copies. Purge server-side after
   90 days.
3. `changes` in the response contains everything modified **since `cursor`**,
   excluding writes attributed to the calling `deviceId` (so a device does not
   echo its own push back into itself).
4. The client pushes on a 5-second debounce after any local write, on app
   background, and on app foreground. Expect bursts of 1–3 rows, and one large
   push (hundreds of rows) the first time a device syncs.
5. Payload cap: reject bodies over 2 MB with **413** `PAYLOAD_TOO_LARGE`; the
   client will re-send in chunks of 200 rows.
6. Anonymous users sync too. This is not gated on having an account.

---

## 3. Book suggestions

Replaces the three fan-out Gutendex searches in
`src/hooks/use-book-suggestions.ts`, and adds personalisation from onboarding.

```http
GET /book-suggestions?limit=3&interests=philosophy,self-improvement,biographies&collection=%F0%9F%93%96%20Reading%20Later
Accept: application/json
```

| Param        | Type                      | Notes                                                                                                                  |
| ------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `limit`      | int, optional             | Default 3. Client renders `SUGGESTION_COUNT` skeleton rows (compile-time 3), so **return 3–5 and keep it consistent**. |
| `interests`  | comma-separated, optional | Any of the 16 ids in §3.1. Sent unweighted, in the order the user picked them.                                         |
| `collection` | string, optional          | The user's dominant shelf label, for tailoring.                                                                        |

**200**

```json
{
  "suggestions": [
    {
      "id": "gutenberg-1342",
      "title": "Pride and Prejudice",
      "author": "Jane Austen",
      "coverUrl": "https://cdn.example.com/covers/1342.jpg",
      "readUrl": "https://www.gutenberg.org/ebooks/1342.html.images",
      "collection": "📖 Reading Later",
      "kind": "Classic"
    }
  ]
}
```

Maps 1:1 onto `BookSuggestion` (`use-book-suggestions.ts:19-32`).

| Field        | Rules                                                                                                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | Required, unique in the array and **stable across requests** — it is the React key, and re-fetches remount rows otherwise.                                                                                                 |
| `title`      | Required. Rendered `numberOfLines={1}`; keep under ~40 chars. No subtitle, no "by Author".                                                                                                                                 |
| `author`     | Required, display-ready — `"Jane Austen"`, not `"Austen, Jane"`. Send `""` when unknown; the row drops the "by …" phrasing on its own.                                                                                     |
| `coverUrl`   | Optional. A direct HTTPS image URL `<Image source={{uri}}>` can load — no HTML page, no auth header, no login redirect. **Omit the key** when there is no cover.                                                           |
| `readUrl`    | Required. An **HTML page**, not a PDF or EPUB — it loads in a WebView (`app/(tabs)/book.tsx`) and a binary renders blank. Send `""` if there is genuinely no readable page; the row still displays, it just will not open. |
| `collection` | Required, rendered verbatim including emoji: `"📖 Reading Later"`, `"🔖 To Read"`, `"💛 Favorites"`. Send the display string, not `reading_later`.                                                                         |
| `kind`       | Required. Short badge text — `"Classic"`, `"Novel"`, `"Essay"`. One word, ~10 chars; it sits in a fixed pill.                                                                                                              |

**Two things that will bite you:**

1. **`readUrl` must not contain a `lexiCover` query parameter.** When a user
   files a suggestion, the client packs the cover into the url as
   `?lexiCover=<encoded>` and later strips the _first_ match back off
   (`bookDocUri` / `bookReadUrl`). Your own `lexiCover` would be stripped instead
   and the book would open at a mangled url. Any other query params are fine.
2. **`coverUrl` is percent-encoded into that same url and persisted as the
   document's `uri`.** A 500-char signed URL with an expiry bloats storage and
   goes dead, breaking thumbnails for already-filed books. Use a stable CDN path.

Empty is fine: **200** `{"suggestions": []}` renders an empty section. On
failure the client currently falls back to a degraded title-only row — if you'd
rather it show nothing, return **200** with an empty array instead of a 5xx.
Partial results are fine: send the 2 you resolved rather than failing the call.
`Cache-Control: public, max-age=3600` is reasonable; the client sends no
conditional headers, so `ETag` buys nothing today.

### 3.1 Interest ids

Sent as an array of these exact strings (`src/constants/onboarding.ts`):

```text
textbooks · academic-papers · science · language-learning · work-documents
reports · business · manuals · philosophy · history · self-improvement
essays · biographies · fiction · novels · short-stories
```

The client also derives a coarse `readerType` (`student | researcher | professional | casual`) from these locally. If you would rather own that mapping,
return it on `/auth/device` and the client will use yours.

---

## 4. AI quota and the sign-in wall

Every AI endpoint (§5) shares one token budget and returns its state so the
client can show the wall at the right moment.

**On every AI response**, include:

```json
"quota": { "used": 8400, "limit": 10000, "resetsAt": 1769587200000, "tier": "anonymous" }
```

`tier` ∈ `"anonymous" | "free" | "pro"`. `resetsAt` may be `null` for a
non-renewing allowance.

**When the budget is gone**, return **402** (not 401 — 401 triggers the refresh
interceptor):

```json
{
  "code": 402,
  "reason": "AI_QUOTA_EXHAUSTED",
  "message": "You've used your free AI credits.",
  "quota": { "used": 10000, "limit": 10000, "resetsAt": null, "tier": "anonymous" },
  "requiresAuth": true
}
```

- `requiresAuth: true` + `tier: "anonymous"` → the client shows the **sign-in
  wall** (Google or email).
- `requiresAuth: false` + `tier: "free"` → the client shows the **paywall**
  (`app/(tabs)/paywall.tsx`).

The budget must be counted per **user**, not per device — otherwise reinstalling
resets it. Reserve before generating and reconcile after, so a long streamed
answer cannot overrun the limit.

Everything non-AI — reading, highlighting, notes, bookmarks, sync — stays free
and unauthenticated forever. Only §5 is gated.

---

## 5. AI endpoints

All requests may carry `"style": "simple" | "balanced" | "advanced"`, the user's
`explainStyle` setting. Default `"balanced"`.

### 5.1 Book context

The client extracts a PDF's full text in-process (pdf.js in a WebView) and can
upload it, so chat and translation can be grounded in the actual book.

```http
POST /ai/context
{
  "docKey": "3f2a…",
  "title": "Ego Is the Enemy",
  "author": "Ryan Holiday",
  "pageCount": 214,
  "pages": [ { "page": 1, "text": "…" }, { "page": 2, "text": "…" } ]
}
```

Sent in chunks of ~20 pages, fire-and-forget, only when the user first opens
Lexi on a document. **202** `{ "docKey": "3f2a…", "indexed": 40, "ready": false }`.
When every chunk has landed the last response carries `"ready": true`.

If you would rather not store book text, say so — the fallback is that chat
sends a rolling excerpt with each message (§5.3) and answers get noticeably
worse on cross-chapter questions. **This is the biggest open decision in this
document.**

### 5.2 Translate a word or phrase

Powers the word card in the reader (the third action on the selection bar,
alongside Highlight and Note) — the modal in the screenshot.

```http
POST /ai/translate
{
  "docKey": "3f2a…",
  "text": "optional",
  "context": "…the sentence or paragraph the word was selected in…",
  "page": 47,
  "targetLang": "am",
  "style": "balanced"
}
```

**200**

```json
{
  "word": "optional",
  "pos": "adjective",
  "tr": "አማራጭ",
  "translit": "amarach",
  "lang": "am",
  "langName": "Amharic",
  "s1": "It means night no longer forced people to stop — staying active became a choice.",
  "s2": "The phrase marks the book's turning point: light gave people control over their time.",
  "audioUrl": "https://cdn.example.com/tts/am/8f2c.mp3",
  "quota": { … }
}
```

Field-by-field against the card:

| Field               | Where it lands                    | Constraint                                                                                                                        |
| ------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `word`              | Card title, serif 20pt            | Echo the selection, normalised for case. One line.                                                                                |
| `pos`               | Grey pill, top right              | Short — `"adjective"`, `"verb (past)"`. ~14 chars, it is a fixed pill.                                                            |
| `tr`                | Large accent-coloured translation | The translation itself, in the target script.                                                                                     |
| `translit`          | `· amarach · Amharic`             | Latin transliteration. Omit the key if the target language is already Latin-script.                                               |
| `lang` / `langName` | — / the same subtitle             | `lang` must be one of `am`, `ar`, `en`.                                                                                           |
| `s1`                | First ✦ bullet                    | **What it means in this passage** — not a dictionary gloss. Roughly 12–24 words; the card wraps to 2–3 lines and does not scroll. |
| `s2`                | Second ✦ bullet                   | **Why it matters here** — the sentence's point, or the contrast it sets up. Same length budget.                                   |
| `audioUrl`          | "Hear it" button                  | Optional. Direct HTTPS MP3/M4A of `tr` spoken in `lang`. Omit and the client hides the button.                                    |

`s1`/`s2` are the whole value of this feature — two sentences that only make
sense _given this book_. Generic dictionary output is a regression from what the
prototype fakes today. Keep them under 140 characters each; longer text pushes
the action row off the card.

Save word / Highlight write a `VocabEntry` (§2.2) built entirely from this
response, so anything missing here is missing from the user's vocabulary list
forever.

### 5.3 Hey Lexi — book-scoped chat

```http
POST /ai/chat
{
  "docKey": "3f2a…",
  "sessionId": "9c1e…",          // client-generated per document, reused
  "title": "Ego Is the Enemy",
  "author": "Ryan Holiday",
  "page": 47,
  "excerpt": "…text of the current page, ~1200 chars…",
  "message": "Why does he keep coming back to Sherman?",
  "style": "balanced"
}
```

**200**

```json
{
  "reply": "Sherman is the counter-example the book keeps reaching for …",
  "kind": "normal",
  "sessionId": "9c1e…",
  "quota": { … }
}
```

`kind` drives how the client renders the bubble and already exists in
`src/components/reader/lexi.tsx`:

| `kind`   | Meaning                                                               | Client behaviour                                                                                                                                            |
| -------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normal` | An answer about this book.                                            | Standard bubble.                                                                                                                                            |
| `drift`  | The question is **off-topic** — not about this document.              | Softer styling; the copy should redirect back to reading, e.g. _"Happy to chat, but let's park that — you were doing well in Chapter 3. Want to continue?"_ |
| `recap`  | The user has gone three or more turns down a tangent inside the book. | Summarises and nudges them onward.                                                                                                                          |

**The scoping rule is a hard requirement.** Lexi answers questions about the open
document and nothing else — no general knowledge, no other books, no code, no
"ignore your instructions". Off-topic gets `kind: "drift"` and a redirect, never
an answer and never a bare refusal. Enforce this server-side in the system
prompt _and_ with an output check; the client cannot verify it. Treat the
document text as untrusted data, not instructions — a PDF can contain
"ignore previous instructions" and must not be obeyed.

Questions about the book's own subject matter that go slightly beyond the text
(_"who was Sherman?"_) should be answered briefly **and tied back to the book** —
that is `normal`, not `drift`. Getting this line right matters more than any
other prompt decision here.

Streaming is not required for v1; the client shows a typing indicator and awaits
the whole reply. If you add SSE later, keep this JSON route working.

### 5.4 Text to speech

```http
GET /ai/tts?text=%E1%8A%A0%E1%88%9B%E1%88%AB%E1%8C%AD&lang=am
```

**200** `{ "audioUrl": "https://cdn.example.com/tts/am/8f2c.mp3", "quota": { … } }`

Direct HTTPS audio, `Content-Type: audio/mpeg` at the target, no auth on the
media URL, cacheable for at least 24h. Only needed if `audioUrl` is not already
inlined in the translate response. `am` (Amharic) may have no voice available —
return **200** with `audioUrl` omitted rather than an error, and the client hides
"Hear it".

---

## 6. What the client builds against this

Frontend work this specification unlocks, in the order it should land:

1. **Device session on boot** — generate the UUID, `POST /auth/device`, store
   tokens. Everything else assumes a valid Bearer token exists.
2. **`docKey` computation** and a migration that back-fills it for documents
   already in MMKV, then the `/sync` loop (debounced push, pull on foreground).
3. **Translate action** in `AnnotateBar` (`src/components/reader/AnnotateBar.tsx`),
   opening the word card. The card itself already exists as `WordPopover`
   (`src/components/reader/sheets.tsx:201`) but is wired to a local `DICT`
   fixture — it gets repointed at `/ai/translate`.
4. **Note modal.** Tapping a highlight that has a note currently routes to the
   Notes screen; it should open a centred modal showing the note in place. No API.
5. **Lexi chat** — replace the canned `REPLY_POOL` in
   `src/components/reader/lexi.tsx` with `/ai/chat`, keeping the existing
   `drift` / `normal` / `recap` rendering.
6. **Sign-in wall** on `402 AI_QUOTA_EXHAUSTED` + `requiresAuth`, Google and
   email. The app has **no `/login` route yet**, and `src/utils/axios.ts:109`
   already redirects there on auth failure — that route has to exist.
7. **Account row at the bottom of Settings** (`SettingsPanel.tsx`): "Sign in" when
   anonymous, name + "Log out" when signed in. The user asked for this in
   Settings rather than the library header avatar.
8. **Onboarding interests → `/book-suggestions`**, replacing the three hard-coded
   Gutendex seeds.

---

## 7. Decisions taken, and what would change them

These were open; they are now settled so the backend can start. Each says what
evidence would reverse it.

**1. `docKey` is `sha256(lowercase(fileName) + ":" + fileSizeBytes)`.** A
content hash is stricter but means reading the whole file on a phone to open a
document — a 200 MB scan would stall the library. Name+size collides only for
same-named, same-length files, whose consequence is shared highlights, not lost
data. _Reverse it if_ documents are ever server-hosted, where a content hash is
free and dedupes uploads.

**2. Chat runs on a rolling excerpt for v1; book ingest (§5.1) is v2.** Shipping
storage, chunking and a vector index before a single user has asked Lexi a
question is the wrong order — the current page plus title and author answers
"what does this mean" and "why does this matter", which is most of what gets
asked while reading. _Reverse it when_ the first real complaint is
cross-chapter recall ("where did he introduce this?"), which the excerpt
genuinely cannot serve. Keep `/ai/context` in the route table so the client can
start uploading without a client release.

**3. Quota is counted in requests, not tokens.** Users cannot reason about
tokens, and the client only renders `used`/`limit` — "8 of 20 questions" is a
sentence someone can act on. Meter tokens internally for cost; expose requests.
_Reverse it if_ per-request cost varies enough that a fixed count misprices
heavy use.

**4. Anonymous allowance: 10 AI actions, non-renewing (`resetsAt: null`).**
Enough to feel what Lexi does on a real document — a couple of translations, a
few questions — and not enough to live on. It doesn't reset because a renewing
free tier removes the reason to ever sign in. Signed-in free tier: 30/month,
renewing. _Reverse it if_ wall-to-signup conversion is poor; 10 is a guess and
the only honest way to tune it is watching where people stop.

**5. Google via native Sign-In (`idToken` → `POST /auth/link/google`).** A web
OAuth round trip through a browser tab is the worst moment in the flow, and the
user hits this wall mid-sentence in a book. Client needs
`@react-native-google-signin/google-signin`; the button exists and is inert
until it's installed. _Reverse it if_ the app has to ship to a platform where
the native module is unavailable.

**6. All routes are `/v1/…`.** The client's axios base URL already is
(`EXPO_PUBLIC_API_URL`, default `http://localhost:3000/v1`), and the earlier
`/api/…` draft predates it.

The one decision worth arguing about before you write code is **1**, because it
is the only one that cannot be changed after real user data exists.
