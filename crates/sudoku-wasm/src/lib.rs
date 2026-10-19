use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sudoku_core::{
    board::{CellIndex, Digit},
    error::Error,
    puzzle::{DraftPuzzle, FinalizedPuzzle},
    record::PositionRecord,
    session::{Candidate, Command, CommandContext, Effect, Session},
    time::ActiveInterval,
};
use wasm_bindgen::prelude::*;

fn failure(code: &str, message: &str) -> JsValue {
    let error = js_sys::Error::new(message);
    js_sys::Reflect::set(&error, &"code".into(), &code.into()).expect("fresh error");
    error.into()
}

fn domain(error: Error) -> JsValue {
    let code = match error {
        Error::InvalidBoard => "InvalidBoard",
        Error::InvalidMove => "InvalidMove",
        Error::InvalidNotes => "InvalidNotes",
        Error::InvalidHistory => "InvalidHistory",
        Error::InvalidRecord(_) => "InvalidRecord",
        Error::InvalidTime => "InvalidTime",
        Error::InvalidInterval => "InvalidInterval",
        Error::Overflow => "Overflow",
        Error::Locked => "Locked",
        Error::StaleCandidate => "StaleCandidate",
        Error::TooFewClues => "TooFewClues",
        Error::NoEmptyCells => "NoEmptyCells",
        Error::NoSolution => "NoSolution",
        Error::Ambiguous => "Ambiguous",
        Error::InvalidLink => "InvalidLink",
        Error::ConflictingClues => "ConflictingClues",
        Error::InvalidName => "InvalidName",
    };
    failure(code, &error.to_string())
}

fn text(value: JsValue) -> Result<String, JsValue> {
    if !value.is_string() {
        return Err(failure("InvalidInput", "Expected a string."));
    }
    let string = js_sys::JsString::from(value);
    // Check code units before wasm-bindgen's UTF-8 conversion can replace them.
    let units = (0..string.length()).map(|i| string.char_code_at(i) as u16);
    if char::decode_utf16(units).any(|c| c.is_err()) {
        return Err(failure("InvalidUnicode", "Unpaired UTF-16 surrogate."));
    }
    Ok(String::from(string))
}

fn parse<T: DeserializeOwned>(value: JsValue) -> Result<T, JsValue> {
    serde_json::from_str(&text(value)?).map_err(|_| failure("InvalidRecord", "Invalid JSON DTO."))
}

fn json(value: &impl Serialize) -> Result<String, JsValue> {
    serde_json::to_string(value).map_err(|_| failure("InvalidRecord", "Cannot encode DTO."))
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum CommandDto {
    SetEntry {
        cell: CellIndex,
        value: Digit,
        check: bool,
    },
    EnterDigit {
        cell: CellIndex,
        value: Digit,
        check: bool,
    },
    ToggleNote {
        cell: CellIndex,
        value: Digit,
    },
    Erase {
        cell: CellIndex,
    },
    Undo {},
    Checkpoint {},
}
impl From<CommandDto> for Command {
    fn from(value: CommandDto) -> Self {
        match value {
            CommandDto::SetEntry { cell, value, check } => Self::SetEntry { cell, value, check },
            CommandDto::EnterDigit { cell, value, check } => {
                Self::EnterDigit { cell, value, check }
            }
            CommandDto::ToggleNote { cell, value } => Self::ToggleNote { cell, value },
            CommandDto::Erase { cell } => Self::Erase { cell },
            CommandDto::Undo {} => Self::Undo,
            CommandDto::Checkpoint {} => Self::Checkpoint,
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContextDto {
    at: u64,
    #[serde(default, deserialize_with = "present_interval")]
    focused_interval: Option<IntervalDto>,
    normalize_legacy_time: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IntervalDto {
    start: u64,
    end: u64,
}
fn present_interval<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Option<IntervalDto>, D::Error> {
    IntervalDto::deserialize(d).map(Some)
}

#[wasm_bindgen]
pub struct WasmSession {
    inner: Session,
}
#[wasm_bindgen]
pub struct WasmCandidate {
    inner: Option<Candidate>,
}

#[wasm_bindgen]
impl WasmSession {
    pub fn restore(puzzle: JsValue, attempt: JsValue) -> Result<WasmSession, JsValue> {
        let puzzle = FinalizedPuzzle::from_record(parse(puzzle)?).map_err(domain)?;
        Ok(Self {
            inner: Session::restore(&puzzle, parse(attempt)?).map_err(domain)?,
        })
    }
    pub fn create(puzzle: JsValue, id: JsValue, at: JsValue) -> Result<WasmSession, JsValue> {
        let puzzle = FinalizedPuzzle::from_record(parse(puzzle)?).map_err(domain)?;
        Ok(Self {
            inner: Session::new(text(id)?, &puzzle, parse(at)?).map_err(domain)?,
        })
    }
    pub fn prepare(&self, command: JsValue, context: JsValue) -> Result<WasmCandidate, JsValue> {
        let context: ContextDto = parse(context)?;
        let focused_interval = context
            .focused_interval
            .map(|v| ActiveInterval::new(v.start, v.end))
            .transpose()
            .map_err(domain)?;
        let candidate = self
            .inner
            .prepare(
                parse::<CommandDto>(command)?.into(),
                CommandContext {
                    at: context.at,
                    focused_interval,
                    normalize_legacy_time: context.normalize_legacy_time,
                },
            )
            .map_err(domain)?;
        Ok(WasmCandidate {
            inner: Some(candidate),
        })
    }
    pub fn accept(&mut self, candidate: &mut WasmCandidate) -> Result<(), JsValue> {
        self.inner
            .accept(
                candidate
                    .inner
                    .take()
                    .ok_or_else(|| domain(Error::StaleCandidate))?,
            )
            .map_err(domain)
    }
    pub fn current(&self) -> Result<String, JsValue> {
        json(self.inner.current())
    }
    pub fn position_at(&self, step: JsValue) -> Result<String, JsValue> {
        json(self.inner.position_at(parse(step)?).map_err(domain)?)
    }
    pub fn export_record(&self) -> Result<String, JsValue> {
        json(&self.inner.export_record())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Projection<'a> {
    header: serde_json::Value,
    appended_move: Option<&'a sudoku_core::record::MoveRecord>,
    current: &'a PositionRecord,
    effect: &'static str,
}
#[wasm_bindgen]
impl WasmCandidate {
    pub fn project(&self) -> Result<String, JsValue> {
        let c = self
            .inner
            .as_ref()
            .ok_or_else(|| domain(Error::StaleCandidate))?;
        let h = c.header();
        let mut header = serde_json::json!({"id": h.id, "puzzleId": h.puzzle_id, "startedAt": h.started_at,
            "completedAt": h.completed_at, "durationMs": h.duration_ms, "revision": h.revision});
        if let Some(v) = h.active_ms {
            header["activeMs"] = v.into();
        }
        if let Some(v) = h.last_active_end {
            header["lastActiveEnd"] = v.into();
        }
        json(&Projection {
            header,
            appended_move: c.appended_move(),
            current: c.current(),
            effect: match c.effect() {
                Effect::Unchanged => "unchanged",
                Effect::MetadataOnly => "metadataOnly",
                Effect::AppendedMove => "appendedMove",
            },
        })
    }
}

#[wasm_bindgen]
pub fn finalize_puzzle(draft: JsValue, at: JsValue) -> Result<String, JsValue> {
    let draft = DraftPuzzle::from_record(parse(draft)?).map_err(domain)?;
    json(draft.finalize(parse(at)?).map_err(domain)?.record())
}
#[wasm_bindgen]
pub fn encode_shared(board: JsValue) -> Result<String, JsValue> {
    sudoku_core::sharing::encode(&parse(board)?).map_err(domain)
}
#[wasm_bindgen]
pub fn decode_shared(encoded: JsValue, name: JsValue) -> Result<String, JsValue> {
    let name = if name.is_undefined() {
        None
    } else {
        Some(text(name)?)
    };
    let shared = sudoku_core::sharing::decode(&text(encoded)?, name.as_deref()).map_err(domain)?;
    json(
        &serde_json::json!({"clues": shared.clues, "name": shared.name, "shareKey": shared.share_key, "legacyShareKey": shared.legacy_share_key}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn command_dto_is_strict() {
        assert!(
            serde_json::from_str::<CommandDto>(
                r#"{"kind":"setEntry","cell":2,"value":4,"check":true}"#
            )
            .is_ok()
        );
        for bad in [
            r#"{"kind":"erase","cell":2.0}"#,
            r#"{"kind":"erase","cell":81}"#,
            r#"{"kind":"undo","extra":0}"#,
        ] {
            assert!(serde_json::from_str::<CommandDto>(bad).is_err());
        }
    }
}
