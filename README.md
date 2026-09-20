# Liqrai — API

This is the backend for **Liqrai**, a reading app for PDFs and books that
lets you actually talk to what you're reading.

## What Liqrai is

Reading a dense PDF alone is slow. You hit a paragraph that doesn't make
sense, a claim that sounds off, a reference you don't recognize — and there's
no one to ask. Liqrai puts a companion next to the page that has actually
read the document with you, so you can just ask.

- **Talk to your book.** Liqrai answers questions about the specific
  document you have open — not a generic chatbot, one that knows what page
  you're on and what the book actually argues.
- **Voice, not just text.** You can speak to Liqrai and hear it speak back,
  so a question doesn't have to interrupt your reading to become a typing
  session.
- **A second opinion on the page.** Liqrai quietly checks what you're
  reading for claims that look wrong, outdated, or unsupported, and marks
  them right on the page — not as a verdict, but as something worth a
  second look. You can ask Liqrai to make its case, or argue back.
- **Reads the way you like to read.** Fonts, layout, and page reflow are
  yours to tune, and Liqrai remembers them.
- **Start reading immediately.** No account needed to open a book and start
  asking questions. Liqrai only asks you to sign in once you've used enough
  of it that it's worth remembering who you are.

## Running it locally

You'll need Node.js 20.19+ and a PostgreSQL database.

```bash
yarn install
cp .env.example .env   # fill in your database URL and Gemini key (GOOGLE_API_KEY)
yarn db:migrate        # Prisma reads DATABASE_URL through prisma.config.ts
yarn dev
```

Run Prisma from the project root, through the `db:*` scripts or
`yarn prisma …`, so it's this project's version (7.x) rather than whatever
`npx prisma` fetches.

The API starts on the port set in `.env`. The [Liqrai app](../lexi-pdf-reader)
is the client this serves.
