# Network Architecture

Residual CNN with policy and value heads.

| Component | Spec |
|-----------|------|
| Input | 18 x 8 x 8 |
| Trunk | 10 residual blocks, 128 filters |
| Policy head | softmax over 4,672 move slots |
| Value head | tanh, scalar in [-1, 1] |
| Parameters | 9,584,193 |
