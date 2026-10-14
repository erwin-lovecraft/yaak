use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "gen_flows.ts")]
pub struct Flow {
    pub id: String,
    pub name: String,
    /// Node where execution begins. Falls back to the first node when unset.
    pub start_node_id: Option<String>,
    pub nodes: Vec<FlowNode>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "gen_flows.ts")]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "gen_flows.ts")]
pub struct FlowNode {
    pub id: String,
    /// Display title shown on the canvas.
    pub title: String,
    /// Canvas position, for the React Flow editor.
    #[serde(default)]
    pub position: NodePosition,
    pub operation: NodeKind,
    /// Next node on success.
    pub success: Option<String>,
    /// Next node on failure.
    pub fail: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export, export_to = "gen_flows.ts")]
pub enum NodeKind {
    /// Send the collection request with this id. Succeeds on a 2xx/3xx response.
    HttpRequest { request_id: String },
    /// Pull a value out of the previous node's output. Fails when there is no output to read.
    Extract {
        /// Filter handed to the plugin filters (JSONPath for JSON, XPath for XML), e.g `$.data.id`.
        /// May contain templates. Empty keeps the input whole.
        path: String,
        /// Variable the extracted value is also stored in. Optional.
        output: String,
    },
    /// Trigger that runs the flow once every `interval_secs` seconds. It passes straight through
    /// when the flow runs; the host does the scheduling (see [`Flow::timer_interval_secs`]).
    Timer { interval_secs: u32 },
    /// Wait `millis` milliseconds, then continue. The previous node's output passes through, so
    /// a node after the delay still reads what the node before it produced.
    Delay { millis: u32 },
}

impl Flow {
    /// The interval of the flow's timer, if it has one, so a host knows to run it repeatedly.
    pub fn timer_interval_secs(&self) -> Option<u32> {
        self.nodes.iter().find_map(|n| match n.operation {
            NodeKind::Timer { interval_secs } => Some(interval_secs),
            _ => None,
        })
    }

    pub fn node(&self, id: &str) -> Option<&FlowNode> {
        self.nodes.iter().find(|n| n.id == id)
    }
}
