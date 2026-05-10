//! Arena match runner and promotion logic.

/// The aggregated result of an arena match between a candidate and the
/// reigning champion. Counted from the candidate's perspective.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ArenaResult {
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
}

impl ArenaResult {
    pub fn total_games(&self) -> u32 {
        self.wins + self.losses + self.draws
    }

    /// Win rate counting draws as half. Returns 0.0 for an empty match.
    pub fn win_rate(&self) -> f32 {
        let total = self.total_games();
        if total == 0 {
            return 0.0;
        }
        (self.wins as f32 + 0.5 * self.draws as f32) / total as f32
    }

    pub fn promotes(&self, threshold: f32) -> bool {
        self.total_games() > 0 && self.win_rate() >= threshold
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn win_rate_counts_draws_as_half() {
        let r = ArenaResult {
            wins: 50,
            losses: 30,
            draws: 20,
        };
        assert!((r.win_rate() - 0.60).abs() < 1e-5);
    }

    #[test]
    fn empty_match_does_not_promote() {
        let r = ArenaResult::default();
        assert!(!r.promotes(0.55));
    }

    #[test]
    fn promotion_at_threshold_exactly_succeeds() {
        let r = ArenaResult {
            wins: 55,
            losses: 45,
            draws: 0,
        };
        assert!(r.promotes(0.55));
    }

    #[test]
    fn promotion_below_threshold_fails() {
        let r = ArenaResult {
            wins: 54,
            losses: 46,
            draws: 0,
        };
        assert!(!r.promotes(0.55));
    }
}
