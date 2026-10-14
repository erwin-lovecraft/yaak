use crate::model::{Flow, FlowNode, NodeKind};
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::future::Future;
use ts_rs::TS;
use yaak_templates::{RenderOptions, TemplateCallback, parse_and_render};

const MAX_STEPS: usize = 1000; // Limit step
/// A single delay node waits at most this long (10 minutes).
const MAX_DELAY_MS: u32 = 600_000;

/// What the engine needs from the host app.
///
/// Methods return `impl Future` rather than boxing, so the futures keep whatever `Send`-ness the
/// implementation has.
pub trait FlowExecutor {
    /// Send the request with `request_id`, rendering it with `vars` on top of the active
    /// environment. Transport failures are `Err`; HTTP error statuses are still `Ok`.
    fn send_request(
        &self,
        request_id: &str,
        vars: &HashMap<String, String>,
    ) -> impl Future<Output = Result<HttpOutcome>>;

    /// Apply a JSONPath/XPath-style `filter` to `content` and return the first match as text.
    /// `content_type` says how to read the content (`application/json`, `application/xml`, ...).
    fn filter(
        &self,
        filter: &str,
        content: &str,
        content_type: &str,
    ) -> impl Future<Output = Result<String>>;
}

#[derive(Debug, Clone)]
pub struct HttpOutcome {
    pub status: u16,
    pub body: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "gen_flows.ts")]
pub enum NodeStatus {
    Success,
    Fail,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "gen_flows.ts")]
pub struct NodeRun {
    pub node_id: String,
    pub status: NodeStatus,
    /// Value produced by the node (response body, extracted value, or condition result).
    pub output: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "gen_flows.ts")]
pub struct FlowRunResult {
    pub runs: Vec<NodeRun>,
    pub variables: HashMap<String, String>,
}

/// Run `flow` from its start node, following `success`/`fail` edges until a node has no next.
///
/// `vars` seeds the variables (e.g. the active environment). A node reads the output of the node
/// that ran just before it. Template errors, failing requests and missing input route to `fail`
/// instead of aborting.
pub async fn run_flow<T: TemplateCallback, E: FlowExecutor>(
    flow: &Flow,
    vars: HashMap<String, String>,
    cb: &T,
    executor: &E,
) -> Result<FlowRunResult> {
    let mut vars = vars;
    let mut runs = Vec::new();

    let mut current = match &flow.start_node_id {
        Some(id) => Some(flow.node(id).ok_or_else(|| Error::NodeNotFound(id.clone()))?),
        None => flow.nodes.first(),
    }
    .ok_or(Error::NoStartNode)?;

    loop {
        if runs.len() >= MAX_STEPS {
            return Err(Error::MaxStepsExceeded(MAX_STEPS));
        }

        let run = match run_node(
            current,
            runs.last().map(|r: &NodeRun| r.output.as_str()),
            &mut vars,
            cb,
            executor,
        )
        .await
        {
            Ok((ok, output)) => NodeRun {
                node_id: current.id.clone(),
                status: if ok { NodeStatus::Success } else { NodeStatus::Fail },
                output,
                error: None,
            },
            Err(e) => NodeRun {
                node_id: current.id.clone(),
                status: NodeStatus::Fail,
                output: String::new(),
                error: Some(e.to_string()),
            },
        };

        let next = match run.status {
            NodeStatus::Success => current.success.as_deref(),
            NodeStatus::Fail => current.fail.as_deref(),
        };
        runs.push(run);

        match next {
            Some(id) => current = flow.node(id).ok_or_else(|| Error::NodeNotFound(id.into()))?,
            None => break,
        }
    }

    Ok(FlowRunResult { runs, variables: vars })
}

/// Returns `(succeeded, output)`. `previous_output` is `None` for the first node.
async fn run_node<T: TemplateCallback, E: FlowExecutor>(
    node: &FlowNode,
    previous_output: Option<&str>,
    vars: &mut HashMap<String, String>,
    cb: &T,
    executor: &E,
) -> Result<(bool, String)> {
    let opt = RenderOptions::throw();
    match &node.operation {
        NodeKind::HttpRequest { request_id } => {
            let r = executor.send_request(request_id, vars).await?;
            Ok(((200..400).contains(&r.status), r.body))
        }
        NodeKind::Extract { path: p, output } => {
            let src = match previous_output {
                Some(s) if !s.trim().is_empty() => s,
                _ => {
                    return Err(Error::Extract("No input: the previous node has no output".into()));
                }
            };
            let rendered_path = parse_and_render(p, vars, cb, &opt).await?;
            let text = if rendered_path.trim().is_empty() {
                src.to_string()
            } else {
                executor.filter(&rendered_path, src, sniff_content_type(src)).await?
            };
            if !output.trim().is_empty() {
                vars.insert(output.clone(), text.clone());
            }
            Ok((true, text))
        }
        NodeKind::Delay { millis } => {
            tokio::time::sleep(std::time::Duration::from_millis(
                (*millis).min(MAX_DELAY_MS).into(),
            ))
            .await;
            Ok((true, previous_output.unwrap_or_default().to_string()))
        }
        // Scheduling belongs to the host; running the node just hands its input on.
        NodeKind::Timer { .. } => Ok((true, previous_output.unwrap_or_default().to_string())),
    }
}

/// Outputs of earlier nodes carry no content type, so guess from the first character.
fn sniff_content_type(content: &str) -> &'static str {
    if content.trim_start().starts_with('<') { "application/xml" } else { "application/json" }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::NodePosition;

    struct NoFns;
    impl TemplateCallback for NoFns {
        async fn run(
            &self,
            _: &str,
            _: HashMap<String, serde_json::Value>,
        ) -> yaak_templates::error::Result<String> {
            Ok(String::new())
        }
        fn transform_arg(
            &self,
            _: &str,
            _: &str,
            v: &str,
        ) -> yaak_templates::error::Result<String> {
            Ok(v.to_string())
        }
    }

    struct Fake(u16, &'static str);
    impl FlowExecutor for Fake {
        async fn send_request(&self, _: &str, _: &HashMap<String, String>) -> Result<HttpOutcome> {
            Ok(HttpOutcome { status: self.0, body: self.1.to_string() })
        }

        /// Stand-in for the plugin filter: treats the filter as a top-level key.
        async fn filter(&self, filter: &str, content: &str, _: &str) -> Result<String> {
            let v: serde_json::Value =
                serde_json::from_str(content).map_err(|e| Error::Extract(e.to_string()))?;
            match v.get(filter) {
                Some(serde_json::Value::String(s)) => Ok(s.clone()),
                Some(v) => Ok(v.to_string()),
                None => Err(Error::Extract("no match".into())),
            }
        }
    }

    fn node(id: &str, op: NodeKind, success: Option<&str>, fail: Option<&str>) -> FlowNode {
        FlowNode {
            id: id.into(),
            title: id.into(),
            position: NodePosition::default(),
            operation: op,
            success: success.map(Into::into),
            fail: fail.map(Into::into),
        }
    }

    fn extract(path: &str) -> NodeKind {
        NodeKind::Extract { path: path.into(), output: "n".into() }
    }

    /// call -> pick(extract "n"); both route failures to `bad`.
    fn flow() -> Flow {
        Flow {
            id: "f".into(),
            name: "f".into(),
            start_node_id: None,
            nodes: vec![
                node(
                    "call",
                    NodeKind::HttpRequest { request_id: "rq_1".into() },
                    Some("pick"),
                    Some("bad"),
                ),
                node("pick", extract("n"), None, Some("bad")),
                node("bad", NodeKind::Timer { interval_secs: 1 }, None, None),
            ],
        }
    }

    fn ids(r: &FlowRunResult) -> Vec<&str> {
        r.runs.iter().map(|r| r.node_id.as_str()).collect()
    }

    #[tokio::test]
    async fn extract_reads_previous_output() {
        let r = run_flow(&flow(), HashMap::new(), &NoFns, &Fake(200, r#"{"n": 9}"#)).await.unwrap();
        assert_eq!(ids(&r), ["call", "pick"]);
        assert_eq!(r.runs[1].output, "9");
        assert_eq!(r.variables["n"], "9");
    }

    #[tokio::test]
    async fn extract_without_input_fails_at_the_node() {
        // Empty body: nothing to read.
        let r = run_flow(&flow(), HashMap::new(), &NoFns, &Fake(200, "")).await.unwrap();
        assert_eq!(ids(&r), ["call", "pick", "bad"]);
        assert!(r.runs[1].error.as_deref().unwrap().contains("No input"));

        // Extract as the first node: there is no previous node at all.
        let mut f = flow();
        f.start_node_id = Some("pick".into());
        let r = run_flow(&f, HashMap::new(), &NoFns, &Fake(200, "{}")).await.unwrap();
        assert_eq!(r.runs[0].status, NodeStatus::Fail);
        assert!(r.runs[0].error.as_deref().unwrap().contains("No input"));
    }

    #[tokio::test]
    async fn failed_request_and_extract_route_to_fail() {
        let r = run_flow(&flow(), HashMap::new(), &NoFns, &Fake(500, "{}")).await.unwrap();
        assert_eq!(ids(&r), ["call", "bad"]);
        let r = run_flow(&flow(), HashMap::new(), &NoFns, &Fake(200, "{}")).await.unwrap();
        assert_eq!(ids(&r), ["call", "pick", "bad"]);
    }

    #[tokio::test]
    async fn timer_passes_input_through() {
        let mut f = flow();
        f.nodes.insert(0, node("tick", NodeKind::Timer { interval_secs: 30 }, Some("call"), None));
        let r = run_flow(&f, HashMap::new(), &NoFns, &Fake(200, r#"{"n": 1}"#)).await.unwrap();
        assert_eq!(ids(&r), ["tick", "call", "pick"]);
        assert_eq!(f.timer_interval_secs(), Some(30));
    }

    #[tokio::test]
    async fn delay_waits_and_passes_input_through() {
        let mut f = flow();
        f.nodes[0].success = Some("wait".into());
        f.nodes.push(node("wait", NodeKind::Delay { millis: 30 }, Some("pick"), None));
        let start = std::time::Instant::now();
        let r = run_flow(&f, HashMap::new(), &NoFns, &Fake(200, r#"{"n": 5}"#)).await.unwrap();
        assert!(start.elapsed() >= std::time::Duration::from_millis(30));
        assert_eq!(ids(&r), ["call", "wait", "pick"]);
        assert_eq!(r.runs[2].output, "5");
    }

    #[tokio::test]
    async fn loop_is_stopped() {
        let mut f = flow();
        f.nodes[2].success = Some("bad".into());
        f.nodes[2].fail = Some("bad".into());
        let r = run_flow(&f, HashMap::new(), &NoFns, &Fake(500, "{}")).await;
        assert!(matches!(r, Err(Error::MaxStepsExceeded(_))));
    }
}
