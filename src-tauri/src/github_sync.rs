//! Preference sync via GitHub Device Flow + a secret Gist.
//!
//! The OAuth token is stored in the macOS Keychain and never leaves the Rust
//! side — the frontend only ever passes the gist id and the JSON payload.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

// Public OAuth App client id (Device Flow enabled). Safe to embed (no secret).
// Register at https://github.com/settings/developers and paste the Client ID here.
const GITHUB_CLIENT_ID: &str = "Ov23liUGPKWM1NlflyB3";

const SCOPE: &str = "gist";
// Only referenced by the Keychain-backed store (release builds).
#[cfg_attr(debug_assertions, allow(dead_code))]
const KEYCHAIN_SERVICE: &str = "net.lupion.focalplanner";
const KEYCHAIN_ACCOUNT: &str = "github-token";
const GIST_FILE: &str = "focalplanner-sync.json";
const USER_AGENT: &str = "FocalPlanner";

/// Set when the user cancels an in-progress device-flow poll.
static CANCEL_POLL: AtomicBool = AtomicBool::new(false);

type R<T> = Result<T, String>;

// ── Secret storage ──────────────────────────────────────────────────────────
// Release builds keep secrets in the macOS Keychain. Debug builds use a plaintext
// file under Application Support instead: each unsigned rebuild looks like a new
// app to the Keychain, so it would otherwise re-prompt for access on every run.
// The optional sync passphrase still works (it encrypts the gist contents); in
// development it is simply not itself stored encrypted.
#[cfg(not(debug_assertions))]
mod secret_store {
    use super::{KEYCHAIN_SERVICE, R};

    fn entry(account: &str) -> R<keyring::Entry> {
        keyring::Entry::new(KEYCHAIN_SERVICE, account).map_err(|e| e.to_string())
    }
    pub fn get(account: &str) -> R<Option<String>> {
        match entry(account)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn set(account: &str, value: &str) -> R<()> {
        entry(account)?.set_password(value).map_err(|e| e.to_string())
    }
    pub fn delete(account: &str) -> R<()> {
        match entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(debug_assertions)]
mod secret_store {
    use super::R;
    use std::path::PathBuf;

    fn dir() -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join("Library/Application Support/net.lupion.focalplanner-dev")
    }
    fn path(account: &str) -> PathBuf {
        dir().join(format!("{account}.secret"))
    }
    pub fn get(account: &str) -> R<Option<String>> {
        match std::fs::read_to_string(path(account)) {
            Ok(v) => Ok(Some(v)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn set(account: &str, value: &str) -> R<()> {
        std::fs::create_dir_all(dir()).map_err(|e| e.to_string())?;
        std::fs::write(path(account), value).map_err(|e| e.to_string())
    }
    pub fn delete(account: &str) -> R<()> {
        match std::fs::remove_file(path(account)) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

fn read_token() -> R<Option<String>> {
    secret_store::get(KEYCHAIN_ACCOUNT)
}

fn require_token() -> R<String> {
    read_token()?.ok_or_else(|| "Not connected to GitHub".to_string())
}

// ── Optional passphrase (E2E encryption of the synced blob) ─────────────────

const KEYCHAIN_PASSPHRASE: &str = "sync-passphrase";

fn read_passphrase() -> R<Option<String>> {
    secret_store::get(KEYCHAIN_PASSPHRASE)
}

pub fn has_passphrase() -> R<bool> {
    Ok(read_passphrase()?.is_some())
}

pub fn set_passphrase(passphrase: String) -> R<()> {
    if passphrase.is_empty() {
        return Err("Passphrase cannot be empty".to_string());
    }
    secret_store::set(KEYCHAIN_PASSPHRASE, &passphrase)
}

pub fn clear_passphrase() -> R<()> {
    secret_store::delete(KEYCHAIN_PASSPHRASE)
}

fn b64(bytes: &[u8]) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine};
    STANDARD.encode(bytes)
}

fn unb64(v: Option<&Value>) -> R<Vec<u8>> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let s = v.and_then(Value::as_str).ok_or("malformed encrypted blob")?;
    STANDARD.decode(s).map_err(|e| e.to_string())
}

fn derive_key(passphrase: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<sha2::Sha256>(passphrase.as_bytes(), salt, 200_000, &mut key);
    key
}

/// Encrypt `plaintext` into a self-describing JSON blob (AES-256-GCM, PBKDF2 key).
fn encrypt(plaintext: &str, passphrase: &str) -> R<String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    use rand::RngCore;

    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut nonce);

    let key = derive_key(passphrase, &salt);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext.as_bytes())
        .map_err(|_| "encryption failed".to_string())?;

    Ok(serde_json::json!({
        "enc": "agcm1",
        "salt": b64(&salt),
        "nonce": b64(&nonce),
        "ct": b64(&ct),
    })
    .to_string())
}

/// Return decrypted plaintext if `content` is an encrypted blob, else return it unchanged.
fn maybe_decrypt(content: String) -> R<String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};

    let v: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return Ok(content), // not JSON → plaintext
    };
    if v.get("enc").and_then(Value::as_str) != Some("agcm1") {
        return Ok(content); // plain sync payload (no "enc" marker)
    }

    let passphrase = read_passphrase()?
        .ok_or("This synced data is encrypted. Set the matching passphrase to sync.")?;
    let salt = unb64(v.get("salt"))?;
    let nonce = unb64(v.get("nonce"))?;
    let ct = unb64(v.get("ct"))?;

    let key = derive_key(&passphrase, &salt);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let pt = cipher
        .decrypt(Nonce::from_slice(&nonce), ct.as_ref())
        .map_err(|_| "Wrong passphrase or corrupted data".to_string())?;
    String::from_utf8(pt).map_err(|e| e.to_string())
}

// ── Serializable results ───────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStart {
    pub user_code: String,
    pub verification_uri: String,
    pub device_code: String,
    pub interval: u64,
    pub expires_in: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub connected: bool,
    pub login: Option<String>,
}

// ── Device flow ─────────────────────────────────────────────────────────────

pub fn device_start() -> R<DeviceStart> {
    let resp: Value = ureq::post("https://github.com/login/device/code")
        .set("Accept", "application/json")
        .set("User-Agent", USER_AGENT)
        .send_form(&[("client_id", GITHUB_CLIENT_ID), ("scope", SCOPE)])
        .map_err(|e| e.to_string())?
        .into_json()
        .map_err(|e| e.to_string())?;

    let get = |k: &str| resp.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
    Ok(DeviceStart {
        user_code: get("user_code"),
        verification_uri: get("verification_uri"),
        device_code: get("device_code"),
        interval: resp.get("interval").and_then(Value::as_u64).unwrap_or(5),
        expires_in: resp.get("expires_in").and_then(Value::as_u64).unwrap_or(900),
    })
}

pub fn device_cancel() {
    CANCEL_POLL.store(true, Ordering::SeqCst);
}

pub fn device_poll(device_code: String, interval: u64) -> R<Account> {
    CANCEL_POLL.store(false, Ordering::SeqCst);
    let mut wait = interval.max(1);

    loop {
        // Sleep `wait` seconds in 500ms slices so cancellation is responsive.
        let slices = wait * 2;
        let mut slept = 0;
        while slept < slices {
            if CANCEL_POLL.load(Ordering::SeqCst) {
                return Err("cancelled".to_string());
            }
            std::thread::sleep(Duration::from_millis(500));
            slept += 1;
        }

        let resp: Value = ureq::post("https://github.com/login/oauth/access_token")
            .set("Accept", "application/json")
            .set("User-Agent", USER_AGENT)
            .send_form(&[
                ("client_id", GITHUB_CLIENT_ID),
                ("device_code", &device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .map_err(|e| e.to_string())?
            .into_json()
            .map_err(|e| e.to_string())?;

        if let Some(token) = resp.get("access_token").and_then(Value::as_str) {
            secret_store::set(KEYCHAIN_ACCOUNT, token)?;
            let login = fetch_login(token).ok();
            return Ok(Account { connected: true, login });
        }

        match resp.get("error").and_then(Value::as_str) {
            Some("authorization_pending") => {}
            Some("slow_down") => wait += 5,
            Some("expired_token") => return Err("Code expired — try again".to_string()),
            Some("access_denied") => return Err("Authorization denied".to_string()),
            Some(other) => return Err(other.to_string()),
            None => return Err("Unexpected response from GitHub".to_string()),
        }
    }
}

fn fetch_login(token: &str) -> R<String> {
    let resp: Value = ureq::get("https://api.github.com/user")
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", USER_AGENT)
        .call()
        .map_err(|e| e.to_string())?
        .into_json()
        .map_err(|e| e.to_string())?;
    Ok(resp
        .get("login")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string())
}

pub fn account() -> R<Account> {
    match read_token()? {
        Some(token) => Ok(Account {
            connected: true,
            login: fetch_login(&token).ok(),
        }),
        None => Ok(Account { connected: false, login: None }),
    }
}

pub fn disconnect() -> R<()> {
    secret_store::delete(KEYCHAIN_ACCOUNT)
}

// ── Gist read/write ──────────────────────────────────────────────────────────

/// Find an existing sync gist (by our filename) among the user's gists.
pub fn gist_find() -> R<Option<String>> {
    let token = require_token()?;
    let resp: Value = ureq::get("https://api.github.com/gists?per_page=100")
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", USER_AGENT)
        .call()
        .map_err(|e| e.to_string())?
        .into_json()
        .map_err(|e| e.to_string())?;

    if let Some(arr) = resp.as_array() {
        for g in arr {
            if g.get("files").and_then(|f| f.get(GIST_FILE)).is_some() {
                if let Some(id) = g.get("id").and_then(Value::as_str) {
                    return Ok(Some(id.to_string()));
                }
            }
        }
    }
    Ok(None)
}

pub fn gist_pull(gist_id: String) -> R<Option<String>> {
    let token = require_token()?;
    let resp: Value = ureq::get(&format!("https://api.github.com/gists/{gist_id}"))
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", USER_AGENT)
        .call()
        .map_err(|e| e.to_string())?
        .into_json()
        .map_err(|e| e.to_string())?;

    let content = resp
        .get("files")
        .and_then(|f| f.get(GIST_FILE))
        .and_then(|f| f.get("content"))
        .and_then(Value::as_str)
        .map(str::to_string);

    match content {
        Some(c) => Ok(Some(maybe_decrypt(c)?)),
        None => Ok(None),
    }
}

pub fn gist_push(payload: String, gist_id: Option<String>) -> R<String> {
    let token = require_token()?;
    // Encrypt the blob when a passphrase is configured; otherwise store plaintext.
    let content = match read_passphrase()? {
        Some(passphrase) => encrypt(&payload, &passphrase)?,
        None => payload,
    };
    let body = serde_json::json!({
        "description": "FocalPlanner preferences (synced)",
        "files": { GIST_FILE: { "content": content } },
    });

    let req = match &gist_id {
        Some(id) => ureq::patch(&format!("https://api.github.com/gists/{id}")),
        None => ureq::post("https://api.github.com/gists"),
    };
    // For creation, mark it secret (public:false).
    let body = if gist_id.is_none() {
        let mut b = body;
        b["public"] = Value::Bool(false);
        b
    } else {
        body
    };

    let resp: Value = req
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", USER_AGENT)
        .send_json(body)
        .map_err(|e| e.to_string())?
        .into_json()
        .map_err(|e| e.to_string())?;

    resp.get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "Gist response missing id".to_string())
}
