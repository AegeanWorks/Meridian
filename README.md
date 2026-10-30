# Meridian

[![Built with AIKit](https://img.shields.io/badge/built%20with-AIKit-6f42c1)](https://github.com/AegeanWorks/AIKit)

A zero-dependency time zone meeting planner that runs entirely in the browser: add people and cities, compare every local hour side by side, find the overlap that works for everyone, then share it as a link or a calendar file.

## ⚡ 30-Second Cold-Start Quick Reference

- **Runtime Prerequisites**: <FILL: each runtime this project needs and its minimum version>
- **Canonical Regression Shield Gate**:
  ```bash
  npm test
  ```

### 🛠️ AIKit Commands (run from the AIKit folder)
| Role | Command |
|---|---|
| Status, task and gates | `python aikit.py status meridian` |
| Phase 4: every gate | `python aikit.py check meridian` |
| Repair memory and map, then check | `python aikit.py fix meridian` |
| Resume an interrupted task | `python aikit.py resume meridian` |

## 📦 What's Inside

```text
meridian/
├── .gitignore                <- transient AIKit state excluded
├── LICENSE                   <- Aegean License 1.1 (AL-1.1): free personal use
├── COMMERCIAL.md             <- Commercial licensing terms
├── LICENSES/                 <- REUSE license texts
├── REUSE.toml                <- Machine-readable SPDX metadata
├── README.md
└── .aikit/                   <- this project's memory: record, ledger, decisions
```

## 📜 License

Free for personal use under the Aegean License 1.1 (AL-1.1); see [LICENSE](LICENSE). Any commercial use needs the Aegean Commercial License 1.0 (ACL-1.0); see [COMMERCIAL.md](COMMERCIAL.md).
