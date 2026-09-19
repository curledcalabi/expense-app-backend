# Campus Expense Tracker — Backend

Backend API for a campus spending tracker. Students log what they spend at
campus shops either by typing it in, or by uploading a photo of a receipt or
UPI payment screenshot — the API reads the image and extracts the shop and
the amount automatically.

Built for VIT Vellore campus: 28 real shops, mapped to coordinates for the
frontend's campus map.

## What's here

| Endpoint | What it does |
|---|---|
| `POST /parse-receipt` | Reads a receipt image, returns shop + amount |
| `POST /parse-receipt/confirm` | Teaches the system a merchant→shop mapping |
| `GET /shops` | The 28 campus shops with map coordinates |
| `POST /users`, `GET /users/:id` | User records |
| `POST /transactions`, `GET /transactions` | Spending entries |
| `POST /goals`, `GET /goals` | Budget goals |

## The interesting part: `/parse-receipt`

Send a base64-encoded image:

```json
POST /parse-receipt
{ "imageBase64": "<base64>", "mimeType": "image/jpeg" }
```

Get back structured data:

```json
{
  "ok": true,
  "shopId": 12,
  "shopName": "Dominos",
  "amount": 350,
  "confidence": 0.92,
  "needsConfirmation": false,
  "ambiguous": false,
  "candidates": []
}
```

### Why it's not just OCR

Reading the number off a receipt is the easy half. The hard half is working
out *which shop* it came from, and real receipts make that genuinely difficult:

**Problem 1 — UPI receipts don't print shop names.** They print the merchant's
registered legal entity. A payment to a campus stall comes back as
`MUNISAMY PUNNIYAMURTHY` or `CHANGEPAY MMS TECHNOLOGIES PRIVATE LIMITED`.
No amount of string matching connects that to "Nescafe (SJT)" — the shop's
name isn't on the receipt at all.

**Problem 2 — many shops share a name.** The campus has five Nescafe outlets,
three general stores, two All Marts. A receipt saying `NESCAFE` is genuinely
ambiguous, and guessing means a 1-in-5 chance of logging the expense against
the wrong shop.

### How it handles both

1. **The shop list goes into the prompt.** The model is asked to pick from the
   28 known shops rather than return free text, which removes most fuzzy
   matching before it starts.

2. **A matcher as backstop.** Normalization (punctuation, `PVT LTD`, city
   names) plus token overlap and Levenshtein distance, scored 0–1.

3. **Ambiguity is reported, not guessed.** Shops are stored as base name +
   location (`Nescafe` + `SJT`). When several score within 0.05 of each other,
   the API returns `ambiguous: true` and a `candidates` array instead of
   picking one. The app shows a one-tap chooser.

4. **It learns.** When a user confirms an unmatched receipt, `POST
   /parse-receipt/confirm` stores the mapping. `MUNISAMY PUNNIYAMURTHY` →
   shop 11. Every later receipt from that merchant resolves instantly. This is
   the only thing that solves Problem 1 — the mapping can't be derived, it has
   to be learned once.

The design principle throughout: **a wrong answer is worse than asking.**
Unmatched receipts return `needsConfirmation: true` and a null `shopId` rather
than a plausible-looking guess.

### Reliability

Gemini's free tier returns 503 under load. The client retries three times with
exponential backoff (1s / 2s / 4s), then falls back through lighter models.
In testing, receipts that failed twice succeeded on the third attempt.

## Tech

- Node.js + Express
- Google Gemini (`gemini-3.6-flash`) for vision
- JSON file storage — deliberate, given the timeframe

## Running it

```bash
npm install
node server.js
```

Needs a Gemini API key (free, no card, from
[aistudio.google.com](https://aistudio.google.com)) as an environment
variable:

```
GEMINI_API_KEY=your_key_here
```

On Replit, add it under Secrets. The key is not in this repo.

Test the parser against an image:

```bash
node test-receipt.js your-receipt.jpg
```

## Results so far

Tested against real UPI screenshots and paper bills:

- Amount extraction: correct on every receipt tested
- Shop matching: correctly identifies known shops; correctly flags aggregator
  names as needing confirmation rather than guessing wrong# Campus Expense Tracker — Backend

Backend API for a campus spending tracker. Students log what they spend at
campus shops either by typing it in, or by uploading a photo of a receipt or
UPI payment screenshot — the API reads the image and extracts the shop and
the amount automatically.

Built for VIT Vellore campus: 28 real shops, mapped to coordinates for the
frontend's campus map.

## What's here

| Endpoint | What it does |
|---|---|
| `POST /parse-receipt` | Reads a receipt image, returns shop + amount |
| `POST /parse-receipt/confirm` | Teaches the system a merchant→shop mapping |
| `GET /shops` | The 28 campus shops with map coordinates |
| `POST /users`, `GET /users/:id` | User records |
| `POST /transactions`, `GET /transactions` | Spending entries |
| `POST /goals`, `GET /goals` | Budget goals |

## The interesting part: `/parse-receipt`

Send a base64-encoded image:

```json
POST /parse-receipt
{ "imageBase64": "<base64>", "mimeType": "image/jpeg" }
```

Get back structured data:

```json
{
  "ok": true,
  "shopId": 12,
  "shopName": "Dominos",
  "amount": 350,
  "confidence": 0.92,
  "needsConfirmation": false,
  "ambiguous": false,
  "candidates": []
}
```

### Why it's not just OCR

Reading the number off a receipt is the easy half. The hard half is working
out *which shop* it came from, and real receipts make that genuinely difficult:

**Problem 1 — UPI receipts don't print shop names.** They print the merchant's
registered legal entity. A payment to a campus stall comes back as
`MUNISAMY PUNNIYAMURTHY` or `CHANGEPAY MMS TECHNOLOGIES PRIVATE LIMITED`.
No amount of string matching connects that to "Nescafe (SJT)" — the shop's
name isn't on the receipt at all.

**Problem 2 — many shops share a name.** The campus has five Nescafe outlets,
three general stores, two All Marts. A receipt saying `NESCAFE` is genuinely
ambiguous, and guessing means a 1-in-5 chance of logging the expense against
the wrong shop.

### How it handles both

1. **The shop list goes into the prompt.** The model is asked to pick from the
   28 known shops rather than return free text, which removes most fuzzy
   matching before it starts.

2. **A matcher as backstop.** Normalization (punctuation, `PVT LTD`, city
   names) plus token overlap and Levenshtein distance, scored 0–1.

3. **Ambiguity is reported, not guessed.** Shops are stored as base name +
   location (`Nescafe` + `SJT`). When several score within 0.05 of each other,
   the API returns `ambiguous: true` and a `candidates` array instead of
   picking one. The app shows a one-tap chooser.

4. **It learns.** When a user confirms an unmatched receipt, `POST
   /parse-receipt/confirm` stores the mapping. `MUNISAMY PUNNIYAMURTHY` →
   shop 11. Every later receipt from that merchant resolves instantly. This is
   the only thing that solves Problem 1 — the mapping can't be derived, it has
   to be learned once.

The design principle throughout: **a wrong answer is worse than asking.**
Unmatched receipts return `needsConfirmation: true` and a null `shopId` rather
than a plausible-looking guess.

### Reliability

Gemini's free tier returns 503 under load. The client retries three times with
exponential backoff (1s / 2s / 4s), then falls back through lighter models.
In testing, receipts that failed twice succeeded on the third attempt.

## Tech

- Node.js + Express
- Google Gemini (`gemini-3.6-flash`) for vision
- JSON file storage — deliberate, given the timeframe

## Running it

```bash
npm install
node server.js
```

Needs a Gemini API key (free, no card, from
[aistudio.google.com](https://aistudio.google.com)) as an environment
variable:

```
GEMINI_API_KEY=your_key_here
```

On Replit, add it under Secrets. The key is not in this repo.

Test the parser against an image:

```bash
node test-receipt.js your-receipt.jpg
```

## Results so far

Tested against real UPI screenshots and paper bills:

- Amount extraction: correct on every receipt tested
- Shop matching: correctly identifies known shops; correctly flags aggregator
  names as needing confirmation rather than guessing wrong# Campus Expense Tracker — Backend

Backend API for a campus spending tracker. Students log what they spend at
campus shops either by typing it in, or by uploading a photo of a receipt or
UPI payment screenshot — the API reads the image and extracts the shop and
the amount automatically.

Built for VIT Vellore campus: 28 real shops, mapped to coordinates for the
frontend's campus map.

## What's here

| Endpoint | What it does |
|---|---|
| `POST /parse-receipt` | Reads a receipt image, returns shop + amount |
| `POST /parse-receipt/confirm` | Teaches the system a merchant→shop mapping |
| `GET /shops` | The 28 campus shops with map coordinates |
| `POST /users`, `GET /users/:id` | User records |
| `POST /transactions`, `GET /transactions` | Spending entries |
| `POST /goals`, `GET /goals` | Budget goals |

## The interesting part: `/parse-receipt`

Send a base64-encoded image:

```json
POST /parse-receipt
{ "imageBase64": "<base64>", "mimeType": "image/jpeg" }
```

Get back structured data:

```json
{
  "ok": true,
  "shopId": 12,
  "shopName": "Dominos",
  "amount": 350,
  "confidence": 0.92,
  "needsConfirmation": false,
  "ambiguous": false,
  "candidates": []
}
```

### Why it's not just OCR

Reading the number off a receipt is the easy half. The hard half is working
out *which shop* it came from, and real receipts make that genuinely difficult:

**Problem 1 — UPI receipts don't print shop names.** They print the merchant's
registered legal entity. A payment to a campus stall comes back as
`MUNISAMY PUNNIYAMURTHY` or `CHANGEPAY MMS TECHNOLOGIES PRIVATE LIMITED`.
No amount of string matching connects that to "Nescafe (SJT)" — the shop's
name isn't on the receipt at all.

**Problem 2 — many shops share a name.** The campus has five Nescafe outlets,
three general stores, two All Marts. A receipt saying `NESCAFE` is genuinely
ambiguous, and guessing means a 1-in-5 chance of logging the expense against
the wrong shop.

### How it handles both

1. **The shop list goes into the prompt.** The model is asked to pick from the
   28 known shops rather than return free text, which removes most fuzzy
   matching before it starts.

2. **A matcher as backstop.** Normalization (punctuation, `PVT LTD`, city
   names) plus token overlap and Levenshtein distance, scored 0–1.

3. **Ambiguity is reported, not guessed.** Shops are stored as base name +
   location (`Nescafe` + `SJT`). When several score within 0.05 of each other,
   the API returns `ambiguous: true` and a `candidates` array instead of
   picking one. The app shows a one-tap chooser.

4. **It learns.** When a user confirms an unmatched receipt, `POST
   /parse-receipt/confirm` stores the mapping. `MUNISAMY PUNNIYAMURTHY` →
   shop 11. Every later receipt from that merchant resolves instantly. This is
   the only thing that solves Problem 1 — the mapping can't be derived, it has
   to be learned once.

The design principle throughout: **a wrong answer is worse than asking.**
Unmatched receipts return `needsConfirmation: true` and a null `shopId` rather
than a plausible-looking guess.

### Reliability

Gemini's free tier returns 503 under load. The client retries three times with
exponential backoff (1s / 2s / 4s), then falls back through lighter models.
In testing, receipts that failed twice succeeded on the third attempt.

## Tech

- Node.js + Express
- Google Gemini (`gemini-3.6-flash`) for vision
- JSON file storage — deliberate, given the timeframe

## Running it

```bash
npm install
node server.js
```

Needs a Gemini API key (free, no card, from
[aistudio.google.com](https://aistudio.google.com)) as an environment
variable:

```
GEMINI_API_KEY=your_key_here
```

On Replit, add it under Secrets. The key is not in this repo.

Test the parser against an image:

```bash
node test-receipt.js your-receipt.jpg
```

## Results so far

Tested against real UPI screenshots and paper bills:

- Amount extraction: correct on every receipt tested
- Shop matching: correctly identifies known shops; correctly flags aggregator
  names as needing confirmation rather than guessing wrong# Campus Expense Tracker — Backend

Backend API for a campus spending tracker. Students log what they spend at
campus shops either by typing it in, or by uploading a photo of a receipt or
UPI payment screenshot — the API reads the image and extracts the shop and
the amount automatically.

Built for VIT Vellore campus: 28 real shops, mapped to coordinates for the
frontend's campus map.

## What's here

| Endpoint | What it does |
|---|---|
| `POST /parse-receipt` | Reads a receipt image, returns shop + amount |
| `POST /parse-receipt/confirm` | Teaches the system a merchant→shop mapping |
| `GET /shops` | The 28 campus shops with map coordinates |
| `POST /users`, `GET /users/:id` | User records |
| `POST /transactions`, `GET /transactions` | Spending entries |
| `POST /goals`, `GET /goals` | Budget goals |

## The interesting part: `/parse-receipt`

Send a base64-encoded image:

```json
POST /parse-receipt
{ "imageBase64": "<base64>", "mimeType": "image/jpeg" }
```

Get back structured data:

```json
{
  "ok": true,
  "shopId": 12,
  "shopName": "Dominos",
  "amount": 350,
  "confidence": 0.92,
  "needsConfirmation": false,
  "ambiguous": false,
  "candidates": []
}
```

### Why it's not just OCR

Reading the number off a receipt is the easy half. The hard half is working
out *which shop* it came from, and real receipts make that genuinely difficult:

**Problem 1 — UPI receipts don't print shop names.** They print the merchant's
registered legal entity. A payment to a campus stall comes back as
`MUNISAMY PUNNIYAMURTHY` or `CHANGEPAY MMS TECHNOLOGIES PRIVATE LIMITED`.
No amount of string matching connects that to "Nescafe (SJT)" — the shop's
name isn't on the receipt at all.

**Problem 2 — many shops share a name.** The campus has five Nescafe outlets,
three general stores, two All Marts. A receipt saying `NESCAFE` is genuinely
ambiguous, and guessing means a 1-in-5 chance of logging the expense against
the wrong shop.

### How it handles both

1. **The shop list goes into the prompt.** The model is asked to pick from the
   28 known shops rather than return free text, which removes most fuzzy
   matching before it starts.

2. **A matcher as backstop.** Normalization (punctuation, `PVT LTD`, city
   names) plus token overlap and Levenshtein distance, scored 0–1.

3. **Ambiguity is reported, not guessed.** Shops are stored as base name +
   location (`Nescafe` + `SJT`). When several score within 0.05 of each other,
   the API returns `ambiguous: true` and a `candidates` array instead of
   picking one. The app shows a one-tap chooser.

4. **It learns.** When a user confirms an unmatched receipt, `POST
   /parse-receipt/confirm` stores the mapping. `MUNISAMY PUNNIYAMURTHY` →
   shop 11. Every later receipt from that merchant resolves instantly. This is
   the only thing that solves Problem 1 — the mapping can't be derived, it has
   to be learned once.

The design principle throughout: **a wrong answer is worse than asking.**
Unmatched receipts return `needsConfirmation: true` and a null `shopId` rather
than a plausible-looking guess.

### Reliability

Gemini's free tier returns 503 under load. The client retries three times with
exponential backoff (1s / 2s / 4s), then falls back through lighter models.
In testing, receipts that failed twice succeeded on the third attempt.

## Tech

- Node.js + Express
- Google Gemini (`gemini-3.6-flash`) for vision
- JSON file storage — deliberate, given the timeframe

## Running it

```bash
npm install
node server.js
```

Needs a Gemini API key (free, no card, from
[aistudio.google.com](https://aistudio.google.com)) as an environment
variable:

```
GEMINI_API_KEY=your_key_here
```

On Replit, add it under Secrets. The key is not in this repo.

Test the parser against an image:

```bash
node test-receipt.js your-receipt.jpg
```

## Results so far

Tested against real UPI screenshots and paper bills:

- Amount extraction: correct on every receipt tested
- Shop matching: correctly identifies known shops; correctly flags aggregator
  names as needing confirmation rather than guessing wrong# Campus Expense Tracker — Backend

Backend API for a campus spending tracker. Students log what they spend at
campus shops either by typing it in, or by uploading a photo of a receipt or
UPI payment screenshot — the API reads the image and extracts the shop and
the amount automatically.

Built for VIT Vellore campus: 28 real shops, mapped to coordinates for the
frontend's campus map.

## What's here

| Endpoint | What it does |
|---|---|
| `POST /parse-receipt` | Reads a receipt image, returns shop + amount |
| `POST /parse-receipt/confirm` | Teaches the system a merchant→shop mapping |
| `GET /shops` | The 28 campus shops with map coordinates |
| `POST /users`, `GET /users/:id` | User records |
| `POST /transactions`, `GET /transactions` | Spending entries |
| `POST /goals`, `GET /goals` | Budget goals |

## The interesting part: `/parse-receipt`

Send a base64-encoded image:

```json
POST /parse-receipt
{ "imageBase64": "<base64>", "mimeType": "image/jpeg" }
```

Get back structured data:

```json
{
  "ok": true,
  "shopId": 12,
  "shopName": "Dominos",
  "amount": 350,
  "confidence": 0.92,
  "needsConfirmation": false,
  "ambiguous": false,
  "candidates": []
}
```

### Why it's not just OCR

Reading the number off a receipt is the easy half. The hard half is working
out *which shop* it came from, and real receipts make that genuinely difficult:

**Problem 1 — UPI receipts don't print shop names.** They print the merchant's
registered legal entity. A payment to a campus stall comes back as
`MUNISAMY PUNNIYAMURTHY` or `CHANGEPAY MMS TECHNOLOGIES PRIVATE LIMITED`.
No amount of string matching connects that to "Nescafe (SJT)" — the shop's
name isn't on the receipt at all.

**Problem 2 — many shops share a name.** The campus has five Nescafe outlets,
three general stores, two All Marts. A receipt saying `NESCAFE` is genuinely
ambiguous, and guessing means a 1-in-5 chance of logging the expense against
the wrong shop.

### How it handles both

1. **The shop list goes into the prompt.** The model is asked to pick from the
   28 known shops rather than return free text, which removes most fuzzy
   matching before it starts.

2. **A matcher as backstop.** Normalization (punctuation, `PVT LTD`, city
   names) plus token overlap and Levenshtein distance, scored 0–1.

3. **Ambiguity is reported, not guessed.** Shops are stored as base name +
   location (`Nescafe` + `SJT`). When several score within 0.05 of each other,
   the API returns `ambiguous: true` and a `candidates` array instead of
   picking one. The app shows a one-tap chooser.

4. **It learns.** When a user confirms an unmatched receipt, `POST
   /parse-receipt/confirm` stores the mapping. `MUNISAMY PUNNIYAMURTHY` →
   shop 11. Every later receipt from that merchant resolves instantly. This is
   the only thing that solves Problem 1 — the mapping can't be derived, it has
   to be learned once.

The design principle throughout: **a wrong answer is worse than asking.**
Unmatched receipts return `needsConfirmation: true` and a null `shopId` rather
than a plausible-looking guess.

### Reliability

Gemini's free tier returns 503 under load. The client retries three times with
exponential backoff (1s / 2s / 4s), then falls back through lighter models.
In testing, receipts that failed twice succeeded on the third attempt.

## Tech

- Node.js + Express
- Google Gemini (`gemini-3.6-flash`) for vision
- JSON file storage — deliberate, given the timeframe

## Running it

```bash
npm install
node server.js
```

Needs a Gemini API key (free, no card, from
[aistudio.google.com](https://aistudio.google.com)) as an environment
variable:

```
GEMINI_API_KEY=your_key_here
```

On Replit, add it under Secrets. The key is not in this repo.

Test the parser against an image:

```bash
node test-receipt.js your-receipt.jpg
```

## Results so far

Tested against real UPI screenshots and paper bills:

- Amount extraction: correct on every receipt tested
- Shop matching: correctly identifies known shops; correctly flags aggregator
  names as needing confirmation rather than guessing wrong# Campus Expense Tracker — Backend

Backend API for a campus spending tracker. Students log what they spend at
campus shops either by typing it in, or by uploading a photo of a receipt or
UPI payment screenshot — the API reads the image and extracts the shop and
the amount automatically.

Built for VIT Vellore campus: 28 real shops, mapped to coordinates for the
frontend's campus map.

## What's here

| Endpoint | What it does |
|---|---|
| `POST /parse-receipt` | Reads a receipt image, returns shop + amount |
| `POST /parse-receipt/confirm` | Teaches the system a merchant→shop mapping |
| `GET /shops` | The 28 campus shops with map coordinates |
| `POST /users`, `GET /users/:id` | User records |
| `POST /transactions`, `GET /transactions` | Spending entries |
| `POST /goals`, `GET /goals` | Budget goals |

## The interesting part: `/parse-receipt`

Send a base64-encoded image:

```json
POST /parse-receipt
{ "imageBase64": "<base64>", "mimeType": "image/jpeg" }
```

Get back structured data:

```json
{
  "ok": true,
  "shopId": 12,
  "shopName": "Dominos",
  "amount": 350,
  "confidence": 0.92,
  "needsConfirmation": false,
  "ambiguous": false,
  "candidates": []
}
```

### Why it's not just OCR

Reading the number off a receipt is the easy half. The hard half is working
out *which shop* it came from, and real receipts make that genuinely difficult:

**Problem 1 — UPI receipts don't print shop names.** They print the merchant's
registered legal entity. A payment to a campus stall comes back as
`MUNISAMY PUNNIYAMURTHY` or `CHANGEPAY MMS TECHNOLOGIES PRIVATE LIMITED`.
No amount of string matching connects that to "Nescafe (SJT)" — the shop's
name isn't on the receipt at all.

**Problem 2 — many shops share a name.** The campus has five Nescafe outlets,
three general stores, two All Marts. A receipt saying `NESCAFE` is genuinely
ambiguous, and guessing means a 1-in-5 chance of logging the expense against
the wrong shop.

### How it handles both

1. **The shop list goes into the prompt.** The model is asked to pick from the
   28 known shops rather than return free text, which removes most fuzzy
   matching before it starts.

2. **A matcher as backstop.** Normalization (punctuation, `PVT LTD`, city
   names) plus token overlap and Levenshtein distance, scored 0–1.

3. **Ambiguity is reported, not guessed.** Shops are stored as base name +
   location (`Nescafe` + `SJT`). When several score within 0.05 of each other,
   the API returns `ambiguous: true` and a `candidates` array instead of
   picking one. The app shows a one-tap chooser.

4. **It learns.** When a user confirms an unmatched receipt, `POST
   /parse-receipt/confirm` stores the mapping. `MUNISAMY PUNNIYAMURTHY` →
   shop 11. Every later receipt from that merchant resolves instantly. This is
   the only thing that solves Problem 1 — the mapping can't be derived, it has
   to be learned once.

The design principle throughout: **a wrong answer is worse than asking.**
Unmatched receipts return `needsConfirmation: true` and a null `shopId` rather
than a plausible-looking guess.

### Reliability

Gemini's free tier returns 503 under load. The client retries three times with
exponential backoff (1s / 2s / 4s), then falls back through lighter models.
In testing, receipts that failed twice succeeded on the third attempt.

## Tech

- Node.js + Express
- Google Gemini (`gemini-3.6-flash`) for vision
- JSON file storage — deliberate, given the timeframe

## Running it

```bash
npm install
node server.js
```

Needs a Gemini API key (free, no card, from
[aistudio.google.com](https://aistudio.google.com)) as an environment
variable:

```
GEMINI_API_KEY=your_key_here
```

On Replit, add it under Secrets. The key is not in this repo.

Test the parser against an image:

```bash
node test-receipt.js your-receipt.jpg
```

## Results so far

Tested against real UPI screenshots and paper bills:

- Amount extraction: correct on every receipt tested
- Shop matching: correctly identifies known shops; correctly flags aggregator
  names as needing confirmation rather than guessing wrong# Campus Expense Tracker — Backend

Backend API for a campus spending tracker. Students log what they spend at
campus shops either by typing it in, or by uploading a photo of a receipt or
UPI payment screenshot — the API reads the image and extracts the shop and
the amount automatically.

Built for VIT Vellore campus: 28 real shops, mapped to coordinates for the
frontend's campus map.

## What's here

| Endpoint | What it does |
|---|---|
| `POST /parse-receipt` | Reads a receipt image, returns shop + amount |
| `POST /parse-receipt/confirm` | Teaches the system a merchant→shop mapping |
| `GET /shops` | The 28 campus shops with map coordinates |
| `POST /users`, `GET /users/:id` | User records |
| `POST /transactions`, `GET /transactions` | Spending entries |
| `POST /goals`, `GET /goals` | Budget goals |

## The interesting part: `/parse-receipt`

Send a base64-encoded image:

```json
POST /parse-receipt
{ "imageBase64": "<base64>", "mimeType": "image/jpeg" }
```

Get back structured data:

```json
{
  "ok": true,
  "shopId": 12,
  "shopName": "Dominos",
  "amount": 350,
  "confidence": 0.92,
  "needsConfirmation": false,
  "ambiguous": false,
  "candidates": []
}
```

### Why it's not just OCR

Reading the number off a receipt is the easy half. The hard half is working
out *which shop* it came from, and real receipts make that genuinely difficult:

**Problem 1 — UPI receipts don't print shop names.** They print the merchant's
registered legal entity. A payment to a campus stall comes back as
`MUNISAMY PUNNIYAMURTHY` or `CHANGEPAY MMS TECHNOLOGIES PRIVATE LIMITED`.
No amount of string matching connects that to "Nescafe (SJT)" — the shop's
name isn't on the receipt at all.

**Problem 2 — many shops share a name.** The campus has five Nescafe outlets,
three general stores, two All Marts. A receipt saying `NESCAFE` is genuinely
ambiguous, and guessing means a 1-in-5 chance of logging the expense against
the wrong shop.

### How it handles both

1. **The shop list goes into the prompt.** The model is asked to pick from the
   28 known shops rather than return free text, which removes most fuzzy
   matching before it starts.

2. **A matcher as backstop.** Normalization (punctuation, `PVT LTD`, city
   names) plus token overlap and Levenshtein distance, scored 0–1.

3. **Ambiguity is reported, not guessed.** Shops are stored as base name +
   location (`Nescafe` + `SJT`). When several score within 0.05 of each other,
   the API returns `ambiguous: true` and a `candidates` array instead of
   picking one. The app shows a one-tap chooser.

4. **It learns.** When a user confirms an unmatched receipt, `POST
   /parse-receipt/confirm` stores the mapping. `MUNISAMY PUNNIYAMURTHY` →
   shop 11. Every later receipt from that merchant resolves instantly. This is
   the only thing that solves Problem 1 — the mapping can't be derived, it has
   to be learned once.

The design principle throughout: **a wrong answer is worse than asking.**
Unmatched receipts return `needsConfirmation: true` and a null `shopId` rather
than a plausible-looking guess.

### Reliability

Gemini's free tier returns 503 under load. The client retries three times with
exponential backoff (1s / 2s / 4s), then falls back through lighter models.
In testing, receipts that failed twice succeeded on the third attempt.

## Tech

- Node.js + Express
- Google Gemini (`gemini-3.6-flash`) for vision
- JSON file storage — deliberate, given the timeframe

## Running it

```bash
npm install
node server.js
```

Needs a Gemini API key (free, no card, from
[aistudio.google.com](https://aistudio.google.com)) as an environment
variable:

```
GEMINI_API_KEY=your_key_here
```

On Replit, add it under Secrets. The key is not in this repo.

Test the parser against an image:

```bash
node test-receipt.js your-receipt.jpg
```

## Results so far

Tested against real UPI screenshots and paper bills:

- Amount extraction: correct on every receipt tested
- Shop matching: correctly identifies known shops; correctly flags aggregator
  names as needing confirmation rather than guessing wrong# Campus Expense Tracker — Backend

Backend API for a campus spending tracker. Students log what they spend at
campus shops either by typing it in, or by uploading a photo of a receipt or
UPI payment screenshot — the API reads the image and extracts the shop and
the amount automatically.

Built for VIT Vellore campus: 28 real shops, mapped to coordinates for the
frontend's campus map.

## What's here

| Endpoint | What it does |
|---|---|
| `POST /parse-receipt` | Reads a receipt image, returns shop + amount |
| `POST /parse-receipt/confirm` | Teaches the system a merchant→shop mapping |
| `GET /shops` | The 28 campus shops with map coordinates |
| `POST /users`, `GET /users/:id` | User records |
| `POST /transactions`, `GET /transactions` | Spending entries |
| `POST /goals`, `GET /goals` | Budget goals |

## The interesting part: `/parse-receipt`

Send a base64-encoded image:

```json
POST /parse-receipt
{ "imageBase64": "<base64>", "mimeType": "image/jpeg" }
```

Get back structured data:

```json
{
  "ok": true,
  "shopId": 12,
  "shopName": "Dominos",
  "amount": 350,
  "confidence": 0.92,
  "needsConfirmation": false,
  "ambiguous": false,
  "candidates": []
}
```

### Why it's not just OCR

Reading the number off a receipt is the easy half. The hard half is working
out *which shop* it came from, and real receipts make that genuinely difficult:

**Problem 1 — UPI receipts don't print shop names.** They print the merchant's
registered legal entity. A payment to a campus stall comes back as
`MUNISAMY PUNNIYAMURTHY` or `CHANGEPAY MMS TECHNOLOGIES PRIVATE LIMITED`.
No amount of string matching connects that to "Nescafe (SJT)" — the shop's
name isn't on the receipt at all.

**Problem 2 — many shops share a name.** The campus has five Nescafe outlets,
three general stores, two All Marts. A receipt saying `NESCAFE` is genuinely
ambiguous, and guessing means a 1-in-5 chance of logging the expense against
the wrong shop.

### How it handles both

1. **The shop list goes into the prompt.** The model is asked to pick from the
   28 known shops rather than return free text, which removes most fuzzy
   matching before it starts.

2. **A matcher as backstop.** Normalization (punctuation, `PVT LTD`, city
   names) plus token overlap and Levenshtein distance, scored 0–1.

3. **Ambiguity is reported, not guessed.** Shops are stored as base name +
   location (`Nescafe` + `SJT`). When several score within 0.05 of each other,
   the API returns `ambiguous: true` and a `candidates` array instead of
   picking one. The app shows a one-tap chooser.

4. **It learns.** When a user confirms an unmatched receipt, `POST
   /parse-receipt/confirm` stores the mapping. `MUNISAMY PUNNIYAMURTHY` →
   shop 11. Every later receipt from that merchant resolves instantly. This is
   the only thing that solves Problem 1 — the mapping can't be derived, it has
   to be learned once.

The design principle throughout: **a wrong answer is worse than asking.**
Unmatched receipts return `needsConfirmation: true` and a null `shopId` rather
than a plausible-looking guess.

### Reliability

Gemini's free tier returns 503 under load. The client retries three times with
exponential backoff (1s / 2s / 4s), then falls back through lighter models.
In testing, receipts that failed twice succeeded on the third attempt.

## Tech

- Node.js + Express
- Google Gemini (`gemini-3.6-flash`) for vision
- JSON file storage — deliberate, given the timeframe

## Running it

```bash
npm install
node server.js
```

Needs a Gemini API key (free, no card, from
[aistudio.google.com](https://aistudio.google.com)) as an environment
variable:

```
GEMINI_API_KEY=your_key_here
```

On Replit, add it under Secrets. The key is not in this repo.

Test the parser against an image:

```bash
node test-receipt.js your-receipt.jpg
```

## Results so far

Tested against real UPI screenshots and paper bills:

- Amount extraction: correct on every receipt tested
- Shop matching: correctly identifies known shops; correctly flags aggregator
  names as needing confirmation rather than guessing wrong