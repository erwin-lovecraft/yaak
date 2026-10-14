//! Visual workflows ("flows"): a graph of nodes that call requests, extract data and branch.
//!
//! The crate is deliberately free of database and Tauri dependencies. Sending a request is
//! delegated to a [`FlowExecutor`], and template rendering reuses `yaak-templates`, so the same
//! engine can run from the desktop app, the CLI or tests.

mod engine;
mod error;
mod model;

pub use engine::{FlowExecutor, FlowRunResult, HttpOutcome, NodeRun, NodeStatus, run_flow};
pub use error::{Error, Result};
pub use model::{Flow, FlowNode, NodeKind, NodePosition};
