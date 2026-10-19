# Changelog

## 2.0.0 — Release candidate

Architecture Freeze v2.0 was accepted at
`e99d36e4345e14486ec40448ad8df872d3a44a57` and merged through PR #6 at
`cc7affbcc01decd1fda9ec4b0d7f9f55ba3fda87`.

- Universal numerical Kernel: stats/cooldowns, modifier resolution, Damage B0/B1,
  Hit/Critical/Mitigation, resource calculation and detached frozen snapshots.
- Preserved Legacy Gameplay Runtime: Skills, Combat, Mechanics, Effects and
  Triggers retain their validation, policy, state and event authority.
- Independently verified Text RPG, Võ Lâm 2.5D and ARPG numerical consumers.
- Architecture, declarations, delegation, installed-package and preservation
  verification enforce accepted boundaries.
- Release finalization changes version metadata, current documentation and
  private verification tooling only. No new source calculations, gameplay
  behavior, public contracts or package exports.

Kernel remains a separate public entrypoint; the Legacy root does not re-export
Kernel. All eleven entrypoints and 27 historical forwarders remain compatible.
`private: true` is retained; npm publication is not authorized. GitHub Release and
tag await separate final release approval. No licensing changes are included.

See [release notes and checklist](docs/releases/v2.0.0.md) and
[transition review](docs/releases/v2.0.0-transition-review.md). Earlier milestones
and their original approval chronology remain in `docs/v2/` and Git history.
