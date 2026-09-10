use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};

/// Validated zero-based row-major index, 0–80. Serde accepts only integers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "u8", into = "u8")]
pub struct CellIndex(u8);
impl CellIndex {
    pub fn new(value: usize) -> Result<Self> {
        if value < 81 {
            Ok(Self(value as u8))
        } else {
            Err(Error::InvalidMove)
        }
    }
    pub fn get(self) -> usize {
        self.0 as usize
    }
}
impl TryFrom<u8> for CellIndex {
    type Error = Error;
    fn try_from(v: u8) -> Result<Self> {
        Self::new(v as usize)
    }
}
impl From<CellIndex> for u8 {
    fn from(v: CellIndex) -> Self {
        v.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "u8", into = "u8")]
/// Validated integer 0–9; zero means an empty entry, never a note.
pub struct Digit(u8);
impl Digit {
    pub const EMPTY: Self = Self(0);
    pub fn new(value: u8) -> Result<Self> {
        if value <= 9 {
            Ok(Self(value))
        } else {
            Err(Error::InvalidMove)
        }
    }
    pub fn get(self) -> u8 {
        self.0
    }
}
impl TryFrom<u8> for Digit {
    type Error = Error;
    fn try_from(v: u8) -> Result<Self> {
        Self::new(v)
    }
}
impl From<Digit> for u8 {
    fn from(v: Digit) -> Self {
        v.0
    }
}

/// Exactly 81 integer digits 0–9. Serde validates structure, not conflicts.
#[must_use = "board edits return a new board"]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "Vec<u8>", into = "Vec<u8>")]
pub struct Board([u8; 81]);
impl Default for Board {
    fn default() -> Self {
        Self([0; 81])
    }
}
impl TryFrom<Vec<u8>> for Board {
    type Error = Error;
    fn try_from(v: Vec<u8>) -> Result<Self> {
        if v.iter().any(|&d| d > 9) {
            return Err(Error::InvalidBoard);
        }
        Ok(Self(v.try_into().map_err(|_| Error::InvalidBoard)?))
    }
}
impl From<Board> for Vec<u8> {
    fn from(v: Board) -> Self {
        v.0.to_vec()
    }
}
impl Board {
    pub fn parse(digits: &str) -> Result<Self> {
        if digits.len() != 81 || !digits.bytes().all(|v| v.is_ascii_digit()) {
            return Err(Error::InvalidBoard);
        }
        Self::try_from(digits.bytes().map(|v| v - b'0').collect::<Vec<_>>())
    }
    pub fn digits(&self) -> String {
        self.0.iter().map(|v| char::from(b'0' + v)).collect()
    }
    pub fn cells(&self) -> &[u8; 81] {
        &self.0
    }
    pub fn get(&self, cell: CellIndex) -> Digit {
        Digit(self.0[cell.get()])
    }
    /// Returns a structural edit; may introduce a conflict.
    pub fn with(&self, cell: CellIndex, value: Digit) -> Self {
        let mut b = self.clone();
        b.0[cell.get()] = value.0;
        b
    }
    pub fn clue_count(&self) -> usize {
        self.0.iter().filter(|&&v| v != 0).count()
    }
    /// Checks peer duplicates, independently of solvability or uniqueness.
    pub fn conflict_free(&self) -> bool {
        (0..81).all(|i| {
            self.0[i] == 0 || (0..i).all(|j| self.0[i] != self.0[j] || !peer_indices(i, j))
        })
    }
    pub fn complete(&self) -> bool {
        self.clue_count() == 81 && self.conflict_free()
    }
    /// Peer-legal digits for an empty cell; filled cells have no candidates.
    pub fn candidates(&self, cell: CellIndex) -> NoteSet {
        if self.get(cell) != Digit::EMPTY {
            return NoteSet::default();
        }
        let mut bits = 511;
        for j in 0..81 {
            let d = self.0[j];
            if d != 0 && peer_indices(cell.get(), j) {
                bits &= !(1 << (d - 1));
            }
        }
        NoteSet(bits)
    }
}
/// True for a shared row, column or box, including the same cell.
pub fn peers(a: CellIndex, b: CellIndex) -> bool {
    peer_indices(a.get(), b.get())
}
fn peer_indices(a: usize, b: usize) -> bool {
    a / 9 == b / 9 || a % 9 == b % 9 || (a / 27 == b / 27 && a % 9 / 3 == b % 9 / 3)
}

/// Nine-bit set. Serde requires sorted distinct integer digits 1–9.
#[must_use = "note operations return a new set"]
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "Vec<u8>", into = "Vec<u8>")]
pub struct NoteSet(u16);
impl NoteSet {
    /// Bit zero represents digit 1; rejects bits above bit eight.
    pub fn from_bits(bits: u16) -> Result<Self> {
        if bits & !511 != 0 {
            Err(Error::InvalidNotes)
        } else {
            Ok(Self(bits))
        }
    }
    pub fn bits(self) -> u16 {
        self.0
    }
    /// Toggles a nonzero digit; EMPTY is invalid at this set-level boundary.
    pub fn toggle(self, digit: Digit) -> Result<Self> {
        if digit.0 == 0 {
            return Err(Error::InvalidNotes);
        }
        Ok(Self(self.0 ^ (1 << (digit.0 - 1))))
    }
    pub fn digits(self) -> impl Iterator<Item = Digit> {
        (1..=9)
            .filter(move |d| self.0 & (1 << (d - 1)) != 0)
            .map(Digit)
    }
}
impl TryFrom<Vec<u8>> for NoteSet {
    type Error = Error;
    fn try_from(v: Vec<u8>) -> Result<Self> {
        let mut bits = 0;
        let mut last = 0;
        for d in v {
            if d == 0 || d > 9 || d <= last {
                return Err(Error::InvalidNotes);
            }
            bits |= 1 << (d - 1);
            last = d;
        }
        Ok(Self(bits))
    }
}
impl From<NoteSet> for Vec<u8> {
    fn from(v: NoteSet) -> Self {
        v.digits().map(Digit::get).collect()
    }
}
