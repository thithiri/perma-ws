// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

module app::perma;

use enclave::enclave::{Self, Enclave};
use std::string::String;

/// ====
/// Core onchain app logic, replace it with your own.
/// ====
///

const PERMA_INTENT: u8 = 0;
const EInvalidSignature: u64 = 1;

public struct PermaNFT has key, store {
    id: UID,
    url: String,
    reference_id: String,
    screenshot_blob_id: String,
    screenshot_byte_size: u64,
    timestamp_ms: u64,
}

/// Should match the inner struct T used for IntentMessage<T> in Rust.
public struct PermaResponse has copy, drop {
    url: String,
    reference_id: String,
    screenshot_blob_id: String,
    screenshot_byte_size: u64,
}

public struct PERMA has drop {}

fun init(otw: PERMA, ctx: &mut TxContext) {
    let cap = enclave::new_cap(otw, ctx);

    cap.create_enclave_config(
        b"perma enclave".to_string(),
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // pcr0
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // pcr1
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // pcr2
        ctx,
    );

    transfer::public_transfer(cap, ctx.sender())
}

public fun update_perma<T>(
    url: String,
    reference_id: String,
    screenshot_blob_id: String,
    screenshot_byte_size: u64,
    timestamp_ms: u64,
    sig: &vector<u8>,
    enclave: &Enclave<T>,
    ctx: &mut TxContext,
): PermaNFT {
    let res = enclave.verify_signature(
        PERMA_INTENT,
        timestamp_ms,
        PermaResponse { url, reference_id, screenshot_blob_id, screenshot_byte_size },
        sig,
    );
    assert!(res, EInvalidSignature);
    // Mint NFT, replace it with your own logic.
    PermaNFT {
        id: object::new(ctx),
        url,
        reference_id,
        screenshot_blob_id,
        screenshot_byte_size,
        timestamp_ms,
    }
}
