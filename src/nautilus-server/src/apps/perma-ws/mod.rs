// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use crate::common::IntentMessage;
use crate::common::{to_signed_response, IntentScope, ProcessDataRequest, ProcessedDataResponse};
use crate::AppState;
use crate::EnclaveError;
use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tracing::info;
use rand::Rng;
use urlencoding;
/// ====
/// Core Nautilus server logic, replace it with your own
/// relavant structs and process_data endpoint.
/// ====
/// Inner type T for IntentMessage<T>
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PermaResponse {
    pub url: String,
    pub reference_id: String,
    pub screenshot_blob_id: String,
    pub screenshot_byte_size: usize,
}

/// Inner type T for ProcessDataRequest<T>
#[derive(Debug, Serialize, Deserialize)]
pub struct PermaRequest {
    pub url: String,
}

/// Encode a u64 number to base36 string (like JavaScript's toString(36))
fn u64_to_base36(mut n: u64) -> String {
    if n == 0 {
        return "0".to_string();
    }
    let base36_chars: Vec<char> = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".chars().collect();
    let mut result = String::new();
    while n > 0 {
        result.push(base36_chars[(n % 36) as usize]);
        n /= 36;
    }
    result.chars().rev().collect()
}

/// Get ETag from a URL using a Range request (only downloads 1 byte)
async fn get_etag(url: &str) -> Result<String, EnclaveError> {
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .header("Range", "bytes=0-0")
        .send()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("Failed to fetch URL: {}", e)))?;
    
    let etag = response
        .headers()
        .get("etag")
        .ok_or_else(|| EnclaveError::GenericError("ETag header not found".to_string()))?
        .to_str()
        .map_err(|e| EnclaveError::GenericError(format!("Invalid ETag header: {}", e)))?
        .to_string();
    
    Ok(etag)
}

/// Generate a reference ID by appending 2 random characters, capitalizing, and adding a hyphen before the last 4 characters
fn generate_reference_id() -> Result<String, EnclaveError> {
    // based on current timestamp, generate a referenceId from base36 encoding of current time in seconds since 01-01-2025
    let epoch_2025 = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1735689600); // 2025-01-01 00:00:00 UTC
    let current_timestamp_millis = std::time::SystemTime::now()
        .duration_since(epoch_2025)
        .map_err(|e| EnclaveError::GenericError(format!("Failed to get current timestamp: {}", e)))?
        .as_millis() as u64;

    let mut s = u64_to_base36(current_timestamp_millis);
    
    // Append 2 random alphanumeric characters
    let base36_chars: Vec<char> = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".chars().collect();
    let mut rng = rand::thread_rng();
    for _ in 0..2 {
        let random_idx = rng.gen_range(0..36);
        s.push(base36_chars[random_idx]);
    }
        
    // Add hyphen before the last 4 characters (split after the 4th character from the back)
    let split_point = s.len().saturating_sub(4);
    Ok(format!("{}-{}", &s[..split_point], &s[split_point..]))
}

pub async fn process_data(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<PermaRequest>>,
) -> Result<Json<ProcessedDataResponse<IntentMessage<PermaResponse>>>, EnclaveError> {
    let reference_id = generate_reference_id()?;
    let url = &request.payload.url;

    let scooper_secret = std::env::var("SCOOPER_SECRET")
        .map_err(|_| EnclaveError::GenericError("SCOOPER_SECRET not set".to_string()))?;

    // Make a POST request to scooper - it will upload to Walrus the .wacz file
    let scooper_url = "https://scooper-production.up.railway.app/scoop-async";
        
    // Build the JSON body for the scooper request matching the API structure
    let scooper_request_body = json!({
        "url": url,
        "referenceId": reference_id,
        "secret": scooper_secret
    });
    
    info!("Making POST request to scooper: {}", scooper_url);
    info!("Request body: {}", serde_json::to_string_pretty(&scooper_request_body).unwrap_or_default());
    
    let scooper_response = reqwest::Client::new()
        .post(scooper_url)
        .header("Content-Type", "application/json")
        .json(&scooper_request_body)
        .send()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("Failed to get scooper response: {}", e)))?;
    
    let status = scooper_response.status();
    info!("Scooper response status: {}", status);
    
    // check job, if it is already running then abort this
    if status != reqwest::StatusCode::ACCEPTED {
        return Err(EnclaveError::GenericError(format!(
            "Scooper returned status {} instead of 202, aborting",
            status
        )));
    }
    
    let scooper_json = scooper_response.json::<Value>().await.map_err(|e| {
        EnclaveError::GenericError(format!("Failed to parse scooper response: {}", e))
    })?;
    
    info!("Scooper response body: {}", serde_json::to_string_pretty(&scooper_json).unwrap_or_default());

    let access_key = std::env::var("ACCESS_KEY")
        .map_err(|_| EnclaveError::GenericError("ACCESS_KEY not set".to_string()))?;
    
    let storage_access_key_id = std::env::var("STORAGE_ACCESS_KEY_ID")
        .map_err(|_| EnclaveError::GenericError("STORAGE_ACCESS_KEY_ID not set".to_string()))?;

    let storage_secret_access_key = std::env::var("STORAGE_SECRET_ACCESS_KEY")
        .map_err(|_| EnclaveError::GenericError("STORAGE_SECRET_ACCESS_KEY not set".to_string()))?;
    
    let frontend_url = std::env::var("FRONTEND_URL")
        .map_err(|_| EnclaveError::GenericError("FRONTEND_URL not set".to_string()))?;

    let admin_secret = std::env::var("ADMIN_SECRET")
        .map_err(|_| EnclaveError::GenericError("ADMIN_SECRET not set".to_string()))?;
    
    let storage_path = format!("{}%2F{}", reference_id, reference_id);

    // call screenshotone for a screenshot then get blob_id
    let screenshotone_url = format!(
        "https://api.screenshotone.com/take?\
        access_key={access_key}&\
        url={}&\
        format=png&\
        block_ads=true&\
        block_cookie_banners=true&\
        block_banners_by_heuristics=true&\
        block_trackers=true&\
        block_chats=true&\
        delay=0&\
        timeout=60&\
        storage_acl=public-read&\
        store=true&\
        storage_bucket=perma-ws&\
        storage_path={storage_path}&\
        storage_endpoint=https%3A%2F%2Fstorage.nami.cloud&\
        storage_return_location=true&\
        storage_access_key_id={storage_access_key_id}&\
        storage_secret_access_key={storage_secret_access_key}&\
        capture_beyond_viewport=true&\
        response_type=json&\
        full_page=true&\
        full_page_scroll=true&\
        full_page_scroll_delay=500&\
        image_quality=80",
        urlencoding::encode(url)
    );
    
    info!("Calling ScreenshotOne API for: {}", url);
    let screenshotone_response = reqwest::get(&screenshotone_url)
        .await
        .map_err(|e| EnclaveError::GenericError(format!("Failed to call ScreenshotOne: {}", e)))?;
    
    let screenshotone_json: Value = screenshotone_response.json().await
        .map_err(|e| EnclaveError::GenericError(format!("Failed to parse ScreenshotOne response: {}", e)))?;
    
    info!("ScreenshotOne response: {}", serde_json::to_string_pretty(&screenshotone_json).unwrap_or_default());
    
    // Get the blob_id (ETag) from the screenshotone response URL
    let screenshot_blob_url = screenshotone_json["store"]["location"]
        .as_str()
        .ok_or_else(|| EnclaveError::GenericError("store.location not found in ScreenshotOne response".to_string()))?;
    let screenshot_blob_id = get_etag(screenshot_blob_url).await?;

    // Get byte size of screenshot_url
    let screenshot_url = screenshotone_json["screenshot_url"].as_str().unwrap_or("");
    // Use Range request to get only headers (1 byte) instead of downloading the whole file
    let client = reqwest::Client::new();
    let screenshot_response = client
        .get(screenshot_url)
        .header("Range", "bytes=0-0")
        .send()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("Failed to get screenshot: {}", e)))?;
    
    // Get content-length from headers to determine file size
    let screenshot_byte_size = screenshot_response
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| {
            // Parse "bytes 0-0/44941" to get 44941
            s.split('/').nth(1)?.parse::<usize>().ok()
        })
        .unwrap_or(0);
    
    // Get current timestamp in milliseconds for the response
    let current_timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("Failed to get current timestamp: {}", e)))?
        .as_millis() as u64;
    
    let signed_response = to_signed_response(
        &state.eph_kp,
        PermaResponse {
            url: url.to_string(),
            reference_id: reference_id.clone(),
            screenshot_blob_id,
            screenshot_byte_size,
        },
        current_timestamp_ms,
        IntentScope::ProcessData,
    );

    // save attestation - http://localhost:3001/api/attestation
    let attestation_url = format!("{}{}", frontend_url, "/api/attestation");
    let attestation_body = json!({
        "admin_secret": admin_secret,
        "reference_id": reference_id,
        "attestation": signed_response
    });

    info!("Saving attestation to: {}", attestation_url);

    let attestation_res = reqwest::Client::new()
        .post(attestation_url)
        .json(&attestation_body)
        .send()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("Failed to save attestation: {}", e)))?;

    if attestation_res.status() != reqwest::StatusCode::CREATED && attestation_res.status() != reqwest::StatusCode::OK {
         return Err(EnclaveError::GenericError(format!(
            "Failed to save attestation, status: {}",
            attestation_res.status()
        )));
    }
    
    Ok(Json(signed_response))
}
