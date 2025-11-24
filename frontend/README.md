# Perma-WS Frontend

A Next.js application with DaisyUI for creating and viewing permanent web snapshots.

## Features

1. **URL Input Screen** (`/`)
   - Validates URL format
   - Calls the `/process_data` endpoint
   - Redirects to view page on success

2. **View Screen** (`/w/[reference_id]`)
   - Displays WACZ archive using replayweb.page viewer
   - Shows PNG screenshot with scrollable container
   - Download links for both files

## Setup

```bash
npm install
npm run dev
```

## API Endpoint

The app expects the backend API at `http://localhost:3000/process_data`.

## File URLs

Files are accessed at:
- WACZ: `https://perma-ws.storage.nami.cloud/[reference_id]/[reference_id].wacz`
- PNG: `https://perma-ws.storage.nami.cloud/[reference_id]/[reference_id].png`

## Technologies

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- DaisyUI v5.5.5
