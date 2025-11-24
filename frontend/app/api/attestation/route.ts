import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { admin_secret, reference_id, attestation } = body;

    if (admin_secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!reference_id || !attestation) {
      return NextResponse.json(
        { error: 'Missing reference_id or attestation' },
        { status: 400 }
      );
    }

    // Ensure table exists (basic migration for this task)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attestations (
        reference_id TEXT PRIMARY KEY,
        attestation JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const query = `
      INSERT INTO attestations (reference_id, attestation)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const values = [reference_id, attestation];

    const result = await pool.query(query, values);

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: any) {
    console.error('Error saving attestation:', error);
    if (error.code === '23505') { // Unique violation
      return NextResponse.json(
        { error: 'Attestation with this reference_id already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const reference_id = searchParams.get('reference_id');

  if (!reference_id) {
    return NextResponse.json(
      { error: 'Missing reference_id query parameter' },
      { status: 400 }
    );
  }

  try {
    const query = 'SELECT * FROM attestations WHERE reference_id = $1';
    const values = [reference_id];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Attestation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error retrieving attestation:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
