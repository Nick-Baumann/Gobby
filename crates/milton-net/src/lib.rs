//! Network architecture metadata and checkpoint headers.
//!
//! The full forward pass depends on `tch` (LibTorch) and lives in an
//! unreleased crate. This crate exposes the small, dep-free types that the
//! orchestrator and the Lichess bot need to inspect a checkpoint without
//! loading it.

pub const INPUT_PLANES: usize = 18;
pub const BOARD_SIZE: usize = 8;
pub const POLICY_SLOTS: usize = 4_672;
pub const RESIDUAL_BLOCKS: usize = 10;
pub const TRUNK_FILTERS: usize = 128;

/// Sidecar header stored next to every checkpoint blob on disk.
#[derive(Debug, Clone, PartialEq)]
pub struct CheckpointHeader {
    pub iter: u64,
    pub elo_estimate: i32,
    pub training_samples: u64,
}

impl CheckpointHeader {
    pub fn new(iter: u64, elo_estimate: i32, training_samples: u64) -> Self {
        Self {
            iter,
            elo_estimate,
            training_samples,
        }
    }

    /// A header is a "promotion candidate" once it has seen enough samples
    /// that running it through the arena is worth the wall time.
    pub fn is_promotion_candidate(&self) -> bool {
        self.training_samples >= 1_000
    }
}

/// Returns the total parameter count for the default Milton architecture.
pub fn parameter_count() -> u64 {
    let conv_params = 3 * 3 * TRUNK_FILTERS * TRUNK_FILTERS;
    let trunk = (RESIDUAL_BLOCKS * 2 * conv_params) as u64;
    let stem = (3 * 3 * INPUT_PLANES * TRUNK_FILTERS) as u64;
    let policy_head = (TRUNK_FILTERS * POLICY_SLOTS) as u64;
    let value_head = (TRUNK_FILTERS * 256 + 256) as u64;
    stem + trunk + policy_head + value_head
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parameter_count_is_in_the_expected_range() {
        let n = parameter_count();
        assert!(n > 9_000_000, "expected > 9M params, got {n}");
        assert!(n < 11_000_000, "expected < 11M params, got {n}");
    }

    #[test]
    fn promotion_candidate_only_after_enough_samples() {
        let h = CheckpointHeader::new(1, 1800, 1_500);
        assert!(h.is_promotion_candidate());
        let h2 = CheckpointHeader::new(2, 1800, 500);
        assert!(!h2.is_promotion_candidate());
    }
}
