//! Monte Carlo Tree Search primitives.

/// A single node in the MCTS tree.
#[derive(Debug, Clone, Default)]
pub struct Node {
    pub visits: u32,
    pub value_sum: f32,
    pub prior: f32,
}

impl Node {
    pub fn new(prior: f32) -> Self {
        Self {
            visits: 0,
            value_sum: 0.0,
            prior,
        }
    }

    pub fn mean_value(&self) -> f32 {
        if self.visits == 0 {
            0.0
        } else {
            self.value_sum / self.visits as f32
        }
    }
}

/// PUCT score for a child node given its parent's visit count.
///
/// `Q(s,a) + c_puct * P(s,a) * sqrt(N(s)) / (1 + N(s,a))`
#[inline]
pub fn puct_score(child: &Node, parent_visits: u32, c_puct: f32) -> f32 {
    let q = child.mean_value();
    let parent_sqrt = (parent_visits as f32).sqrt();
    let u = c_puct * child.prior * parent_sqrt / (1.0 + child.visits as f32);
    q + u
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unvisited_child_scores_by_prior_only() {
        let child = Node::new(0.5);
        let s = puct_score(&child, 100, 1.5);
        let expected = 1.5 * 0.5 * 10.0;
        assert!((s - expected).abs() < 1e-5);
    }

    #[test]
    fn mean_value_handles_zero_visits() {
        let child = Node::new(0.1);
        assert_eq!(child.mean_value(), 0.0);
    }

    #[test]
    fn mean_value_handles_negative_values() {
        let child = Node {
            visits: 2,
            value_sum: -1.0,
            prior: 0.0,
        };
        assert_eq!(child.mean_value(), -0.5);
    }
}
