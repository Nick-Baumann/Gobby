//! Self-play game record types.

/// A single training sample produced during self-play.
#[derive(Debug, Clone, PartialEq)]
pub struct TrainingSample {
    pub policy_target: Vec<f32>,
    pub value_target: f32,
    pub ply: u32,
}

impl TrainingSample {
    pub fn new(policy_target: Vec<f32>, ply: u32) -> Self {
        Self {
            policy_target,
            value_target: 0.0,
            ply,
        }
    }
}

/// The outcome of a self-play game from white's perspective.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    WhiteWin,
    BlackWin,
    Draw,
}

impl Outcome {
    pub fn as_value(self) -> f32 {
        match self {
            Outcome::WhiteWin => 1.0,
            Outcome::BlackWin => -1.0,
            Outcome::Draw => 0.0,
        }
    }
}

/// Label every sample in the game with the final outcome, flipping the sign
/// for plies played by the side that did not win.
pub fn label_samples(samples: &mut [TrainingSample], outcome: Outcome) {
    let final_value = outcome.as_value();
    for (i, sample) in samples.iter_mut().enumerate() {
        sample.value_target = if i % 2 == 0 { final_value } else { -final_value };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labeling_flips_for_alternating_plies() {
        let mut s = vec![
            TrainingSample::new(vec![], 0),
            TrainingSample::new(vec![], 1),
            TrainingSample::new(vec![], 2),
        ];
        label_samples(&mut s, Outcome::WhiteWin);
        assert_eq!(s[0].value_target, 1.0);
        assert_eq!(s[1].value_target, -1.0);
        assert_eq!(s[2].value_target, 1.0);
    }

    #[test]
    fn draw_outcome_zeros_all_values() {
        let mut s = vec![TrainingSample::new(vec![], 0), TrainingSample::new(vec![], 1)];
        label_samples(&mut s, Outcome::Draw);
        assert_eq!(s[0].value_target, 0.0);
        assert_eq!(s[1].value_target, 0.0);
    }
}
