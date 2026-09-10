use crate::{
    board::Board,
    error::{Error, Result},
};
use base64::{
    Engine,
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use num_bigint::BigUint;
const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/// Exact compact v1 encoding; requires conflict freedom, not uniqueness.
pub fn encode(board: &Board) -> Result<String> {
    if !board.conflict_free() {
        return Err(Error::ConflictingClues);
    }
    let value = BigUint::parse_bytes(board.digits().as_bytes(), 10).ok_or(Error::InvalidBoard)?;
    Ok(format!(
        "1.{}",
        value
            .to_radix_be(64)
            .iter()
            .map(|v| char::from(ALPHABET[*v as usize]))
            .collect::<String>()
    ))
}
/// Released 108-character ASCII-digit Base64 encoding.
pub fn legacy_encode(board: &Board) -> Result<String> {
    if !board.conflict_free() {
        return Err(Error::ConflictingClues);
    }
    Ok(STANDARD.encode(board.digits()))
}
/// JS whitespace normalization and 1–80 UTF-16 code units; no Unicode normalization.
pub fn normalize_name(raw: &str) -> Result<String> {
    let name = raw
        .split(js_whitespace)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if name.is_empty() || name.encode_utf16().count() > 80 {
        Err(Error::InvalidName)
    } else {
        Ok(name)
    }
}
fn js_whitespace(c: char) -> bool {
    matches!(c,'\u{0009}'..='\u{000d}'|'\u{0020}'|'\u{00a0}'|'\u{1680}'|'\u{2000}'..='\u{200a}'|'\u{2028}'|'\u{2029}'|'\u{202f}'|'\u{205f}'|'\u{3000}'|'\u{feff}')
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SharedPuzzle {
    pub clues: Board,
    pub name: String,
    pub share_key: String,
    pub legacy_share_key: String,
}
/// Decodes either released wire format and returns both historical identity keys.
pub fn decode(encoded: &str, raw_name: Option<&str>) -> Result<SharedPuzzle> {
    let digits = if let Some(packed) = encoded.strip_prefix("1.") {
        if packed.is_empty() || packed.len() > 45 {
            return Err(Error::InvalidLink);
        }
        let values = packed
            .bytes()
            .map(|c| {
                ALPHABET
                    .iter()
                    .position(|v| *v == c)
                    .map(|n| n as u8)
                    .ok_or(Error::InvalidLink)
            })
            .collect::<Result<Vec<_>>>()?;
        let value = BigUint::from_radix_be(&values, 64)
            .ok_or(Error::InvalidLink)?
            .to_str_radix(10);
        if value.len() > 81 {
            return Err(Error::InvalidLink);
        }
        format!("{value:0>81}")
    } else {
        if encoded.len() != 108 || !encoded.bytes().all(|c| ALPHABET.contains(&c)) {
            return Err(Error::InvalidLink);
        }
        String::from_utf8(
            URL_SAFE_NO_PAD
                .decode(encoded)
                .map_err(|_| Error::InvalidLink)?,
        )
        .map_err(|_| Error::InvalidLink)?
    };
    let clues = Board::parse(&digits).map_err(|_| Error::InvalidLink)?;
    if !clues.conflict_free() {
        return Err(Error::ConflictingClues);
    }
    let name = normalize_name(raw_name.unwrap_or("Shared puzzle"))?;
    let share_key = serde_json::to_string(&[&digits, &name]).map_err(|_| Error::InvalidLink)?;
    let legacy = legacy_encode(&clues)?;
    let legacy_share_key =
        serde_json::to_string(&[&legacy, &name]).map_err(|_| Error::InvalidLink)?;
    Ok(SharedPuzzle {
        clues,
        name,
        share_key,
        legacy_share_key,
    })
}
