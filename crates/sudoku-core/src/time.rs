use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
pub const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
/// Checks the shared bound for timestamps, durations and counters.
pub fn validate(value: u64) -> Result<()> {
    if value > MAX_SAFE_INTEGER {
        Err(Error::InvalidTime)
    } else {
        Ok(())
    }
}
pub(crate) fn add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b)
        .filter(|v| *v <= MAX_SAFE_INTEGER)
        .ok_or(Error::Overflow)
}
/// Validated nonnegative JS-safe integer milliseconds, with end >= start.
/// Serde rejects noninteger JSON spellings and invalid endpoints.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "IntervalDto")]
pub struct ActiveInterval {
    start: u64,
    end: u64,
}
#[derive(Deserialize)]
struct IntervalDto {
    start: u64,
    end: u64,
}
impl TryFrom<IntervalDto> for ActiveInterval {
    type Error = Error;
    fn try_from(v: IntervalDto) -> Result<Self> {
        Self::new(v.start, v.end)
    }
}
impl ActiveInterval {
    pub fn new(start: u64, end: u64) -> Result<Self> {
        validate(start)?;
        validate(end)?;
        if end < start {
            return Err(Error::InvalidInterval);
        }
        Ok(Self { start, end })
    }
    pub fn start(self) -> u64 {
        self.start
    }
    pub fn end(self) -> u64 {
        self.end
    }
}
/// Host-driven mutable clock. Backwards inputs never rewind its high-water mark.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct FocusClock {
    start: Option<u64>,
    highwater: u64,
}
impl FocusClock {
    /// Emits focused time since the last checkpoint; validation errors leave self unchanged.
    pub fn checkpoint(&mut self, now: u64) -> Result<Option<ActiveInterval>> {
        validate(now)?;
        self.highwater = self.highwater.max(now);
        let Some(start) = self.start else {
            return Ok(None);
        };
        let end = self.highwater.max(start);
        self.start = Some(end);
        Ok((end > start).then_some(ActiveInterval { start, end }))
    }
    /// Checkpoints the previous focus state, then starts or ends a focused slice.
    pub fn set_focused(&mut self, focused: bool, now: u64) -> Result<Option<ActiveInterval>> {
        let interval = self.checkpoint(now)?;
        self.start = focused.then_some(self.highwater);
        Ok(interval)
    }
}
/// Floors seconds, clamps negatives to zero, and does not wrap hours at 24.
pub fn duration_label(ms: i64) -> String {
    let s = ms.max(0) / 1000;
    format!("{:02}:{:02}:{:02}", s / 3600, s % 3600 / 60, s % 60)
}
